# On-Device Gemini for Camera Scanners

## Problem

`ChoreScanner.tsx` and `ReceiptScanner.tsx` send a captured photo to a cloud
vision API (`callClaudeVision` / `callGeminiVision` in `src/lib/familyos.ts`)
for structured extraction (chores or pantry items as JSON). This costs money
per scan, requires network, and has per-day rate limits
(`getGeminiDailyUsage`/`resetGeminiCount`). Every Android device running the
Bear House APK ships with Gemini Nano via Google Play services (AICore) —
on capable hardware this inference can run fully on-device, free and
offline.

The initial idea was "use `window.ai`/Chrome's built-in Gemini Nano API."
That doesn't work here: Capacitor's Android build runs pages inside Android
System WebView, a separate OS component from the Chrome app, and WebView
does not expose `window.ai`. The correct on-device path for a native
Capacitor app is Google's **ML Kit GenAI Prompt API**, a Kotlin/Java SDK
that talks to AICore directly — confirmed via Google's docs
(`developers.google.com/ml-kit/genai/prompt/android`) to support:
custom-engineered prompts, combined image+text input, and structured
(JSON) output. This is a different ML Kit API from "Image Description,"
which was initially considered but only produces one fixed-format caption
per image with no custom prompt — not usable for structured extraction.

## Scope

- **In scope:** `ChoreScanner.tsx` and `ReceiptScanner.tsx` gain a third,
  on-device inference path alongside the existing Claude/Gemini cloud
  toggle. Silent fallback to cloud (current default provider) whenever
  on-device is unavailable or fails.
- **Out of scope:** `HermesChat.tsx` and any other AI call site are
  untouched. No changes to the web build — this is native-Android-only.
  No changes to cloud vision behavior, prompts, or rate-limit logic.

## Architecture

```
ReceiptScanner.tsx / ChoreScanner.tsx
        │  callVision(base64, prompt)
        ▼
src/lib/onDeviceVision.ts   (new, thin TS wrapper)
        │  Capacitor.isNativePlatform() ? plugin call : skip
        ▼
OnDeviceGenAI  (new custom Capacitor plugin, @CapacitorPlugin)
        │  Kotlin, android/app/src/main/java/.../OnDeviceGenAIPlugin.kt
        ▼
ML Kit GenAI Prompt API (Generation.getClient() → generateContent())
        │
        ▼
AICore / Gemini Nano (on-device, Google Play services)
```

**Why a custom plugin, not a UI rewrite:** ML Kit GenAI has no JS/web SDK —
it's Kotlin/Java only. A small `@CapacitorPlugin` class is the standard
Capacitor pattern for exposing a native-only API to the existing web
screens without touching their UI. `ChoreScanner.tsx`/`ReceiptScanner.tsx`
keep their current camera capture, review list, and save flow unchanged;
only `callVision`'s implementation gains a new branch.

### New plugin: `OnDeviceGenAI`

- `checkAvailability(): Promise<{status: 'available'|'downloadable'|'downloading'|'unavailable'}>`
  — wraps `generativeModel.checkStatus()`.
- `analyzeImage({ base64Jpeg: string, prompt: string }): Promise<{ text: string }>`
  — decodes the base64 to a `Bitmap`, calls
  `generateContent(generateContentRequest(ImagePart(bitmap), TextPart(prompt)))`,
  returns the raw text response. Reuses the *exact same* `RECEIPT_PROMPT` /
  `SCAN_PROMPT` strings already defined in the two scanner components — no
  new prompt engineering, since ML Kit's Prompt API takes free-form text
  identically to the cloud calls.
- No `downloadFeature` call from the app in v1: if `checkAvailability()`
  returns `downloadable`, treat it the same as `unavailable` and fall back
  to cloud silently. (Triggering a model download is a heavier UX decision
  — a progress UI, when to prompt, Wi-Fi-only option — deferred; see Open
  Questions.)

### `src/lib/onDeviceVision.ts` (new)

```ts
export async function tryOnDeviceVision(
  base64: string, prompt: string
): Promise<{ ok: true; text: string } | { ok: false }> {
  if (!Capacitor.isNativePlatform()) return { ok: false };
  try {
    const avail = await OnDeviceGenAI.checkAvailability();
    if (avail.status !== 'available') return { ok: false };
    const { text } = await OnDeviceGenAI.analyzeImage({ base64Jpeg: base64, prompt });
    return { ok: true, text };
  } catch {
    return { ok: false };
  }
}
```

Every failure path — not native, feature unavailable, download needed,
inference threw — returns `{ ok: false }` uniformly. Callers never branch
on *why* on-device didn't work; they just fall back.

### Call site change (both scanners, same pattern)

`ReceiptScanner.tsx`'s `callVision` (line 104) becomes:

```ts
const callVision = useCallback(async (base64: string) => {
  const onDevice = await tryOnDeviceVision(base64, RECEIPT_PROMPT);
  if (onDevice.ok) return { ok: true, text: onDevice.text };
  if (provider === 'gemini') return callGeminiVision(base64, 'image/jpeg', RECEIPT_PROMPT);
  return callClaudeVision(base64, 'image/jpeg', RECEIPT_PROMPT);
}, [provider]);
```

The existing Claude/Gemini toggle stays as-is and only matters when
on-device isn't available (non-Android, or the device lacks AICore
support) — it becomes the cloud fallback selector rather than the primary
choice. JSON parsing downstream (`analyzeFrame`, lines 119-140) is
untouched: on-device returns the same shape (`{ok, text}`) as the cloud
calls, and the prompt asks for the same JSON contract either way.

### UI change

Minimal: a small badge/label near the provider toggle indicating which
path actually ran ("⚡ On-device" vs "☁️ Gemini" / "☁️ Claude"), set from
which branch `callVision` took. No new buttons, no settings screen, no
user-facing toggle for on-device — it's always tried first automatically
per the "silent fallback" decision already made.

## Data flow / error handling

- Availability check and inference both run off the main thread on the
  native side (ML Kit's client handles this); the plugin bridge is async,
  so the existing `analyzing`/`status` React state in both scanners needs
  no changes.
- If `analyzeImage` throws (model busy, OOM, AICore not installed on this
  specific device despite Play services being present), the wrapper
  catches it and returns `{ok:false}` — falls to cloud exactly like the
  "unavailable" case. No error is surfaced to the user; from their
  perspective a scan just always works, sometimes via a different path.
- Daily Gemini cloud usage counting (`getGeminiDailyUsage`) only increments
  when the cloud path actually runs — on-device successes don't touch it.

## Testing

- Pure-TS `tryOnDeviceVision` branches (native-check, catch-wrapping) are
  testable with a mocked `Capacitor`/plugin import, following this repo's
  existing pattern of testing `src/lib` logic directly (see
  `familyos.pantry.test.ts`).
- The Kotlin plugin itself is not unit-tested (no existing Android test
  setup in this project) — verified manually via the debug APK on a real
  device, since ML Kit GenAI requires actual AICore hardware/software
  support that an emulator may not provide.

## Open Questions (not blocking this spec, flagged for a follow-up decision)

1. **Model download UX** — v1 treats `downloadable` as `unavailable`
   (silent cloud fallback, no download ever triggered). A later iteration
   could add a one-time background `downloadFeature()` call (e.g. on first
   app launch on Wi-Fi) so more devices graduate to on-device over time.
   Not needed for this spec's scope.
2. **Device support is unpredictable** — AICore/Gemini Nano requires
   specific chipsets and a recent Play services version; many Android
   phones (especially older or budget models) will simply always fall back
   to cloud. This is expected and fine given the silent-fallback design,
   but worth setting expectations that "some/most users get free+offline
   scans" rather than "everyone does."

## Out of this session's other audit findings

The broader native/Capacitor audit surfaced several other gaps (push
notifications, background/sync resilience on app-resume, raw
`getUserMedia`/geolocation instead of Capacitor plugins, app name/branding
mismatch). Those are independent of this spec and are not addressed here —
each would need its own scoping conversation given they're unrelated
subsystems, not follow-on work for the Gemini plugin.

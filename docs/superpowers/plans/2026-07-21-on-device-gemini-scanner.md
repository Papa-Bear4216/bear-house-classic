# On-Device Gemini for Camera Scanners Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `ChoreScanner.tsx` and `ReceiptScanner.tsx` a free, offline, on-device Gemini Nano inference path (via Google ML Kit's GenAI Prompt API) that's tried first, silently falling back to the existing cloud Claude/Gemini calls whenever it's unavailable.

**Architecture:** A new Capacitor plugin (`OnDeviceGenAIPlugin.java`) wraps ML Kit's `GenerativeModelFutures` (`Generation.getClient()` → `generateContent()`), registered directly in `MainActivity.onCreate()`. A thin TS wrapper (`src/lib/onDeviceVision.ts`) calls it via the Capacitor bridge and normalizes every failure mode (non-native, unavailable, download-needed, thrown error) into one `{ok:false}` shape. Both scanner components' `callVision` functions try the wrapper first, then fall through to their existing `callGeminiVision`/`callClaudeVision` cloud calls unchanged.

**Tech Stack:** Capacitor 8 (Java plugin bridge), Google ML Kit GenAI Prompt API (`com.google.mlkit:genai-prompt`), TypeScript/React (existing scanner components), Vitest.

## Global Constraints

- Min Android API level for the ML Kit GenAI Prompt API: 26. Project's `minSdkVersion` is already 24 in `android/variables.gradle` — the plugin itself must runtime-guard (`Build.VERSION.SDK_INT >= 26`) rather than raising the app-wide floor, since raising minSdk would drop support for API 24-25 devices app-wide for a feature that already degrades gracefully.
- No custom prompt/UI wording changes: reuse `RECEIPT_PROMPT` (`src/components/familyos/ReceiptScanner.tsx:21`) and `SCAN_PROMPT` (`src/components/familyos/ChoreScanner.tsx:33`) verbatim — do not rewrite them for the on-device path.
- Silent fallback only: the on-device path must never surface an error state to the user. Every failure (unavailable, downloadable, downloading, threw) returns the same `{ok:false}` shape from `tryOnDeviceVision` and callers just proceed to cloud.
- No model download triggered from the app in this plan (`downloadFeature()` is out of scope — see spec's Open Questions).
- Web build must be completely unaffected — `Capacitor.isNativePlatform()` is false there, and `onDeviceVision.ts` must short-circuit before touching any Capacitor plugin import path that could fail to resolve outside Android.

---

## File Structure

- **Create:** `android/app/src/main/java/com/bearhouse/app/OnDeviceGenAIPlugin.java` — the `@CapacitorPlugin`-annotated Java class wrapping ML Kit's GenAI Prompt API.
- **Modify:** `android/app/src/main/java/com/bearhouse/app/MainActivity.java` — register the new plugin in `onCreate()`.
- **Modify:** `android/app/build.gradle` — add the `com.google.mlkit:genai-prompt` dependency.
- **Create:** `src/lib/onDeviceVision.ts` — the TS wrapper (`tryOnDeviceVision`) and the `@capacitor/core` plugin registration (`registerPlugin('OnDeviceGenAI', ...)`).
- **Create:** `src/lib/onDeviceVision.test.ts` — unit tests for `tryOnDeviceVision`'s branching logic, with the plugin call mocked.
- **Modify:** `src/components/familyos/ReceiptScanner.tsx` — `callVision` (line 104) tries on-device first; small "⚡ On-device" badge.
- **Modify:** `src/components/familyos/ChoreScanner.tsx` — `callVision` (line 120) tries on-device first; small "⚡ On-device" badge.

---

## Task 1: TS wrapper — `tryOnDeviceVision`

**Files:**
- Create: `src/lib/onDeviceVision.ts`
- Test: `src/lib/onDeviceVision.test.ts`

**Interfaces:**
- Produces: `tryOnDeviceVision(base64: string, prompt: string): Promise<{ ok: true; text: string; source: 'on-device' } | { ok: false }>` — imported by both scanner components in Task 3.
- Produces: `OnDeviceGenAI` plugin object (via `registerPlugin`) with methods `checkAvailability(): Promise<{ status: 'available' | 'downloadable' | 'downloading' | 'unavailable' }>` and `analyzeImage(opts: { base64Jpeg: string; prompt: string }): Promise<{ text: string }>` — the native side (Task 2) must implement exactly these two method names and shapes.
- Consumes: `Capacitor.isNativePlatform()` from `@capacitor/core` (already a project dependency).

This task is pure TypeScript and fully testable without the native plugin existing yet — the test mocks the registered plugin object directly.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/onDeviceVision.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const isNativePlatform = vi.fn();
const checkAvailability = vi.fn();
const analyzeImage = vi.fn();

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => isNativePlatform() },
  registerPlugin: () => ({ checkAvailability, analyzeImage }),
}));

describe('tryOnDeviceVision', () => {
  beforeEach(() => {
    isNativePlatform.mockReset();
    checkAvailability.mockReset();
    analyzeImage.mockReset();
  });

  it('returns ok:false on web (not native)', async () => {
    isNativePlatform.mockReturnValue(false);
    const { tryOnDeviceVision } = await import('./onDeviceVision');
    const result = await tryOnDeviceVision('base64data', 'prompt');
    expect(result).toEqual({ ok: false });
    expect(checkAvailability).not.toHaveBeenCalled();
  });

  it('returns ok:false when feature is unavailable', async () => {
    isNativePlatform.mockReturnValue(true);
    checkAvailability.mockResolvedValue({ status: 'unavailable' });
    const { tryOnDeviceVision } = await import('./onDeviceVision');
    const result = await tryOnDeviceVision('base64data', 'prompt');
    expect(result).toEqual({ ok: false });
    expect(analyzeImage).not.toHaveBeenCalled();
  });

  it('returns ok:false when feature is downloadable (no download triggered)', async () => {
    isNativePlatform.mockReturnValue(true);
    checkAvailability.mockResolvedValue({ status: 'downloadable' });
    const { tryOnDeviceVision } = await import('./onDeviceVision');
    const result = await tryOnDeviceVision('base64data', 'prompt');
    expect(result).toEqual({ ok: false });
    expect(analyzeImage).not.toHaveBeenCalled();
  });

  it('returns ok:true with text when available and inference succeeds', async () => {
    isNativePlatform.mockReturnValue(true);
    checkAvailability.mockResolvedValue({ status: 'available' });
    analyzeImage.mockResolvedValue({ text: '[{"name":"Milk"}]' });
    const { tryOnDeviceVision } = await import('./onDeviceVision');
    const result = await tryOnDeviceVision('base64data', 'prompt');
    expect(result).toEqual({ ok: true, text: '[{"name":"Milk"}]', source: 'on-device' });
  });

  it('returns ok:false when analyzeImage throws', async () => {
    isNativePlatform.mockReturnValue(true);
    checkAvailability.mockResolvedValue({ status: 'available' });
    analyzeImage.mockRejectedValue(new Error('model busy'));
    const { tryOnDeviceVision } = await import('./onDeviceVision');
    const result = await tryOnDeviceVision('base64data', 'prompt');
    expect(result).toEqual({ ok: false });
  });

  it('returns ok:false when checkAvailability throws', async () => {
    isNativePlatform.mockReturnValue(true);
    checkAvailability.mockRejectedValue(new Error('bridge error'));
    const { tryOnDeviceVision } = await import('./onDeviceVision');
    const result = await tryOnDeviceVision('base64data', 'prompt');
    expect(result).toEqual({ ok: false });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/onDeviceVision.test.ts`
Expected: FAIL — `Cannot find module './onDeviceVision'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/onDeviceVision.ts
import { Capacitor, registerPlugin } from '@capacitor/core';

interface OnDeviceGenAIPlugin {
  checkAvailability(): Promise<{ status: 'available' | 'downloadable' | 'downloading' | 'unavailable' }>;
  analyzeImage(opts: { base64Jpeg: string; prompt: string }): Promise<{ text: string }>;
}

const OnDeviceGenAI = registerPlugin<OnDeviceGenAIPlugin>('OnDeviceGenAI');

export type OnDeviceVisionResult =
  | { ok: true; text: string; source: 'on-device' }
  | { ok: false };

/** Tries on-device Gemini Nano (ML Kit GenAI Prompt API) inference first.
 * Every failure mode (web, unavailable, download-needed, threw) collapses
 * to ok:false uniformly — callers always fall back to cloud, never branch
 * on why on-device didn't work. */
export async function tryOnDeviceVision(base64: string, prompt: string): Promise<OnDeviceVisionResult> {
  if (!Capacitor.isNativePlatform()) return { ok: false };
  try {
    const { status } = await OnDeviceGenAI.checkAvailability();
    if (status !== 'available') return { ok: false };
    const { text } = await OnDeviceGenAI.analyzeImage({ base64Jpeg: base64, prompt });
    return { ok: true, text, source: 'on-device' };
  } catch {
    return { ok: false };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/onDeviceVision.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/onDeviceVision.ts src/lib/onDeviceVision.test.ts
git commit -m "feat(android): add on-device vision TS wrapper with silent fallback"
```

---

## Task 2: Native plugin — `OnDeviceGenAIPlugin.java`

**Files:**
- Create: `android/app/src/main/java/com/bearhouse/app/OnDeviceGenAIPlugin.java`
- Modify: `android/app/src/main/java/com/bearhouse/app/MainActivity.java`
- Modify: `android/app/build.gradle`

**Interfaces:**
- Consumes: nothing from prior tasks (native side is independent of the TS wrapper's existence).
- Produces: a Capacitor plugin named `"OnDeviceGenAI"` exposing `@PluginMethod checkAvailability(PluginCall)` and `@PluginMethod analyzeImage(PluginCall)`, matching the method names and JS-visible result shapes (`{status}` / `{text}`) that `src/lib/onDeviceVision.ts` (Task 1) already calls.

This task has no automated test (no Android unit test harness exists in this project — confirmed via `Glob` during spec research). It is verified via a manual gradle build plus a manual on-device smoke test.

- [ ] **Step 1: Add the ML Kit GenAI Prompt dependency**

Edit `android/app/build.gradle`, in the `dependencies { ... }` block, add:

```gradle
    implementation "com.google.mlkit:genai-prompt:1.0.0-beta1"
```

Add it right after the line `implementation project(':capacitor-android')`.

- [ ] **Step 2: Write the plugin class**

```java
// android/app/src/main/java/com/bearhouse/app/OnDeviceGenAIPlugin.java
package com.bearhouse.app;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.genai.common.FeatureStatus;
import com.google.mlkit.genai.common.GenerativeModelFutures;
import com.google.mlkit.genai.prompt.Generation;
import com.google.mlkit.genai.prompt.GenerateContentRequest;
import com.google.mlkit.genai.prompt.GenerateContentResponse;
import com.google.mlkit.genai.prompt.ImagePart;
import com.google.mlkit.genai.prompt.TextPart;
import com.google.common.util.concurrent.FutureCallback;
import com.google.common.util.concurrent.Futures;

import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "OnDeviceGenAI")
public class OnDeviceGenAIPlugin extends Plugin {

    private final Executor executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void checkAvailability(PluginCall call) {
        if (Build.VERSION.SDK_INT < 26) {
            JSObject result = new JSObject();
            result.put("status", "unavailable");
            call.resolve(result);
            return;
        }
        try {
            GenerativeModelFutures model = GenerativeModelFutures.from(Generation.INSTANCE.getClient());
            Futures.addCallback(model.checkFeatureStatus(), new FutureCallback<Integer>() {
                @Override
                public void onSuccess(Integer status) {
                    JSObject result = new JSObject();
                    result.put("status", statusToString(status));
                    call.resolve(result);
                }

                @Override
                public void onFailure(Throwable t) {
                    JSObject result = new JSObject();
                    result.put("status", "unavailable");
                    call.resolve(result);
                }
            }, executor);
        } catch (Exception e) {
            JSObject result = new JSObject();
            result.put("status", "unavailable");
            call.resolve(result);
        }
    }

    @PluginMethod
    public void analyzeImage(PluginCall call) {
        String base64Jpeg = call.getString("base64Jpeg");
        String prompt = call.getString("prompt");
        if (base64Jpeg == null || prompt == null) {
            call.reject("base64Jpeg and prompt are required");
            return;
        }
        if (Build.VERSION.SDK_INT < 26) {
            call.reject("on-device GenAI requires Android 8.0 (API 26) or higher");
            return;
        }

        try {
            byte[] bytes = Base64.decode(base64Jpeg, Base64.DEFAULT);
            Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bitmap == null) {
                call.reject("could not decode image");
                return;
            }

            GenerativeModelFutures model = GenerativeModelFutures.from(Generation.INSTANCE.getClient());
            GenerateContentRequest request = new GenerateContentRequest.Builder(
                    new ImagePart(bitmap),
                    new TextPart(prompt)
            ).build();

            Futures.addCallback(model.generateContent(request), new FutureCallback<GenerateContentResponse>() {
                @Override
                public void onSuccess(GenerateContentResponse response) {
                    JSObject result = new JSObject();
                    result.put("text", response.getText());
                    call.resolve(result);
                }

                @Override
                public void onFailure(Throwable t) {
                    call.reject("inference failed: " + t.getMessage());
                }
            }, executor);
        } catch (Exception e) {
            call.reject("analyzeImage failed: " + e.getMessage());
        }
    }

    private static String statusToString(int status) {
        if (status == FeatureStatus.AVAILABLE) return "available";
        if (status == FeatureStatus.DOWNLOADABLE) return "downloadable";
        if (status == FeatureStatus.DOWNLOADING) return "downloading";
        return "unavailable";
    }
}
```

- [ ] **Step 3: Register the plugin in `MainActivity.java`**

In `android/app/src/main/java/com/bearhouse/app/MainActivity.java`, add the import and register the plugin before `super.onCreate()` runs the bridge init — Capacitor plugins must be registered in `onCreate` before `super.onCreate(savedInstanceState)`:

```java
package com.bearhouse.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int CAMERA_REQ = 1001;
    private PermissionRequest pendingWebPermission;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(OnDeviceGenAIPlugin.class);
        super.onCreate(savedInstanceState);
        setupCameraForWebView();
    }
```

(Leave the rest of the file — `setupCameraForWebView`, `onRequestPermissionsResult` — unchanged.)

- [ ] **Step 4: Sync and build to verify it compiles**

Run: `npx cap sync android`
Expected: `Found 2 Capacitor plugins for android: @capacitor/app, @capacitor/browser` (the new plugin is a local class, not an npm package, so it won't be listed here — that's expected).

Run: `cd android && ./gradlew assembleDebug`
Expected: `BUILD SUCCESSFUL`. If it fails with an unresolved `com.google.mlkit:genai-prompt` artifact, check that `google()` is listed in `android/build.gradle`'s `allprojects { repositories { ... } }` (it already is, confirmed during spec research) and that the version `1.0.0-beta1` still resolves — if Google has since promoted it past beta, use the latest version shown on `https://developers.google.com/ml-kit/genai/prompt/android/get-started`.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/bearhouse/app/OnDeviceGenAIPlugin.java android/app/src/main/java/com/bearhouse/app/MainActivity.java android/app/build.gradle
git commit -m "feat(android): add native OnDeviceGenAI Capacitor plugin (ML Kit GenAI Prompt API)"
```

---

## Task 3: Wire into `ReceiptScanner.tsx`

**Files:**
- Modify: `src/components/familyos/ReceiptScanner.tsx`

**Interfaces:**
- Consumes: `tryOnDeviceVision` from `src/lib/onDeviceVision.ts` (Task 1) — exact signature `(base64: string, prompt: string) => Promise<{ok:true;text:string;source:'on-device'}|{ok:false}>`.
- Consumes: existing `callClaudeVision`, `callGeminiVision` from `@/lib/familyos` (unchanged).

No new automated test — `callVision` is a thin dispatcher already covered indirectly by the manual scanner testing this repo relies on (no existing test file mocks camera/vision calls in this component). Verified by code review + a manual on-device run in Task 5.

- [ ] **Step 1: Add the import**

In `src/components/familyos/ReceiptScanner.tsx`, add after the existing `@/lib/familyos` import (line 3):

```ts
import { tryOnDeviceVision } from '@/lib/onDeviceVision';
```

- [ ] **Step 2: Add a `usedSource` state and update `callVision`**

Replace the `provider` state declaration area — find:

```ts
  const [provider, setProvider] = useState<Provider>('claude');
```

Add immediately after it:

```ts
  const [lastSource, setLastSource] = useState<'on-device' | 'cloud' | null>(null);
```

Replace the existing `callVision` (lines 104-107):

```ts
  const callVision = useCallback(async (base64: string) => {
    if (provider === 'gemini') return callGeminiVision(base64, 'image/jpeg', RECEIPT_PROMPT);
    return callClaudeVision(base64, 'image/jpeg', RECEIPT_PROMPT);
  }, [provider]);
```

with:

```ts
  const callVision = useCallback(async (base64: string) => {
    const onDevice = await tryOnDeviceVision(base64, RECEIPT_PROMPT);
    if (onDevice.ok) {
      setLastSource('on-device');
      return { ok: true, text: onDevice.text };
    }
    setLastSource('cloud');
    if (provider === 'gemini') return callGeminiVision(base64, 'image/jpeg', RECEIPT_PROMPT);
    return callClaudeVision(base64, 'image/jpeg', RECEIPT_PROMPT);
  }, [provider]);
```

- [ ] **Step 3: Add the source badge next to the provider toggle**

Find the provider toggle block (around line 190-198):

```tsx
            <div className="flex rounded-lg overflow-hidden border border-slate-700">
              {(['gemini', 'claude'] as Provider[]).map((p) => (
                <button key={p} onClick={() => setProvider(p)}
                  className={`text-xs px-3 py-1.5 font-medium transition ${provider === p ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                  {p === 'gemini' ? 'Gemini ✦' : 'Claude'}
                </button>
              ))}
            </div>
```

Add immediately after the closing `</div>` of that block:

```tsx
            {lastSource && (
              <span className="text-xs text-slate-500">
                {lastSource === 'on-device' ? '⚡ On-device' : '☁️ Cloud'}
              </span>
            )}
```

- [ ] **Step 4: Build to verify no type errors**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/familyos/ReceiptScanner.tsx
git commit -m "feat(android): try on-device Gemini first in ReceiptScanner, fall back to cloud"
```

---

## Task 4: Wire into `ChoreScanner.tsx`

**Files:**
- Modify: `src/components/familyos/ChoreScanner.tsx`

**Interfaces:**
- Consumes: `tryOnDeviceVision` from `src/lib/onDeviceVision.ts` (Task 1) — same signature as Task 3.
- Consumes: existing `callClaudeVision`, `callGeminiVision` from `@/lib/familyos` (unchanged).

Same rationale as Task 3: no new automated test, verified by code review + manual on-device run in Task 5.

- [ ] **Step 1: Add the import**

In `src/components/familyos/ChoreScanner.tsx`, add after the existing `@/lib/familyos` import (line 3):

```ts
import { tryOnDeviceVision } from '@/lib/onDeviceVision';
```

- [ ] **Step 2: Add a `lastSource` state and update `callVision`**

Find the `provider` state declaration:

```ts
  const [provider, setProvider] = useState<Provider>('claude');
```

Add immediately after it:

```ts
  const [lastSource, setLastSource] = useState<'on-device' | 'cloud' | null>(null);
```

Replace the existing `callVision` (lines 120-123):

```ts
  const callVision = useCallback(async (base64: string) => {
    if (provider === 'gemini') return callGeminiVision(base64, 'image/jpeg', SCAN_PROMPT);
    return callClaudeVision(base64, 'image/jpeg', SCAN_PROMPT);
  }, [provider]);
```

with:

```ts
  const callVision = useCallback(async (base64: string) => {
    const onDevice = await tryOnDeviceVision(base64, SCAN_PROMPT);
    if (onDevice.ok) {
      setLastSource('on-device');
      return { ok: true, text: onDevice.text };
    }
    setLastSource('cloud');
    if (provider === 'gemini') return callGeminiVision(base64, 'image/jpeg', SCAN_PROMPT);
    return callClaudeVision(base64, 'image/jpeg', SCAN_PROMPT);
  }, [provider]);
```

- [ ] **Step 3: Add the source badge next to the provider toggle**

`ChoreScanner.tsx`'s provider toggle UI lives in the render body further down the file (same pattern as `ReceiptScanner.tsx`, rendered only when not in an active scan). Locate the block rendering `(['gemini', 'claude'] as Provider[]).map(...)` — it is styled identically to the one in `ReceiptScanner.tsx` from Task 3. Add the same badge markup immediately after that block's closing `</div>`:

```tsx
            {lastSource && (
              <span className="text-xs text-slate-500">
                {lastSource === 'on-device' ? '⚡ On-device' : '☁️ Cloud'}
              </span>
            )}
```

- [ ] **Step 4: Build to verify no type errors**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/familyos/ChoreScanner.tsx
git commit -m "feat(android): try on-device Gemini first in ChoreScanner, fall back to cloud"
```

---

## Task 5: Full build verification and manual on-device smoke test

**Files:** none (verification-only task).

**Interfaces:** none — this task consumes the completed app from Tasks 1-4 as a whole.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the 6 new `onDeviceVision.test.ts` tests plus the pre-existing 54.

- [ ] **Step 2: Full web build**

Run: `npm run build`
Expected: `vite build` succeeds, no errors.

- [ ] **Step 3: Sync and build the Android debug APK**

Run: `npx cap sync android`
Run: `cd android && ./gradlew assembleDebug`
Expected: `BUILD SUCCESSFUL`, and `android/app/build/outputs/apk/debug/app-debug.apk` has a fresh timestamp.

- [ ] **Step 4: Install and manually verify on a real device**

Run: `cd android && ./gradlew installDebug` (with a device connected via `adb devices`, or sideload the APK directly).

Manual check (cannot be automated — ML Kit GenAI requires real AICore hardware/software support an emulator may not have):
1. Open the app, navigate to Pantry → Scan Receipt.
2. Point the camera at groceries or a receipt, tap Capture & Extract.
3. Confirm a badge appears next to the provider toggle reading either "⚡ On-device" or "☁️ Cloud" — either is a pass, since device support for on-device inference varies by hardware; what matters is that a scan completes successfully and shows extracted items either way.
4. Repeat in Chores → Chore Scanner with a room scan.
5. If the badge shows "☁️ Cloud" on this device, that confirms the fallback path works correctly (expected outcome on most devices per the spec's Open Questions) — this is not a failure.

- [ ] **Step 5: No commit needed**

This task is verification-only; nothing to commit if all checks pass. If a step fails, return to the relevant task, fix, and re-verify from Step 1.

---

## Self-Review Notes

- **Spec coverage:** Architecture (plugin + wrapper + call-site changes) → Tasks 1-4. Silent fallback behavior → Task 1's test suite + Tasks 3/4's `callVision` rewrites. UI badge → Tasks 3/4 Step 3. Testing section's split (TS unit-tested, Kotlin/Java manually verified) → Task 1 vs. Task 2/5. Global constraint on min API 26 vs. project's minSdk 24 → enforced in Task 2's `Build.VERSION.SDK_INT` guard in both plugin methods.
- **Type consistency:** `tryOnDeviceVision`'s return shape (`{ok:true;text;source:'on-device'}|{ok:false}`) defined in Task 1 is consumed identically in Tasks 3 and 4. The native plugin's JS-visible shapes (`{status}` from `checkAvailability`, `{text}` from `analyzeImage`) match the `OnDeviceGenAIPlugin` TS interface in Task 1 exactly.
- **Deviation from spec:** the spec's architecture sketch showed Kotlin (`OnDeviceGenAIPlugin.kt`); this plan uses Java (`OnDeviceGenAIPlugin.java`) instead, matching the existing `MainActivity.java` and the fact that this Android project has no Kotlin toolchain configured. Functionally identical — the ML Kit GenAI Prompt API's Java surface (`GenerativeModelFutures`, `Futures.addCallback`) was confirmed available during spec research.
- **Deviation from spec:** the spec's `tryOnDeviceVision` sketch didn't include a `source` field; added one here so Tasks 3/4 can drive the "⚡ On-device" vs "☁️ Cloud" badge without re-deriving it, since the spec's UI section explicitly calls for that badge but didn't specify how the call site would know which path ran.

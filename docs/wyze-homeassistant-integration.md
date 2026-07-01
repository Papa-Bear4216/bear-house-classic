# Wyze Camera & Home Assistant OS - Chore Integration Plan

This guide outlines how to integrate your Wyze camera feed (streamed through your headless Home Assistant OS VM) with the Bear House Family OS to automatically detect clutter, populate chore pins on the 3D map, and auto-verify task completions.

---

## 1. Architecture Flow

Since Home Assistant already manages decoding and streaming the Wyze feed, the Next.js app can fetch frame snapshots directly from HA via standard HTTP requests.

```
┌──────────┐      Local Stream      ┌────────────────┐      REST API      ┌───────────────┐
│ Wyze Cam ├───────────────────────►│ Home Assistant ├───────────────────►│ Next.js App   │
└──────────┘                        │ (Go2RTC/Wyze)  │  (Bearer Auth)    │ (API Gateway) │
                                    └────────────────┘                    └───────┬───────┘
                                                                                  │
                                                                                  ▼ Image URI
                                                                          ┌───────────────┐
                                                                          │  Gemini AI    │
                                                                          │ (Vision Diff) │
                                                                          └───────────────┘
```

---

## 2. Prerequisites & Setup

### A. Home Assistant Config
1. Integrate your Wyze Camera into Home Assistant (using [docker-wyze-bridge Add-on](https://github.com/mrlt8/docker-wyze-bridge) or the HACS Wyze Custom Integration).
2. Note your camera entity name (e.g., `camera.kitchen_wyze` or `camera.living_room_wyze`).
3. Generate a **Long-Lived Access Token**:
   - Go to your Home Assistant Profile (click your username in the bottom left).
   - Scroll to the bottom to **Long-Lived Access Tokens**.
   - Click **Create Token** and copy the key.

### B. Environment Configuration
Add the following to your [.env.local](file:///c:/Users/micha/OneDrive/Desktop/projects/bear-house-classic/.env.local) file:
```env
HOME_ASSISTANT_URL=http://<YOUR_HA_IP_ADDRESS>:8123
HOME_ASSISTANT_TOKEN=your_copied_long_lived_access_token_here
```

---

## 3. Next.js Implementation Steps

### Step 1: Create the Snapshot Fetcher Route
Create a new file at `/app/api/wyze/snapshot/route.ts` to request a JPEG image buffer from Home Assistant and convert it to a base64 Data URI that Gemini can read:

```typescript
// app/api/wyze/snapshot/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/server-auth';

export async function GET(req: NextRequest) {
  if (!(await verifyAuth(req))) return unauthorized();

  const haUrl = process.env.HOME_ASSISTANT_URL;
  const token = process.env.HOME_ASSISTANT_TOKEN;
  
  // Get camera entity from query params (e.g., ?entity=camera.kitchen_wyze)
  const { searchParams } = new URL(req.url);
  const cameraEntity = searchParams.get('entity');

  if (!cameraEntity) {
    return NextResponse.json({ error: 'Missing camera entity parameter' }, { status: 400 });
  }

  if (!haUrl || !token) {
    return NextResponse.json({ error: 'Home Assistant environment variables not configured' }, { status: 500 });
  }

  try {
    const haEndpoint = `${haUrl}/api/camera_proxy/${cameraEntity}`;
    const res = await fetch(haEndpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      // Prevent Next.js from caching the live snapshot
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Home Assistant returned status ${res.status}`);
    }

    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const imageUri = `data:image/jpeg;base64,${base64}`;

    return NextResponse.json({ image: imageUri });
  } catch (err: any) {
    return NextResponse.json({ error: `Failed to fetch snapshot: ${err.message}` }, { status: 500 });
  }
}
```

### Step 2: Trigger AI Scan via stationary camera
In your app's frontend scanner component:
1. When a user triggers a camera scan from the map, instead of requesting user camera permissions (`getUserMedia`), hit `/api/wyze/snapshot?entity=camera.kitchen_wyze` to fetch the base64 snapshot.
2. Pipe this base64 image data directly into `/api/scan-room` (Gemini Vision API) to identify chores.

### Step 3: Mapping Coordinates to the 3D Map
Since the camera is stationary, the physical coordinates of items in the frame map directly to static regions in the room:
- Define coordinate bounds inside `house.json` for major zones (e.g., `Kitchen Countertop` = `x: 50, y: 30`).
- When Gemini identifies a chore in a zone, map it to the predefined coordinate to display the floating quest marker on the 3D floorplan.

### Step 4: Auto-Verify completions
Implement a **Verify via Wyze** action:
1. The user taps "Verify Chores".
2. The app requests a fresh snapshot via Home Assistant.
3. Gemini compares it with the clean baseline.
4. If the diff matches the clean baseline, the chore is completed automatically!

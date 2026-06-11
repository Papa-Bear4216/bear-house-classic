export type Beacon = {
  id: string;
  name: string;
  type: 'wifi' | 'bluetooth';
  x: number; // position on map coordinates
  y: number;
  macOrUuid: string;
  rssi?: number;
};

// Log-distance path loss model: RSSI = -10 * n * log10(d) + A
// d = 10 ^ ((A - RSSI) / (10 * n))
export function rssiToDistance(rssi: number, txPower: number = -50, pathLossExponent: number = 2.5): number {
  if (rssi >= 0) return 0;
  return Math.pow(10, (txPower - rssi) / (10 * pathLossExponent));
}

export function distanceToRssi(distance: number, txPower: number = -50, pathLossExponent: number = 2.5): number {
  if (distance <= 0) return txPower;
  return -10 * pathLossExponent * Math.log10(distance) + txPower;
}

// Calculate position using Weighted Centroid Indoor Localization
export function calculateLocation(beacons: Beacon[]): { x: number; y: number } | null {
  const activeBeacons = beacons.filter(b => b.rssi !== undefined && b.rssi > -100);
  if (activeBeacons.length === 0) return null;

  // For a single beacon, just place on it
  if (activeBeacons.length === 1) {
    return { x: activeBeacons[0].x, y: activeBeacons[0].y };
  }

  let totalWeight = 0;
  let weightedX = 0;
  let weightedY = 0;

  activeBeacons.forEach(b => {
    // Weight is higher for stronger signals (e.g. RSSI closer to 0)
    // We map RSSI -90..-30 to weight 1..100
    const rawRssi = b.rssi || -100;
    const distance = rssiToDistance(rawRssi);
    // Weight = 1 / d^2 to favor closer beacons strongly
    const weight = 1 / Math.max(0.01, Math.pow(distance, 2));
    
    weightedX += b.x * weight;
    weightedY += b.y * weight;
    totalWeight += weight;
  });

  return {
    x: weightedX / totalWeight,
    y: weightedY / totalWeight
  };
}

// Check if running inside Capacitor Android container
export function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as any;
  return !!(win.Capacitor && win.Capacitor.isNative);
}

// Native Scanning interface
export async function startNativeBleScan(onDeviceFound: (device: { name: string; id: string; rssi: number }) => void) {
  if (!isCapacitorNative()) {
    console.log("Not running in native container, using web simulation.");
    return null;
  }

  try {
    const win = window as any;
    const BleClient = win.Capacitor.Plugins.BleClient;
    if (!BleClient) {
      console.warn("Capacitor BleClient plugin not found.");
      return null;
    }

    await BleClient.initialize();
    await BleClient.requestLEScan(
      {},
      (result: any) => {
        if (result && result.device) {
          onDeviceFound({
            name: result.device.name || 'Unknown Beacon',
            id: result.device.deviceId,
            rssi: result.rssi || -100
          });
        }
      }
    );
    
    return async () => {
      await BleClient.stopLEScan();
    };
  } catch (err) {
    console.error("Error starting native BLE scan:", err);
    return null;
  }
}

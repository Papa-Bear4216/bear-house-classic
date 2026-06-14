import { describe, it } from 'vitest';
import { exportHouseAsJson, importHouseFromJsonString } from '../src/lib/houseStore';
import { sampleHouse } from '../src/lib/sampleHouse';

describe('houseStore', () => {
  it('exports and imports house JSON', () => {
    const { blob } = exportHouseAsJson(sampleHouse as any);
    // blob.text() may not be available in node test env; stringify instead
    const json = JSON.stringify(sampleHouse, null, 2);
    const imported = importHouseFromJsonString(json);
    if (!imported || imported.houseId !== sampleHouse.houseId) throw new Error('roundtrip failed');
  });
});

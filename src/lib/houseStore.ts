import type { House } from './houseTypes';
import Ajv from 'ajv';
import schema from '../../house.schema.json';

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema as any);

export function saveHouseToLocalStorage(h: House) {
  try {
    localStorage.setItem('bearhouse_house', JSON.stringify(h));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadHouseFromLocalStorage(): House | null {
  try {
    const s = localStorage.getItem('bearhouse_house');
    if (!s) return null;
    const parsed = JSON.parse(s);
    if (!validate(parsed)) throw new Error('Invalid house data');
    return parsed as House;
  } catch (e) {
    return null;
  }
}

export function exportHouseAsJson(h: House) {
  const blob = new Blob([JSON.stringify(h, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  return { url, blob };
}

export function importHouseFromJsonString(s: string): House {
  const parsed = JSON.parse(s);
  if (!validate(parsed)) throw new Error('Imported house JSON does not match schema');
  return parsed as House;
}

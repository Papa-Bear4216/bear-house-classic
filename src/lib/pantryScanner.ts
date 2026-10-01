// src/lib/pantryScanner.ts
// Vision OCR Parsing and Pantry Ingest Logic for Receipts and Shelf Photos
import { type PantryCategory, uid } from './familyos';

export type ScanMode = 'receipt' | 'shelf';

export interface ScannedPantryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: PantryCategory;
  selected: boolean;
}

export const VALID_PANTRY_CATEGORIES: PantryCategory[] = [
  'produce',
  'meat',
  'dairy',
  'bakery',
  'pantry',
  'frozen',
  'beverages',
  'household',
  'personal-care',
  'other',
];

export const RECEIPT_PROMPT = `You are analyzing a grocery receipt or purchase record. Extract all food items, household goods, quantities, and appropriate categories.
Return ONLY a valid JSON array (no markdown, no preamble) in this exact format:
[{"name":"Whole Milk","quantity":1,"unit":"gallon","category":"dairy"},{"name":"Bananas","quantity":6,"unit":"","category":"produce"}]

Valid categories: produce, meat, dairy, bakery, pantry, frozen, beverages, household, personal-care, other
If nothing is identifiable, return: []`;

export const SHELF_PROMPT = `You are analyzing a photo of a pantry shelf, refrigerator, cupboard, or kitchen food inventory.
Identify all visible food packages, canned goods, spices, snacks, produce, and staple ingredients.
Estimate realistic counts/quantities and appropriate pantry categories.
Return ONLY a valid JSON array (no markdown, no preamble) in this exact format:
[{"name":"Black Beans (Can)","quantity":2,"unit":"cans","category":"pantry"},{"name":"Oat Milk","quantity":1,"unit":"carton","category":"dairy"}]

Valid categories: produce, meat, dairy, bakery, pantry, frozen, beverages, household, personal-care, other
If nothing is identifiable, return: []`;

/**
 * Parses raw vision model output into validated ScannedPantryItem objects.
 */
export function parseVisionPantryItems(rawText: string): ScannedPantryItem[] {
  const clean = (rawText || '').trim();
  if (!clean) return [];

  // Extract JSON payload: try fenced markdown first, then balanced array brackets
  let jsonStr = clean;
  const fenceMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  } else {
    const start = clean.indexOf('[');
    const end = clean.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
      jsonStr = clean.slice(start, end + 1);
    }
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];

    const seenNames = new Set<string>();
    const items: ScannedPantryItem[] = [];

    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const rawName = (item as { name?: unknown }).name;
      if (typeof rawName !== 'string') continue;
      const trimmedName = rawName.trim().slice(0, 120);
      if (!trimmedName) continue;

      const normName = trimmedName.toLowerCase();
      if (seenNames.has(normName)) continue;
      seenNames.add(normName);

      const rawCat = (item as { category?: unknown }).category;
      const catStr = typeof rawCat === 'string' ? rawCat.trim().toLowerCase() : '';
      const category: PantryCategory = VALID_PANTRY_CATEGORIES.includes(catStr as PantryCategory)
        ? (catStr as PantryCategory)
        : 'other';

      const rawQty = (item as { quantity?: unknown }).quantity;
      const qtyNum = typeof rawQty === 'number' ? rawQty : parseFloat(String(rawQty ?? ''));
      const quantity = isNaN(qtyNum) || qtyNum <= 0 ? 1 : Math.min(9999, Math.round(qtyNum * 10) / 10);

      const rawUnit = (item as { unit?: unknown }).unit;
      const unit = typeof rawUnit === 'string' ? rawUnit.trim().slice(0, 20) : '';

      items.push({
        id: uid(),
        name: trimmedName,
        quantity,
        unit,
        category,
        selected: true,
      });
    }

    return items;
  } catch {
    return [];
  }
}

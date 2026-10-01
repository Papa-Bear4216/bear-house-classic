import { describe, it, expect } from 'vitest';
import {
  parseVisionPantryItems,
  RECEIPT_PROMPT,
  SHELF_PROMPT,
  type ScannedPantryItem,
} from './pantryScanner';
import { mergeIntoPantry, type PantryItem } from './familyos';

describe('Pantry Scanner - Vision Parsing & Ingest', () => {
  it('parses valid JSON array of scanned items', () => {
    const raw = `[
      {"name":"Organic Apples","quantity":4,"unit":"","category":"produce"},
      {"name":"Almond Milk","quantity":2,"unit":"cartons","category":"dairy"}
    ]`;

    const items: ScannedPantryItem[] = parseVisionPantryItems(raw);
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe('Organic Apples');
    expect(items[0].quantity).toBe(4);
    expect(items[0].category).toBe('produce');
    expect(items[0].selected).toBe(true);

    expect(items[1].name).toBe('Almond Milk');
    expect(items[1].unit).toBe('cartons');
    expect(items[1].category).toBe('dairy');
  });

  it('strips markdown code blocks and preambles from model output', () => {
    const raw = `Here is what I detected from the receipt:
\`\`\`json
[
  {"name":"Eggs (Dozen)","quantity":1,"unit":"carton","category":"dairy"},
  {"name":"Sourdough Bread","quantity":2,"unit":"loaves","category":"bakery"}
]
\`\`\`
Hope this helps!`;

    const items = parseVisionPantryItems(raw);
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe('Eggs (Dozen)');
    expect(items[1].name).toBe('Sourdough Bread');
    expect(items[1].category).toBe('bakery');
  });

  it('handles non-string or unknown categories gracefully without throwing', () => {
    const raw = `[
      {"name":"Mystery Item 1","quantity":1,"unit":"","category":"unknown-alien-food"},
      {"name":"Mystery Item 2","quantity":2,"unit":"","category":123},
      {"name":"Mystery Item 3","quantity":3,"unit":"","category":["weird","array"]}
    ]`;
    const items = parseVisionPantryItems(raw);
    expect(items).toHaveLength(3);
    expect(items[0].category).toBe('other');
    expect(items[1].category).toBe('other');
    expect(items[2].category).toBe('other');
  });

  it('handles negative, zero, and string quantities safely and clamps max', () => {
    const raw = `[
      {"name":"Zero item","quantity":0,"category":"pantry"},
      {"name":"Negative item","quantity":-5,"category":"pantry"},
      {"name":"String item","quantity":"many","category":"produce"},
      {"name":"Large item","quantity":50000,"category":"pantry"}
    ]`;
    const items = parseVisionPantryItems(raw);
    expect(items).toHaveLength(4);
    expect(items[0].quantity).toBe(1);
    expect(items[1].quantity).toBe(1);
    expect(items[2].quantity).toBe(1);
    expect(items[3].quantity).toBe(9999);
  });

  it('deduplicates repeat items by name', () => {
    const raw = `[
      {"name":"Whole Milk","quantity":1,"unit":"gallon","category":"dairy"},
      {"name":"whole milk","quantity":2,"unit":"gallon","category":"dairy"}
    ]`;
    const items = parseVisionPantryItems(raw);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Whole Milk');
  });

  it('returns empty array on invalid or empty responses', () => {
    expect(parseVisionPantryItems('')).toEqual([]);
    expect(parseVisionPantryItems('No items detected in photo.')).toEqual([]);
    expect(parseVisionPantryItems('{"error": "bad request"}')).toEqual([]);
  });

  it('merges receipt purchases additively into existing stock', () => {
    const existingPantry: PantryItem[] = [
      { id: 'p1', name: 'Almond Milk', quantity: 1, unit: 'cartons', category: 'dairy', updatedAt: 0 },
    ];

    const raw = `[
      {"name":"Almond Milk","quantity":2,"unit":"cartons","category":"dairy"},
      {"name":"Peanut Butter","quantity":1,"unit":"jar","category":"pantry"}
    ]`;

    const scanned = parseVisionPantryItems(raw);
    const updatedPantry = mergeIntoPantry(existingPantry, scanned, 'receipt');

    expect(updatedPantry).toHaveLength(2);
    const milk = updatedPantry.find((i) => i.name === 'Almond Milk');
    expect(milk?.quantity).toBe(3); // 1 + 2

    const pb = updatedPantry.find((i) => i.name === 'Peanut Butter');
    expect(pb?.quantity).toBe(1);
    expect(pb?.category).toBe('pantry');
  });

  it('reconciles shelf snapshot with max quantity instead of inflating stock', () => {
    const existingPantry: PantryItem[] = [
      { id: 'p1', name: 'Almond Milk', quantity: 2, unit: 'cartons', category: 'dairy', updatedAt: 0 },
    ];

    const raw = `[
      {"name":"Almond Milk","quantity":2,"unit":"cartons","category":"dairy"}
    ]`;

    const scanned = parseVisionPantryItems(raw);
    const updatedPantry = mergeIntoPantry(existingPantry, scanned, 'shelf');

    expect(updatedPantry).toHaveLength(1);
    expect(updatedPantry[0].quantity).toBe(2); // does NOT inflate to 4
  });

  it('includes proper instructions in vision prompts', () => {
    expect(RECEIPT_PROMPT).toContain('grocery receipt');
    expect(RECEIPT_PROMPT).toContain('JSON array');
    expect(SHELF_PROMPT).toContain('pantry shelf');
    expect(SHELF_PROMPT).toContain('JSON array');
  });
});

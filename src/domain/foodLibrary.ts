import type { FoodMacros, ISODateTime, SavedFood } from './types';

/**
 * Where a food can come from, and how the three sources are searched together.
 *
 * Three, deliberately:
 *
 *  - **bundled** — staples that ship with the app and work offline forever.
 *    Generic foods with published values, not brands.
 *  - **custom** — anything the athlete typed in themselves. These are the
 *    ones they actually eat, so they outrank everything.
 *  - **scanned** — a barcode they met once and named. The app remembers the
 *    code, so the second tin of the same beans is one scan and no typing.
 *
 * None of this needs a network. That matters more than it sounds: a food
 * search that fails in a supermarket basement is a food search nobody trusts,
 * and the gap this fills is the app's largest.
 */

export type FoodSource = 'bundled' | 'custom' | 'scanned';

export interface LibraryFood extends SavedFood {
  source: FoodSource;
  /** EAN-13, UPC-A or whatever the scanner read. Only on scanned foods. */
  barcode?: string;
  /** How many times it has been logged, for ranking. */
  uses?: number;
  lastUsedAt?: ISODateTime;
  /** True when the athlete entered the macros rather than reading them off a label. */
  estimated?: boolean;
}

// ------------------------------------------------------------- ranking ----

const norm = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * How well one food answers a query.
 *
 * Mirrors the app's existing search ranking on purpose — prefix beats word
 * start beats substring — with two additions that matter for food: a brand
 * matches as well as a name, and something logged fifty times outranks
 * something never logged. Nobody searching "chick" wants a chickpea ahead of
 * the chicken breast they eat four times a week.
 */
export function scoreFood(food: LibraryFood, query: string): number {
  const q = norm(query);
  if (!q) return 0;

  const fields: [string, number][] = [
    [norm(food.name), 1],
    [norm(food.brand ?? ''), 0.75],
  ];

  let best = 0;
  for (const [field, weight] of fields) {
    if (!field) continue;
    let score = 0;
    if (field === q) score = 100;
    else if (field.startsWith(q)) score = 70;
    else if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(field)) score = 50;
    // A one- or two-character substring is noise: "ba" sits inside "kebab".
    else if (q.length > 2 && field.includes(q)) score = 25;
    best = Math.max(best, score * weight);
  }
  if (best === 0) return 0;

  // Your own foods first, then things you have logged before, then the rest.
  const sourceBonus = food.source === 'custom' ? 12 : food.source === 'scanned' ? 8 : 0;
  const useBonus = Math.min(15, Math.log2((food.uses ?? 0) + 1) * 5);
  // Shorter names win ties: "Egg" is the more literal answer to "egg" than
  // "Egg Fried Rice" is.
  const brevity = Math.max(0, 6 - food.name.length / 10);

  return best + sourceBonus + useBonus + brevity;
}

export function searchLibrary(foods: LibraryFood[], query: string, limit = 25): LibraryFood[] {
  if (!query.trim()) {
    // With no query, show what they actually eat rather than an alphabet.
    return [...foods]
      .sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0) || a.name.localeCompare(b.name))
      .slice(0, limit);
  }
  return foods
    .map((f) => ({ f, s: scoreFood(f, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.f);
}

/** The food a barcode belongs to, if the app has met it before. */
export function findByBarcode(foods: LibraryFood[], barcode: string): LibraryFood | null {
  const code = normaliseBarcode(barcode);
  if (!code) return null;
  return foods.find((f) => f.barcode && normaliseBarcode(f.barcode) === code) ?? null;
}

/**
 * Put a scanned code into a comparable form.
 *
 * A UPC-A read off a US tin is the same product as the EAN-13 printed on the
 * European one, with a leading zero. Storing them as-is means the same jar of
 * peanut butter is two entries depending on which shop it came from.
 */
export function normaliseBarcode(raw: string): string {
  const digits = raw.replace(/\D+/g, '');
  if (digits.length === 12) return `0${digits}`;
  return digits;
}

/** Whether a scanned string is plausibly a product code at all. */
export function isProductBarcode(raw: string): boolean {
  const digits = raw.replace(/\D+/g, '');
  return digits.length === 8 || digits.length === 12 || digits.length === 13 || digits.length === 14;
}

// ------------------------------------------------------------ portions ----

export interface Portion {
  label: string;
  /** What to multiply the stored serving by. */
  multiplier: number;
}

/**
 * The fractions people actually eat.
 *
 * Offered rather than a number pad because "half" and "one and a half" are
 * most of real logging, and a keyboard for 0.5 is three taps and a decision
 * about precision nobody wants to make about a yoghurt.
 */
export const PORTIONS: Portion[] = [
  { label: '¼', multiplier: 0.25 },
  { label: '½', multiplier: 0.5 },
  { label: '¾', multiplier: 0.75 },
  { label: '1', multiplier: 1 },
  { label: '1½', multiplier: 1.5 },
  { label: '2', multiplier: 2 },
  { label: '3', multiplier: 3 },
];

/**
 * Scaling lives in `nutrition`, which the rest of the app already uses.
 * Re-exported here so a portion picker does not have to know that, and so
 * there is exactly one implementation to get wrong.
 */
export { scaleMacros } from './nutrition';

// ------------------------------------------------------------ checking ----

export interface MacroProblem {
  field: string;
  message: string;
}

/**
 * Whether typed-in macros hold together.
 *
 * Protein and carbohydrate are about four calories a gram, fat about nine.
 * If the macros and the calorie figure disagree badly, one of them is a typo
 * — and a food entered wrong is worse than one not entered, because it is
 * silently wrong every time it is logged from then on.
 *
 * The tolerance is wide on purpose. Labels round, fibre and alcohol are not
 * in the four-four-nine model, and nagging about a 6% discrepancy would
 * train people to ignore the warning that matters.
 */
export function checkMacros(food: FoodMacros): MacroProblem[] {
  const problems: MacroProblem[] = [];
  const fields: [keyof FoodMacros, string][] = [
    ['calories', 'Calories'], ['proteinG', 'Protein'], ['carbsG', 'Carbs'], ['fatG', 'Fat'],
  ];

  for (const [key, label] of fields) {
    const v = food[key];
    if (v == null) continue;
    if (!Number.isFinite(v) || v < 0) problems.push({ field: key, message: `${label} cannot be ${v}.` });
    if (typeof v === 'number' && v > 10_000) problems.push({ field: key, message: `${label} of ${v} is not a serving.` });
  }
  if (problems.length > 0) return problems;

  const fromMacros = food.proteinG * 4 + food.carbsG * 4 + food.fatG * 9;
  if (food.calories > 0 && fromMacros > 0) {
    const off = Math.abs(fromMacros - food.calories) / food.calories;
    if (off > 0.25) {
      problems.push({
        field: 'calories',
        message: `Those macros work out at about ${Math.round(fromMacros)} kcal, not ${Math.round(food.calories)}. One of the two is probably a typo — a food entered wrong stays wrong every time you log it.`,
      });
    }
  }

  return problems;
}

/** Calories implied by the macros, for filling the field in. */
export function caloriesFromMacros(food: Omit<FoodMacros, 'calories'>): number {
  return Math.round(food.proteinG * 4 + food.carbsG * 4 + food.fatG * 9);
}

export const FOOD_LIBRARY_NOTE =
  'Everything here is on your device: the staples that ship with the app, anything you have typed in, and any barcode you have named. It works in a basement with no signal, which is where half of food logging happens.';

export const BARCODE_NOTE =
  'The app has no product database behind it, so the first time it meets a barcode it asks you what it is. After that the same code is one scan. Your list is yours — it is in your export and it is not sent anywhere.';

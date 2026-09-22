import type { FoodMacros } from './types';
import { normaliseBarcode } from './foodLibrary';

/**
 * Turning an Open Food Facts product into a food this app can log.
 *
 * Open Food Facts is a public, collaboratively edited database of packaged
 * food. No key, no account, no rate-limit negotiation — the only obligation
 * is an honest User-Agent so they can see who is calling.
 *
 * Written against the OpenAPI-generated types in their official Node SDK
 * (openfoodfacts/openfoodfacts-nodejs), not from memory. Three things in
 * those types decide everything below:
 *
 *  1. Nutrient values appear both bare and suffixed. Their own documentation
 *     says to use the `_100g` and `_serving` suffixed fields, "as they are
 *     always in the same standard unit, for a specific quantity". The bare
 *     `nutriments.proteins` means per 100g *or* per serving depending on the
 *     `nutrition_data_per` field, which is exactly the trap that produces a
 *     meal logged at a third of its real size.
 *  2. Energy has three spellings — `energy-kcal`, `energy-kj` and `energy` —
 *     and `energy` is in kilojoules. Reading it as calories under-reports by
 *     a factor of about 4.2.
 *  3. Everything is optional. It is a wiki: plenty of products have a name
 *     and a photograph and no nutrition at all.
 */

// ------------------------------------------------- their shape, trimmed ----

/** Only the fields this app reads. Theirs has several hundred. */
export interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  generic_name?: string;
  brands?: string;
  quantity?: string;
  serving_size?: string;
  serving_quantity?: string | number;
  nutrition_data_per?: '100g' | 'serving' | string;
  nutriments?: Record<string, unknown>;
}

export interface OffResponse {
  status?: 0 | 1;
  status_verbose?: string;
  code?: string;
  product?: OffProduct;
}

// ---------------------------------------------------------- our result ----

export type LookupResult =
  | { kind: 'found'; product: FoundProduct }
  | { kind: 'not_found'; barcode: string }
  | { kind: 'no_nutrition'; barcode: string; name: string | null }
  | { kind: 'unreachable'; reason: string };

export interface FoundProduct {
  barcode: string;
  name: string;
  brand: string | null;
  /** The label this serving's numbers describe, e.g. "30 g" or "100 g". */
  servingLabel: string;
  macros: FoodMacros;
  /** True when the numbers are per 100 g because there was no serving size. */
  per100g: boolean;
  /** Missing values the caller should ask about rather than assume are zero. */
  missing: string[];
}

function num(value: unknown): number | null {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Calories for a basis, trying each spelling in the order that cannot lie.
 *
 * `energy-kcal_*` is unambiguous. `energy-kj_*` is unambiguous and converts.
 * `energy_*` is kilojoules per their schema — used last, and converted, never
 * read as calories.
 */
export function kcalFor(nutriments: Record<string, unknown>, basis: '100g' | 'serving'): number | null {
  const kcal = num(nutriments[`energy-kcal_${basis}`]);
  if (kcal != null) return kcal;

  const kj = num(nutriments[`energy-kj_${basis}`]) ?? num(nutriments[`energy_${basis}`]);
  // 1 kcal = 4.184 kJ.
  return kj != null ? Math.round(kj / 4.184) : null;
}

/**
 * Which basis to read, and what to call it.
 *
 * Per-serving is preferred when the product declares one, because that is
 * the number on the packet and the portion a person actually eats. A product
 * with no serving size falls back to 100 g and says so, so the portion picker
 * can start at something sensible rather than silently logging one gram.
 */
export function chooseBasis(product: OffProduct): { basis: '100g' | 'serving'; label: string } {
  const n = product.nutriments ?? {};
  const hasServing = Object.keys(n).some((k) => k.endsWith('_serving') && num(n[k]) != null);
  const size = (product.serving_size ?? '').trim();

  if (hasServing && size) return { basis: 'serving', label: size };
  if (hasServing) return { basis: 'serving', label: '1 serving' };
  return { basis: '100g', label: '100 g' };
}

/**
 * A product, or a reason there isn't one.
 *
 * `status: 0` is their "no such barcode", and it is a *200 response* — a
 * client that only checks the HTTP status treats a miss as a hit and then
 * reads undefined fields as zeroes.
 */
export function readProduct(body: OffResponse, requested: string): LookupResult {
  const barcode = normaliseBarcode(body.code ?? requested) || requested;

  if (body.status === 0 || !body.product) {
    return { kind: 'not_found', barcode };
  }

  const p = body.product;
  const name = (p.product_name || p.product_name_en || p.generic_name || '').trim();
  const nutriments = p.nutriments ?? {};

  const { basis, label } = chooseBasis(p);
  const calories = kcalFor(nutriments, basis);
  const proteinG = num(nutriments[`proteins_${basis}`]);
  const carbsG = num(nutriments[`carbohydrates_${basis}`]);
  const fatG = num(nutriments[`fat_${basis}`]);
  const fiberG = num(nutriments[`fiber_${basis}`]);

  // A product with a name and no numbers is extremely common — it is a wiki,
  // and somebody photographing a packet is a contribution too. Saying so
  // beats logging a zero-calorie biscuit.
  if (calories == null && proteinG == null && carbsG == null && fatG == null) {
    return { kind: 'no_nutrition', barcode, name: name || null };
  }

  const missing: string[] = [];
  if (calories == null) missing.push('calories');
  if (proteinG == null) missing.push('protein');
  if (carbsG == null) missing.push('carbs');
  if (fatG == null) missing.push('fat');

  return {
    kind: 'found',
    product: {
      barcode,
      name: name || `Product ${barcode}`,
      brand: (p.brands ?? '').split(',')[0]?.trim() || null,
      servingLabel: label,
      macros: {
        // A missing value becomes zero here only after `missing` has recorded
        // it, so the screen can mark the field rather than present a guess as
        // a reading.
        calories: Math.round(calories ?? 0),
        proteinG: round1(proteinG ?? 0),
        carbsG: round1(carbsG ?? 0),
        fatG: round1(fatG ?? 0),
        ...(fiberG != null ? { fiberG: round1(fiberG) } : null),
      },
      per100g: basis === '100g',
      missing,
    },
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The fields to ask for.
 *
 * Their API returns several hundred per product — ingredients, images,
 * ecoscore, knowledge panels, the lot. Asking for six makes the response a
 * couple of kilobytes instead of a couple of hundred, which on a phone in a
 * supermarket is the difference between instant and a spinner.
 */
export const REQUESTED_FIELDS = [
  'code',
  'product_name',
  'product_name_en',
  'generic_name',
  'brands',
  'quantity',
  'serving_size',
  'nutrition_data_per',
  'nutriments',
].join(',');

export function lookupUrl(barcode: string, base = 'https://world.openfoodfacts.org'): string {
  const code = normaliseBarcode(barcode);
  return `${base.replace(/\/+$/, '')}/api/v2/product/${encodeURIComponent(code)}.json?fields=${REQUESTED_FIELDS}`;
}

export const OFF_NOTE =
  'Open Food Facts is a public database of packaged food, edited by the people who use it. No account and no key — the app just asks. Because anyone can edit it, a figure can be wrong or missing, so anything it hands back is shown for checking against the packet before it is saved.';

export const OFF_ATTRIBUTION = 'Product data from Open Food Facts, licensed under the Open Database License.';

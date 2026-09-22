import type { FoodMacros } from './types';
import { round } from './units';

/**
 * USDA FoodData Central.
 *
 * The reference nutrient database for whole foods: laboratory-analysed,
 * versioned, and far more trustworthy than a crowd-edited wiki for the things
 * people actually cook with. It complements Open Food Facts rather than
 * replacing it — OFF knows what is in a packet with a barcode on it, FDC knows
 * what is in a chicken breast.
 *
 * Written against the current v1 schema as a maintained client uses it, not
 * from memory. Four things in that schema decide everything below, and three
 * of them are traps:
 *
 *  1. **Search and detail return different nutrient shapes.** A search hit has
 *     flat `{nutrientId, nutrientName, value, unitName}`; a detail response
 *     nests it as `{nutrient: {id, name, unitName}, amount}`. Reading a detail
 *     response with the search reader yields nothing at all — not an error, an
 *     empty macro set, which logs as a zero-calorie meal.
 *  2. **Energy has three nutrient ids.** 1008 is "Energy", but Foundation
 *     foods frequently carry only the Atwater variants, 2047 and 2048. A
 *     reader that knows just 1008 silently returns no calories for a large
 *     part of the database. Energy is also sometimes reported in kJ.
 *  3. **Branded values are per 100 g even when a serving size is declared.**
 *     The `servingSize` field is the label's portion; the numbers in
 *     `foodNutrients` are not on that basis. Multiplying is required, and
 *     forgetting to is how a 55 g serving gets logged as 100 g.
 *  4. Everything is optional. A search hit's `foodNutrients` is documented as
 *     a preview and is explicitly not guaranteed complete, so a hit that looks
 *     empty is a reason to fetch the detail, not a reason to log zeroes.
 *
 * The API key never reaches the app. FDC keys are per-caller rate limited, so
 * one compiled into a bundle is everybody's quota; reads go through the same
 * server that proxies everything else.
 */

// ------------------------------------------------- their shape, trimmed ----

/** A nutrient as a *search* hit reports it: flat. */
export interface UsdaSearchNutrient {
  nutrientId?: number;
  nutrientName?: string;
  unitName?: string;
  value?: number;
}

/** A nutrient as a *detail* response reports it: nested under `nutrient`. */
export interface UsdaDetailNutrient {
  nutrient?: { id?: number; name?: string; number?: string; unitName?: string };
  amount?: number;
}

export type UsdaNutrient = UsdaSearchNutrient & UsdaDetailNutrient;

export type UsdaDataType = 'SR Legacy' | 'Foundation' | 'Survey (FNDDS)' | 'Branded';

export interface UsdaPortion {
  gramWeight?: number;
  modifier?: string;
  portionDescription?: string;
  measureUnit?: { name?: string; abbreviation?: string };
}

export interface UsdaFood {
  fdcId?: number;
  description?: string;
  dataType?: string;
  foodCategory?: string | { description?: string };
  brandOwner?: string;
  brandName?: string;
  gtinUpc?: string;
  /** Branded only: the label's portion, in `servingSizeUnit`. */
  servingSize?: number;
  servingSizeUnit?: string;
  /** Branded only: how the label words that portion, e.g. "1 cup". */
  householdServingFullText?: string;
  foodNutrients?: UsdaNutrient[];
  foodPortions?: UsdaPortion[];
}

export interface UsdaSearchResponse {
  totalHits?: number;
  currentPage?: number;
  totalPages?: number;
  foods?: UsdaFood[];
}

// ------------------------------------------------------- nutrient ids ------

/**
 * Energy, in the order worth trying.
 *
 * 1008 first because it is what most records carry. 2047 and 2048 are the
 * Atwater general and specific factor calculations, and on Foundation foods
 * they are often the only energy present.
 */
export const ENERGY_IDS = [1008, 2047, 2048] as const;
export const PROTEIN_ID = 1003;
export const FAT_ID = 1004;
export const CARB_ID = 1005;
export const FIBRE_ID = 1079;

/** The four the app logs, plus energy — everything else is ignored. */
export const MACRO_NUTRIENT_IDS = [...ENERGY_IDS, PROTEIN_ID, FAT_ID, CARB_ID, FIBRE_ID];

// ----------------------------------------------------------- reading -------

function num(value: unknown): number | null {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * One nutrient's amount and unit, whichever shape it arrived in.
 *
 * Both shapes are checked on every read rather than the caller choosing,
 * because the caller is usually holding a food it got from one endpoint and
 * passing it to code that was written against the other.
 */
export function nutrientAmount(
  food: UsdaFood,
  nutrientId: number,
): { amount: number; unit: string } | null {
  for (const raw of food.foodNutrients ?? []) {
    const id = raw.nutrient?.id ?? raw.nutrientId;
    if (id !== nutrientId) continue;
    const amount = num(raw.amount ?? raw.value);
    if (amount == null) continue;
    const unit = (raw.nutrient?.unitName ?? raw.unitName ?? '').trim().toUpperCase();
    return { amount, unit };
  }
  return null;
}

/**
 * Calories, trying each energy id and converting kJ when that is what came.
 *
 * Returns null rather than zero when there is no energy at all: a food with no
 * calories and a food whose calories were not reported are different things,
 * and only one of them should be loggable without a warning.
 */
export function energyKcal(food: UsdaFood): number | null {
  for (const id of ENERGY_IDS) {
    const found = nutrientAmount(food, id);
    if (!found) continue;
    // 1 kcal = 4.184 kJ. The unit is spelled "kJ" in their data; the compare
    // is case-folded because it has also been seen as "KJ".
    if (found.unit === 'KJ') return Math.round(found.amount / 4.184);
    return Math.round(found.amount);
  }
  return null;
}

function grams(food: UsdaFood, nutrientId: number): number | null {
  const found = nutrientAmount(food, nutrientId);
  if (!found) return null;
  if (found.unit === 'MG') return found.amount / 1000;
  if (found.unit === 'UG' || found.unit === 'ÂµG') return found.amount / 1e6;
  return found.amount;
}

// ------------------------------------------------------------ basis --------

export interface UsdaBasis {
  /** What to multiply the per-100 g numbers by. */
  factor: number;
  /** What to call the resulting portion on screen. */
  label: string;
  /** True when the portion came off a product label rather than being 100 g. */
  fromLabel: boolean;
}

/**
 * Which portion to present, and how to get there from per-100 g numbers.
 *
 * Branded records declare the label's serving; the nutrient numbers are still
 * per 100 g, so the scale factor is the whole point of this function. Only a
 * serving expressed in grams can be scaled — a `servingSizeUnit` of "ml" is
 * a volume, and turning it into grams needs a density this data does not
 * carry, so those fall back to 100 g rather than guessing that 1 ml is 1 g.
 */
export function chooseBasis(food: UsdaFood): UsdaBasis {
  const size = num(food.servingSize);
  const unit = (food.servingSizeUnit ?? '').trim().toLowerCase();
  const household = (food.householdServingFullText ?? '').trim();

  if (size != null && size > 0 && (unit === 'g' || unit === 'gram' || unit === 'grams')) {
    return {
      factor: size / 100,
      label: household ? `${household} (${round(size)} g)` : `${round(size)} g`,
      fromLabel: true,
    };
  }
  return { factor: 1, label: '100 g', fromLabel: false };
}

// ----------------------------------------------------------- results -------

export interface UsdaFoodResult {
  fdcId: number;
  name: string;
  brand: string | null;
  dataType: string;
  /** FDC's own grouping, when it gave one. Disambiguates same-named foods. */
  category: string | null;
  /** The portion the macros describe. */
  servingLabel: string;
  macros: FoodMacros;
  /** Macro names that were absent, so the caller can ask rather than assume. */
  missing: string[];
  /** True when nothing usable was reported at all. */
  empty: boolean;
}

function categoryOf(food: UsdaFood): string | null {
  const raw = food.foodCategory;
  if (!raw) return null;
  if (typeof raw === 'string') return raw.trim() || null;
  return raw.description?.trim() || null;
}

/**
 * Turn one FDC food into something loggable.
 *
 * Absent macros are reported in `missing` and carried as zero, which is the
 * only workable representation — but the caller is expected to show that list
 * rather than present a partial record as a complete one.
 */
export function readFood(food: UsdaFood): UsdaFoodResult | null {
  const fdcId = num(food.fdcId);
  const name = (food.description ?? '').trim();
  if (fdcId == null || !name) return null;

  const basis = chooseBasis(food);
  const kcal = energyKcal(food);
  const protein = grams(food, PROTEIN_ID);
  const carbs = grams(food, CARB_ID);
  const fat = grams(food, FAT_ID);
  const fibre = grams(food, FIBRE_ID);

  const missing: string[] = [];
  if (kcal == null) missing.push('calories');
  if (protein == null) missing.push('protein');
  if (carbs == null) missing.push('carbs');
  if (fat == null) missing.push('fat');

  const scale = (v: number | null, dp = 1) => round((v ?? 0) * basis.factor, dp);

  return {
    fdcId,
    // FDC descriptions are shouty on SR Legacy records ("CHICKEN, BROILERS OR
    // FRYERS, BREAST, MEAT ONLY, COOKED, ROASTED"). Left as-is: it is the
    // official description, and rewriting it risks changing what it means.
    name,
    brand: (food.brandName ?? food.brandOwner ?? '').trim() || null,
    category: categoryOf(food),
    dataType: (food.dataType ?? 'Unknown').trim(),
    servingLabel: basis.label,
    macros: {
      calories: Math.round((kcal ?? 0) * basis.factor),
      proteinG: scale(protein),
      carbsG: scale(carbs),
      fatG: scale(fat),
      fiberG: scale(fibre),
    },
    missing,
    empty: missing.length === 4,
  };
}

/** Every usable food in a search response, worst records dropped. */
export function readSearch(body: UsdaSearchResponse): UsdaFoodResult[] {
  return (body.foods ?? [])
    .map(readFood)
    .filter((f): f is UsdaFoodResult => f !== null && !f.empty);
}

// ------------------------------------------------------------ request ------

export interface UsdaSearchOptions {
  pageSize?: number;
  pageNumber?: number;
  dataType?: UsdaDataType[];
}

/** Their search page size ceiling. */
export const MAX_PAGE_SIZE = 200;

/**
 * The POST body for `/fdc/v1/foods/search`.
 *
 * `dataType` defaults to the three whole-food sources plus Branded, in that
 * order, because someone typing "chicken breast" wants the reference record
 * and someone typing a UPC wants the packet. A bare numeric query is a
 * barcode, so it goes to Branded alone — searching SR Legacy for "0123456789"
 * returns nothing and costs a round trip to find that out.
 */
export function searchBody(query: string, options: UsdaSearchOptions = {}): Record<string, unknown> {
  const q = query.trim();
  const looksLikeBarcode = /^\d{8,14}$/.test(q);
  const dataType =
    options.dataType ?? (looksLikeBarcode ? ['Branded'] : ['Foundation', 'SR Legacy', 'Survey (FNDDS)', 'Branded']);

  return {
    query: q,
    dataType,
    pageSize: Math.min(Math.max(1, options.pageSize ?? 25), MAX_PAGE_SIZE),
    pageNumber: Math.max(1, options.pageNumber ?? 1),
  };
}

/**
 * How much to trust a record, for ordering.
 *
 * Foundation is the newest and most thoroughly analysed, SR Legacy is the
 * long-standing reference, Survey is modelled from those two, and Branded is
 * manufacturer-submitted and only as good as what the manufacturer typed. A
 * search for "butter" should not lead with somebody's private-label tub.
 */
export const DATA_TYPE_RANK: Record<string, number> = {
  Foundation: 0,
  'SR Legacy': 1,
  'Survey (FNDDS)': 2,
  Branded: 3,
};

export function rankResults(results: UsdaFoodResult[]): UsdaFoodResult[] {
  return [...results].sort((a, b) => {
    const rank = (DATA_TYPE_RANK[a.dataType] ?? 9) - (DATA_TYPE_RANK[b.dataType] ?? 9);
    if (rank !== 0) return rank;
    // Within a source, complete records first — a hit missing three macros is
    // worse than one missing none however well its name matches.
    return a.missing.length - b.missing.length;
  });
}

export const USDA_NOTE =
  'From USDA FoodData Central, the US government reference database. Whole-food entries are laboratory-analysed; branded entries are submitted by the manufacturer. Check the portion before saving — reference records are per 100 g unless a label says otherwise.';

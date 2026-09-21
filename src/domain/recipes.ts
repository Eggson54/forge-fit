import type { FoodMacros } from './types';
import { mealMacros, type SavedMeal, type SavedMealItem } from './savedMeals';

/**
 * A recipe is a saved meal that says how many servings it makes.
 *
 * Deliberately not a second concept. A saved meal and a recipe differ by one
 * number — "this is the whole tray, and the tray is four portions" — and
 * building a parallel type for that would have meant two lists, two builders
 * and two ways to log the same food. A meal with `servings` set is a recipe;
 * everything else already works on it unchanged.
 *
 * What the number buys is division. You weigh the ingredients once for the
 * whole batch and then log a plate, which is the only way anybody actually
 * cooks.
 */

/** Above this the number is a typo rather than a batch. */
export const MAX_SERVINGS = 50;

export function isRecipe(meal: SavedMeal): boolean {
  return typeof meal.servings === 'number' && meal.servings > 1;
}

/** How many servings to divide by. A meal without the field is one portion. */
export function servingsOf(meal: SavedMeal): number {
  const n = meal.servings;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 1) return 1;
  return Math.min(MAX_SERVINGS, Math.round(n));
}

/** Macros for one serving of the batch. */
export function perServing(meal: SavedMeal): FoodMacros {
  const whole = mealMacros(meal.items);
  const n = servingsOf(meal);
  if (n === 1) return whole;
  return {
    calories: Math.round(whole.calories / n),
    proteinG: Math.round((whole.proteinG / n) * 10) / 10,
    carbsG: Math.round((whole.carbsG / n) * 10) / 10,
    fatG: Math.round((whole.fatG / n) * 10) / 10,
    ...(whole.fiberG != null ? { fiberG: Math.round((whole.fiberG / n) * 10) / 10 } : null),
  };
}

/**
 * The items as they should be logged for a number of portions.
 *
 * Each item's quantity is scaled by portions/servings, so half a tray of a
 * four-serving bake logs two servings' worth of every ingredient. The item
 * names and serving labels are untouched: the log should still read "400g
 * chicken thigh", not "0.5 × recipe".
 */
export function scaleToPortions(meal: SavedMeal, portions: number): SavedMealItem[] {
  const factor = portionFactor(meal, portions);
  if (factor === 1) return meal.items.map((i) => ({ ...i, macros: { ...i.macros } }));
  return meal.items.map((i) => ({
    ...i,
    // Four decimals, not two: a tenth of a serving of a twelve-serving batch
    // is 0.0083, and rounding that to 0.01 drifts by a fifth.
    quantity: Math.round(i.quantity * factor * 10000) / 10000,
    macros: { ...i.macros },
  }));
}

export function portionFactor(meal: SavedMeal, portions: number): number {
  const n = servingsOf(meal);
  const p = Number.isFinite(portions) && portions > 0 ? portions : 1;
  return p / n;
}

/** Macros for a number of portions. */
export function portionMacros(meal: SavedMeal, portions: number): FoodMacros {
  return mealMacros(scaleToPortions(meal, portions));
}

/**
 * Parse a servings box.
 *
 * Returns null rather than 1 on nonsense, so the builder can leave the field
 * alone and complain instead of silently turning "fuor" into a one-serving
 * recipe whose every plate is four times what the user meant to eat.
 */
export function parseServings(text: string): number | null {
  const n = Number.parseFloat(text.trim());
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > MAX_SERVINGS) return null;
  return rounded;
}

/** The portions a picker offers, given what the batch makes. */
export function portionChoices(servings: number): number[] {
  const whole = Math.max(1, Math.min(MAX_SERVINGS, Math.round(servings)));
  const out = [0.5, 1];
  for (let p = 2; p <= Math.min(whole, 4); p += 1) out.push(p);
  if (whole > 4) out.push(whole);
  return out;
}

/** "half a serving", "1 serving", "2 of 4". */
export function portionLabel(portions: number, servings: number): string {
  if (portions === 0.5) return '½ serving';
  const n = Math.round(portions * 100) / 100;
  if (n === servings) return servings === 1 ? '1 serving' : `all ${servings}`;
  if (n === 1) return '1 serving';
  return `${n} of ${servings}`;
}

/** One line under the recipe's name. */
export function recipeSummary(meal: SavedMeal): string {
  const n = servingsOf(meal);
  const each = perServing(meal);
  if (n === 1) return `${each.calories} kcal · ${Math.round(each.proteinG)}g protein`;
  return `Makes ${n} · ${each.calories} kcal and ${Math.round(each.proteinG)}g protein a serving`;
}

export const RECIPE_NOTE =
  'Weigh the batch once, log a plate. The per-serving numbers are the whole recipe divided by how many servings you said it makes, so they are only as even as the portions you cut.';

import type { FoodMacros, MealSlot, NutritionEntry } from './types';

/**
 * A combination of foods saved under one name, so a meal eaten every week is
 * logged in one tap rather than re-entered item by item.
 *
 * The macros are copied into the saved meal rather than referenced, for the
 * same reason a workout stores its gym: a food's entry can be edited or
 * deleted later, and the meal you saved is still the meal you saved.
 */
export interface SavedMealItem {
  name: string;
  quantity: number;
  servingLabel: string;
  macros: FoodMacros;
}

export interface SavedMeal {
  id: string;
  name: string;
  /** The slot it is usually eaten in; the user can log it into any slot. */
  slot: MealSlot;
  items: SavedMealItem[];
  createdAt: string;
  /** How many times it has been logged, used to order the list. */
  timesLogged: number;
  lastLoggedAt: string | null;
}

const ZERO: FoodMacros = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };

/** Totals across a meal's items, with each item scaled by its own quantity. */
export function mealMacros(items: SavedMealItem[]): FoodMacros {
  const out: FoodMacros = { ...ZERO };
  for (const it of items) {
    const q = Number.isFinite(it.quantity) ? it.quantity : 0;
    out.calories += (it.macros.calories ?? 0) * q;
    out.proteinG += (it.macros.proteinG ?? 0) * q;
    out.carbsG += (it.macros.carbsG ?? 0) * q;
    out.fatG += (it.macros.fatG ?? 0) * q;
    if (it.macros.fiberG != null) out.fiberG = (out.fiberG ?? 0) + it.macros.fiberG * q;
  }
  // One decimal on grams, whole calories: a saved meal is a sum of estimates,
  // and printing 41.7333g of protein implies a precision nobody has.
  return {
    calories: Math.round(out.calories),
    proteinG: Math.round(out.proteinG * 10) / 10,
    carbsG: Math.round(out.carbsG * 10) / 10,
    fatG: Math.round(out.fatG * 10) / 10,
    ...(out.fiberG != null ? { fiberG: Math.round(out.fiberG * 10) / 10 } : null),
  };
}

const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

/**
 * A default name from the contents: the biggest item by calories, plus a count
 * of the rest. "Chicken burrito bowl + 2" beats "Lunch 17 Sep", which tells you
 * nothing when you are looking for it three weeks later.
 */
export function suggestMealName(items: SavedMealItem[], slot: MealSlot): string {
  if (items.length === 0) return SLOT_LABEL[slot];
  const lead = [...items].sort(
    (a, b) => (b.macros.calories ?? 0) * b.quantity - (a.macros.calories ?? 0) * a.quantity,
  )[0];
  const rest = items.length - 1;
  return rest > 0 ? `${lead.name} + ${rest}` : lead.name;
}

/** Turns a day's logged entries for one slot into saveable items. */
export function itemsFromEntries(entries: NutritionEntry[]): SavedMealItem[] {
  return entries.map((e) => ({
    name: e.name,
    quantity: e.quantity,
    servingLabel: e.servingLabel,
    macros: e.macros,
  }));
}

/**
 * Saved meals in the order they are worth offering: most-logged first, then
 * most recent. A meal saved and never used sinks below one used weekly.
 */
export function rankMeals(meals: SavedMeal[]): SavedMeal[] {
  return [...meals].sort(
    (a, b) =>
      b.timesLogged - a.timesLogged ||
      (b.lastLoggedAt ?? b.createdAt).localeCompare(a.lastLoggedAt ?? a.createdAt) ||
      a.name.localeCompare(b.name),
  );
}

/** Meals usually eaten in this slot, ranked, then everything else. */
export function mealsForSlot(meals: SavedMeal[], slot: MealSlot): SavedMeal[] {
  const ranked = rankMeals(meals);
  return [...ranked.filter((m) => m.slot === slot), ...ranked.filter((m) => m.slot !== slot)];
}

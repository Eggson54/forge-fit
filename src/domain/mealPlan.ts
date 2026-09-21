import type { FoodMacros, ISODate, MealSlot, Targets } from './types';
import { addDaysISO, todayISO } from './date';
import { type SavedMeal, type SavedMealItem } from './savedMeals';
import { perServing, servingsOf } from './recipes';

/**
 * Planning the week's eating, and the shopping it implies.
 *
 * The grocery list is the part that has to be right. A plan you cannot shop
 * from is a diary of intentions, so the list aggregates across every planned
 * meal, merges the same ingredient wherever it appears, and scales by the
 * servings actually planned rather than by the recipe's batch size.
 */

export interface PlannedMeal {
  id: string;
  date: ISODate;
  slot: MealSlot;
  /** The saved meal or recipe this came from, when it came from one. */
  mealId?: string;
  name: string;
  /** Portions of that meal. A recipe's own servings count divides it. */
  servings: number;
  /** Copied at plan time, for the same reason a workout stores its gym. */
  macros: FoodMacros;
}

export const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** The seven dates a plan covers, starting from `from`. */
export function planWeek(from: ISODate = todayISO()): ISODate[] {
  return Array.from({ length: 7 }, (_, i) => addDaysISO(from, i));
}

/** Everything planned for a day, in the order it would be eaten. */
export function mealsOn(plan: PlannedMeal[], date: ISODate): PlannedMeal[] {
  return plan
    .filter((m) => m.date === date)
    .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
}

const ZERO: FoodMacros = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };

/** Macro totals for a planned day. */
export function dayTotals(plan: PlannedMeal[], date: ISODate): FoodMacros {
  const out = { ...ZERO };
  for (const m of mealsOn(plan, date)) {
    out.calories += m.macros.calories * m.servings;
    out.proteinG += m.macros.proteinG * m.servings;
    out.carbsG += m.macros.carbsG * m.servings;
    out.fatG += m.macros.fatG * m.servings;
    if (m.macros.fiberG != null) out.fiberG = (out.fiberG ?? 0) + m.macros.fiberG * m.servings;
  }
  return {
    calories: Math.round(out.calories),
    proteinG: Math.round(out.proteinG * 10) / 10,
    carbsG: Math.round(out.carbsG * 10) / 10,
    fatG: Math.round(out.fatG * 10) / 10,
    ...(out.fiberG != null ? { fiberG: Math.round(out.fiberG * 10) / 10 } : null),
  };
}

export interface PlanGap {
  calories: number;
  proteinG: number;
  /** True once the day is close enough not to be worth nagging about. */
  onTarget: boolean;
  note: string;
}

/**
 * How a planned day sits against the targets.
 *
 * Within 10% of calories and 90% of protein counts as on target: a plan is a
 * sketch, and telling someone their Tuesday is forty calories light is noise
 * dressed as precision.
 */
export function gapFor(totals: FoodMacros, targets: Targets): PlanGap {
  const calories = Math.round(totals.calories - targets.calories);
  const proteinG = Math.round((totals.proteinG - targets.proteinG) * 10) / 10;
  const calorieShare = targets.calories > 0 ? Math.abs(calories) / targets.calories : 0;
  const proteinOk = targets.proteinG <= 0 || totals.proteinG >= targets.proteinG * 0.9;
  const onTarget = calorieShare <= 0.1 && proteinOk;

  let note: string;
  if (totals.calories === 0) note = 'Nothing planned yet.';
  else if (onTarget) note = 'Close enough to your targets.';
  else if (calories < 0 && !proteinOk) note = `${Math.abs(calories)} kcal and ${Math.abs(proteinG)}g protein short.`;
  else if (calories < 0) note = `${Math.abs(calories)} kcal short of the day.`;
  else if (!proteinOk) note = `Calories are there but protein is ${Math.abs(proteinG)}g short.`;
  else note = `${calories} kcal over the day.`;

  return { calories, proteinG, onTarget, note };
}

export interface GroceryItem {
  name: string;
  /** Total quantity across the week, in this item's own serving label. */
  quantity: number;
  servingLabel: string;
  /** Which planned meals it is for, so a line can be traced back. */
  usedIn: string[];
  checked?: boolean;
}

/**
 * The shopping the plan implies.
 *
 * Merging is by name *and* serving label, because "Chicken thigh / 100 g" and
 * "Chicken thigh / 1 breast" are not addable — summing them would produce a
 * number that looks precise and means nothing. Names are matched
 * case-insensitively and trimmed, since the same ingredient gets typed a
 * dozen ways across a month of saved meals.
 */
export function groceryList(plan: PlannedMeal[], meals: SavedMeal[]): GroceryItem[] {
  const byKey = new Map<string, GroceryItem>();

  for (const planned of plan) {
    const meal = planned.mealId ? meals.find((m) => m.id === planned.mealId) : null;
    // A planned meal with no recipe behind it has no ingredients to shop for.
    // It still counts toward the macros; it just cannot fill a basket.
    if (!meal) continue;

    const factor = planned.servings / servingsOf(meal);
    for (const item of meal.items) {
      const key = `${item.name.trim().toLowerCase()}::${item.servingLabel.trim().toLowerCase()}`;
      const existing = byKey.get(key);
      const quantity = item.quantity * factor;
      if (existing) {
        existing.quantity = round2(existing.quantity + quantity);
        if (!existing.usedIn.includes(planned.name)) existing.usedIn.push(planned.name);
      } else {
        byKey.set(key, {
          name: item.name.trim(),
          quantity: round2(quantity),
          servingLabel: item.servingLabel,
          usedIn: [planned.name],
        });
      }
    }
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "3 × 100 g", or just "100 g" when one is enough. */
export function formatQuantity(item: GroceryItem): string {
  const rounded = Math.round(item.quantity * 100) / 100;
  if (Math.abs(rounded - 1) < 0.005) return item.servingLabel;
  return `${rounded} × ${item.servingLabel}`;
}

/** A planned meal built from a saved meal or recipe. */
export function plannedFromMeal(
  meal: SavedMeal,
  date: ISODate,
  slot: MealSlot,
  servings = 1,
  id = `pm_${Math.random().toString(36).slice(2)}`,
): PlannedMeal {
  // A recipe's macros are per serving; a plain saved meal is one portion of
  // itself. `perServing` already knows the difference.
  return {
    id,
    date,
    slot,
    mealId: meal.id,
    name: meal.name,
    servings,
    macros: { ...perServing(meal) },
  };
}

export interface WeekSummary {
  days: number;
  planned: number;
  onTargetDays: number;
  averageCalories: number;
  note: string;
}

/** How the week looks as a whole. */
export function summariseWeek(
  plan: PlannedMeal[],
  week: ISODate[],
  targets: Targets,
): WeekSummary {
  const filled = week.filter((d) => mealsOn(plan, d).length > 0);
  const onTarget = filled.filter((d) => gapFor(dayTotals(plan, d), targets).onTarget);
  const totalCalories = filled.reduce((a, d) => a + dayTotals(plan, d).calories, 0);

  return {
    days: week.length,
    planned: filled.length,
    onTargetDays: onTarget.length,
    averageCalories: filled.length > 0 ? Math.round(totalCalories / filled.length) : 0,
    note:
      filled.length === 0
        ? 'Nothing planned yet. Add a saved meal to any day to start.'
        : `${filled.length} of ${week.length} days planned, ${onTarget.length} of them close to your targets.`,
  };
}

/** Totals for the plan's ingredients, so a list can show what it is worth. */
export function listTotals(items: GroceryItem[]): { lines: number; checked: number } {
  return { lines: items.length, checked: items.filter((i) => i.checked).length };
}

/** Unused, but exported for the screen that builds items by hand. */
export function itemFrom(item: SavedMealItem, usedIn: string): GroceryItem {
  return {
    name: item.name.trim(),
    quantity: round2(item.quantity),
    servingLabel: item.servingLabel,
    usedIn: [usedIn],
  };
}

export const MEAL_PLAN_NOTE =
  'A plan is a sketch, not a contract. Nothing here is logged as eaten — planning a Tuesday and eating it are different things, and the app only counts what you actually log.';

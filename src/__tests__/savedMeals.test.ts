import {
  itemsFromEntries,
  mealMacros,
  mealsForSlot,
  rankMeals,
  suggestMealName,
  type SavedMeal,
  type SavedMealItem,
} from '../domain/savedMeals';
import type { NutritionEntry } from '../domain/types';

const item = (over: Partial<SavedMealItem> = {}): SavedMealItem => ({
  name: 'Food',
  quantity: 1,
  servingLabel: '1 serving',
  macros: { calories: 100, proteinG: 10, carbsG: 10, fatG: 2 },
  ...over,
});

describe('mealMacros', () => {
  it('scales each item by its own quantity', () => {
    const totals = mealMacros([
      item({ quantity: 2 }),
      item({ quantity: 0.5, macros: { calories: 200, proteinG: 4, carbsG: 30, fatG: 8 } }),
    ]);
    expect(totals.calories).toBe(300);
    expect(totals.proteinG).toBe(22);
    expect(totals.fatG).toBe(8);
  });

  it('rounds grams to one decimal — a sum of estimates is not a measurement', () => {
    const totals = mealMacros([item({ quantity: 3, macros: { calories: 33, proteinG: 13.9111, carbsG: 0, fatG: 0 } })]);
    expect(totals.proteinG).toBe(41.7);
    expect(Number.isInteger(totals.calories)).toBe(true);
  });

  it('carries fibre only when something had any', () => {
    expect(mealMacros([item()]).fiberG).toBeUndefined();
    const withFibre = mealMacros([item({ macros: { calories: 100, proteinG: 1, carbsG: 20, fatG: 0, fiberG: 4 } })]);
    expect(withFibre.fiberG).toBe(4);
  });

  it('is zero for an empty meal rather than NaN', () => {
    expect(mealMacros([])).toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });

  it('survives a nonsense quantity', () => {
    const totals = mealMacros([item({ quantity: Number.NaN })]);
    expect(Number.isFinite(totals.calories)).toBe(true);
    expect(totals.calories).toBe(0);
  });
});

describe('suggestMealName', () => {
  it('names the meal after its biggest item, by calories actually eaten', () => {
    const items = [
      item({ name: 'Rice', quantity: 2, macros: { calories: 200, proteinG: 4, carbsG: 45, fatG: 1 } }),
      item({ name: 'Chicken', quantity: 1, macros: { calories: 350, proteinG: 50, carbsG: 0, fatG: 8 } }),
    ];
    // 2 × 200 beats 1 × 350, so the rice leads even though it is lighter per serving.
    expect(suggestMealName(items, 'lunch')).toBe('Rice + 1');
  });

  it('uses the bare name when there is only one item', () => {
    expect(suggestMealName([item({ name: 'Protein shake' })], 'snack')).toBe('Protein shake');
  });

  it('falls back to the slot when there is nothing to name it after', () => {
    expect(suggestMealName([], 'breakfast')).toBe('Breakfast');
  });
});

describe('itemsFromEntries', () => {
  it('keeps only what a saved meal needs', () => {
    const entry = {
      id: 'n1',
      date: '2026-09-17',
      slot: 'lunch',
      name: 'Burrito bowl',
      quantity: 1,
      servingLabel: '1 bowl',
      macros: { calories: 720, proteinG: 52, carbsG: 78, fatG: 18 },
      source: 'search',
      isEstimate: false,
      loggedAt: '2026-09-17T12:00:00.000Z',
    } as NutritionEntry;
    expect(itemsFromEntries([entry])).toEqual([
      { name: 'Burrito bowl', quantity: 1, servingLabel: '1 bowl', macros: entry.macros },
    ]);
  });
});

describe('ranking', () => {
  const meal = (over: Partial<SavedMeal>): SavedMeal => ({
    id: Math.random().toString(36).slice(2),
    name: 'Meal',
    slot: 'lunch',
    items: [item()],
    createdAt: '2026-09-01T00:00:00.000Z',
    timesLogged: 0,
    lastLoggedAt: null,
    ...over,
  });

  it('puts the meals you actually use first', () => {
    const rare = meal({ name: 'Rare', timesLogged: 1 });
    const often = meal({ name: 'Often', timesLogged: 9 });
    const never = meal({ name: 'Never', timesLogged: 0 });
    expect(rankMeals([never, rare, often]).map((m) => m.name)).toEqual(['Often', 'Rare', 'Never']);
  });

  it('breaks a tie on recency, not on insertion order', () => {
    const older = meal({ name: 'Older', timesLogged: 2, lastLoggedAt: '2026-09-01T00:00:00.000Z' });
    const newer = meal({ name: 'Newer', timesLogged: 2, lastLoggedAt: '2026-09-10T00:00:00.000Z' });
    expect(rankMeals([older, newer]).map((m) => m.name)).toEqual(['Newer', 'Older']);
  });

  it('offers the slot you are filling first, without hiding the rest', () => {
    const dinner = meal({ name: 'Dinner meal', slot: 'dinner', timesLogged: 1 });
    const breakfast = meal({ name: 'Breakfast meal', slot: 'breakfast', timesLogged: 9 });
    const ordered = mealsForSlot([breakfast, dinner], 'dinner');
    expect(ordered.map((m) => m.name)).toEqual(['Dinner meal', 'Breakfast meal']);
    expect(ordered).toHaveLength(2);
  });

  it('does not mutate the list it was given', () => {
    const list = [meal({ name: 'A', timesLogged: 0 }), meal({ name: 'B', timesLogged: 5 })];
    const before = list.map((m) => m.name);
    rankMeals(list);
    mealsForSlot(list, 'lunch');
    expect(list.map((m) => m.name)).toEqual(before);
  });
});

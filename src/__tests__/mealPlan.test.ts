import {
  MEAL_PLAN_NOTE,
  dayTotals,
  formatQuantity,
  gapFor,
  groceryList,
  mealsOn,
  planWeek,
  plannedFromMeal,
  summariseWeek,
  type PlannedMeal,
} from '../domain/mealPlan';
import type { SavedMeal } from '../domain/savedMeals';
import type { Targets } from '../domain/types';

const TODAY = '2026-09-21';

const TARGETS: Targets = {
  calories: 2600, proteinG: 180, carbsG: 280, fatG: 75, waterOz: 110, steps: 10000, sleepMinutes: 480,
};

const chilli: SavedMeal = {
  id: 'sm_chilli',
  name: 'Sunday chilli',
  slot: 'dinner',
  servings: 6,
  items: [
    { name: 'Beef mince', quantity: 12, servingLabel: '100 g', macros: { calories: 137, proteinG: 21, carbsG: 0, fatG: 5 } },
    { name: 'Kidney beans', quantity: 6, servingLabel: '100 g', macros: { calories: 127, proteinG: 8.7, carbsG: 22.8, fatG: 0.5 } },
  ],
  createdAt: '2026-09-01T00:00:00.000Z',
  timesLogged: 0,
  lastLoggedAt: null,
};

const bowl: SavedMeal = {
  id: 'sm_bowl',
  name: 'Chicken bowl',
  slot: 'lunch',
  items: [
    { name: 'Chicken thigh', quantity: 2, servingLabel: '100 g', macros: { calories: 209, proteinG: 26, carbsG: 0, fatG: 11 } },
    { name: 'Beef mince', quantity: 1, servingLabel: '100 g', macros: { calories: 137, proteinG: 21, carbsG: 0, fatG: 5 } },
  ],
  createdAt: '2026-09-01T00:00:00.000Z',
  timesLogged: 0,
  lastLoggedAt: null,
};

describe('planWeek', () => {
  it('is seven consecutive days from the start', () => {
    const week = planWeek(TODAY);
    expect(week).toHaveLength(7);
    expect(week[0]).toBe(TODAY);
    expect(week[6]).toBe('2026-09-27');
  });
});

describe('mealsOn', () => {
  it('returns a day in the order it would be eaten, not entry order', () => {
    const plan: PlannedMeal[] = [
      { id: '1', date: TODAY, slot: 'dinner', name: 'D', servings: 1, macros: { calories: 1, proteinG: 0, carbsG: 0, fatG: 0 } },
      { id: '2', date: TODAY, slot: 'breakfast', name: 'B', servings: 1, macros: { calories: 1, proteinG: 0, carbsG: 0, fatG: 0 } },
      { id: '3', date: '2026-09-22', slot: 'lunch', name: 'other day', servings: 1, macros: { calories: 1, proteinG: 0, carbsG: 0, fatG: 0 } },
    ];
    expect(mealsOn(plan, TODAY).map((m) => m.name)).toEqual(['B', 'D']);
  });
});

describe('plannedFromMeal and dayTotals', () => {
  it('plans a recipe by the serving, not by the batch', () => {
    const planned = plannedFromMeal(chilli, TODAY, 'dinner', 1, 'p1');
    // The whole batch is 12×137 + 6×127 = 2406 kcal over six servings.
    expect(planned.macros.calories).toBe(401);
  });

  it('scales a planned meal by its servings', () => {
    const one = dayTotals([plannedFromMeal(chilli, TODAY, 'dinner', 1, 'p1')], TODAY);
    const two = dayTotals([plannedFromMeal(chilli, TODAY, 'dinner', 2, 'p1')], TODAY);
    expect(two.calories).toBe(one.calories * 2);
  });

  it('adds a day up across slots', () => {
    const plan = [
      plannedFromMeal(bowl, TODAY, 'lunch', 1, 'p1'),
      plannedFromMeal(chilli, TODAY, 'dinner', 2, 'p2'),
    ];
    const totals = dayTotals(plan, TODAY);
    expect(totals.calories).toBe(555 + 802);
  });

  it('is zero for a day with nothing planned', () => {
    expect(dayTotals([], TODAY).calories).toBe(0);
  });
});

describe('gapFor', () => {
  it('calls a day within a tenth of target close enough', () => {
    // A plan is a sketch; forty calories is noise dressed as precision.
    const gap = gapFor({ calories: 2560, proteinG: 178, carbsG: 0, fatG: 0 }, TARGETS);
    expect(gap.onTarget).toBe(true);
    expect(gap.note).toMatch(/Close enough/);
  });

  it('will not call a day on target when protein is well short', () => {
    const gap = gapFor({ calories: 2600, proteinG: 90, carbsG: 0, fatG: 0 }, TARGETS);
    expect(gap.onTarget).toBe(false);
    expect(gap.note).toMatch(/protein is 90g short/);
  });

  it('names both gaps when both are open', () => {
    expect(gapFor({ calories: 1500, proteinG: 80, carbsG: 0, fatG: 0 }, TARGETS).note)
      .toMatch(/1100 kcal and 100g protein short/);
  });

  it('says over when it is over', () => {
    expect(gapFor({ calories: 3400, proteinG: 200, carbsG: 0, fatG: 0 }, TARGETS).note).toMatch(/800 kcal over/);
  });

  it('says nothing is planned rather than reporting a huge shortfall', () => {
    expect(gapFor({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }, TARGETS).note).toBe('Nothing planned yet.');
  });
});

describe('groceryList', () => {
  it('merges the same ingredient across different meals', () => {
    const plan = [
      plannedFromMeal(chilli, TODAY, 'dinner', 6, 'p1'),
      plannedFromMeal(bowl, '2026-09-22', 'lunch', 1, 'p2'),
    ];
    const list = groceryList(plan, [chilli, bowl]);
    const mince = list.find((i) => i.name === 'Beef mince')!;
    // Six servings of the chilli is the whole batch: 12. Plus one from the bowl.
    expect(mince.quantity).toBe(13);
    expect(mince.usedIn).toEqual(['Sunday chilli', 'Chicken bowl']);
  });

  it('scales by the servings planned, not the recipe batch', () => {
    const list = groceryList([plannedFromMeal(chilli, TODAY, 'dinner', 2, 'p1')], [chilli]);
    // Two of six servings is a third of the batch.
    expect(list.find((i) => i.name === 'Beef mince')!.quantity).toBe(4);
  });

  it('does not add together the same food in incompatible units', () => {
    // "100 g" and "1 breast" are not addable, and summing them would produce
    // a number that looks precise and means nothing.
    const byBreast: SavedMeal = {
      ...bowl,
      id: 'sm_breast',
      name: 'Grilled chicken',
      items: [{ name: 'Chicken thigh', quantity: 1, servingLabel: '1 breast', macros: { calories: 200, proteinG: 30, carbsG: 0, fatG: 8 } }],
    };
    const list = groceryList(
      [plannedFromMeal(bowl, TODAY, 'lunch', 1, 'p1'), plannedFromMeal(byBreast, TODAY, 'dinner', 1, 'p2')],
      [bowl, byBreast],
    );
    expect(list.filter((i) => i.name === 'Chicken thigh')).toHaveLength(2);
  });

  it('matches a name however it was typed', () => {
    const scruffy: SavedMeal = {
      ...bowl,
      id: 'sm_scruffy',
      name: 'Scruffy',
      items: [{ name: '  beef MINCE ', quantity: 3, servingLabel: '100 G', macros: { calories: 137, proteinG: 21, carbsG: 0, fatG: 5 } }],
    };
    const list = groceryList(
      [plannedFromMeal(bowl, TODAY, 'lunch', 1, 'p1'), plannedFromMeal(scruffy, TODAY, 'dinner', 1, 'p2')],
      [bowl, scruffy],
    );
    expect(list.filter((i) => i.name.toLowerCase() === 'beef mince')).toHaveLength(1);
  });

  it('skips a planned meal that has no recipe behind it', () => {
    const freehand: PlannedMeal = {
      id: 'p9', date: TODAY, slot: 'lunch', name: 'Out with friends', servings: 1,
      macros: { calories: 900, proteinG: 40, carbsG: 80, fatG: 40 },
    };
    expect(groceryList([freehand], [])).toEqual([]);
    // It still counts toward the day.
    expect(dayTotals([freehand], TODAY).calories).toBe(900);
  });

  it('is alphabetical, so the list reads the same every time', () => {
    const list = groceryList([plannedFromMeal(chilli, TODAY, 'dinner', 6, 'p1')], [chilli]);
    expect(list.map((i) => i.name)).toEqual(['Beef mince', 'Kidney beans']);
  });
});

describe('formatQuantity', () => {
  it('drops the multiplier when there is only one', () => {
    expect(formatQuantity({ name: 'Onion', quantity: 1, servingLabel: '1 onion', usedIn: [] })).toBe('1 onion');
  });

  it('shows the multiplier otherwise', () => {
    expect(formatQuantity({ name: 'Mince', quantity: 13, servingLabel: '100 g', usedIn: [] })).toBe('13 × 100 g');
  });
});

describe('summariseWeek', () => {
  it('counts planned days and how many land near target', () => {
    const week = planWeek(TODAY);
    const plan = [
      plannedFromMeal(chilli, TODAY, 'dinner', 6, 'p1'),
      plannedFromMeal(bowl, '2026-09-22', 'lunch', 1, 'p2'),
    ];
    const s = summariseWeek(plan, week, TARGETS);
    expect(s.planned).toBe(2);
    expect(s.days).toBe(7);
    expect(s.note).toMatch(/2 of 7 days planned/);
  });

  it('invites a first meal rather than reporting zeroes', () => {
    expect(summariseWeek([], planWeek(TODAY), TARGETS).note).toMatch(/Nothing planned yet/);
  });
});

describe('the note', () => {
  it('says a plan is not a log', () => {
    expect(MEAL_PLAN_NOTE).toMatch(/only counts what you actually log/);
  });
});

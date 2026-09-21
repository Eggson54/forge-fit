import {
  MAX_SERVINGS,
  RECIPE_NOTE,
  isRecipe,
  parseServings,
  perServing,
  portionChoices,
  portionFactor,
  portionLabel,
  portionMacros,
  recipeSummary,
  scaleToPortions,
  servingsOf,
} from '../domain/recipes';
import { mealMacros, type SavedMeal, type SavedMealItem } from '../domain/savedMeals';

const item = (name: string, quantity: number, calories: number, proteinG = 0): SavedMealItem => ({
  name,
  quantity,
  servingLabel: '100 g',
  macros: { calories, proteinG, carbsG: 0, fatG: 0 },
});

const meal = (over: Partial<SavedMeal> = {}): SavedMeal => ({
  id: 'sm_1',
  name: 'Chicken bake',
  slot: 'dinner',
  items: [item('Chicken thigh', 8, 200, 25), item('Rice', 6, 130, 3)],
  createdAt: '2026-09-01T18:00:00.000Z',
  timesLogged: 0,
  lastLoggedAt: null,
  ...over,
});

describe('a recipe is a saved meal with servings', () => {
  it('is only a recipe once it makes more than one', () => {
    expect(isRecipe(meal())).toBe(false);
    expect(isRecipe(meal({ servings: 1 }))).toBe(false);
    expect(isRecipe(meal({ servings: 4 }))).toBe(true);
  });

  it('treats a missing or nonsensical servings count as one portion', () => {
    expect(servingsOf(meal())).toBe(1);
    expect(servingsOf(meal({ servings: 0 }))).toBe(1);
    expect(servingsOf(meal({ servings: -3 }))).toBe(1);
    expect(servingsOf(meal({ servings: Number.NaN }))).toBe(1);
    expect(servingsOf(meal({ servings: 9999 }))).toBe(MAX_SERVINGS);
  });
});

describe('perServing', () => {
  it('divides the batch', () => {
    const whole = mealMacros(meal().items);
    const each = perServing(meal({ servings: 4 }));
    expect(each.calories).toBe(Math.round(whole.calories / 4));
    expect(each.proteinG).toBeCloseTo(whole.proteinG / 4, 1);
  });

  it('leaves a one-serving meal exactly as it was', () => {
    expect(perServing(meal())).toEqual(mealMacros(meal().items));
  });
});

describe('scaleToPortions', () => {
  it('scales every ingredient, not just the total', () => {
    const items = scaleToPortions(meal({ servings: 4 }), 1);
    expect(items[0]!.quantity).toBe(2);
    expect(items[1]!.quantity).toBe(1.5);
  });

  it('keeps the ingredient names and labels, so the log still reads like food', () => {
    const items = scaleToPortions(meal({ servings: 4 }), 1);
    expect(items[0]!.name).toBe('Chicken thigh');
    expect(items[0]!.servingLabel).toBe('100 g');
  });

  it('carries enough decimals for a small slice of a big batch', () => {
    // A tenth of a twelve-serving batch is 0.0083 of a portion; two decimals
    // would round that to 0.01 and drift by a fifth.
    const items = scaleToPortions(meal({ servings: 12, items: [item('Stock', 1, 100)] }), 0.1);
    expect(items[0]!.quantity).toBe(0.0083);
  });

  it('copies the macros rather than sharing them with the stored meal', () => {
    const source = meal({ servings: 2 });
    const items = scaleToPortions(source, 1);
    items[0]!.macros.calories = 9999;
    expect(source.items[0]!.macros.calories).toBe(200);
  });

  it('is a no-op on a plain saved meal logged whole', () => {
    expect(scaleToPortions(meal(), 1)).toEqual(meal().items);
  });
});

describe('portionMacros', () => {
  it('two of four servings is half the batch', () => {
    const whole = mealMacros(meal().items);
    const half = portionMacros(meal({ servings: 4 }), 2);
    expect(half.calories).toBe(Math.round(whole.calories / 2));
  });

  it('all the servings add back up to the batch', () => {
    const whole = mealMacros(meal().items);
    expect(portionMacros(meal({ servings: 4 }), 4).calories).toBe(whole.calories);
  });

  it('refuses to let a zero or negative portion invert the maths', () => {
    expect(portionFactor(meal({ servings: 4 }), 0)).toBe(0.25);
    expect(portionFactor(meal({ servings: 4 }), -2)).toBe(0.25);
  });
});

describe('parseServings', () => {
  it('takes a whole number in range', () => {
    expect(parseServings('4')).toBe(4);
    expect(parseServings(' 6 ')).toBe(6);
    expect(parseServings('3.4')).toBe(3);
  });

  it('refuses nonsense rather than quietly making it one', () => {
    // Silently reading "fuor" as 1 would make every plate four times the
    // intended size.
    expect(parseServings('fuor')).toBeNull();
    expect(parseServings('')).toBeNull();
    expect(parseServings('0')).toBeNull();
    expect(parseServings('-2')).toBeNull();
    expect(parseServings('500')).toBeNull();
  });
});

describe('the portion picker', () => {
  it('offers a half, a serving, a few, and the lot', () => {
    expect(portionChoices(4)).toEqual([0.5, 1, 2, 3, 4]);
    expect(portionChoices(2)).toEqual([0.5, 1, 2]);
    expect(portionChoices(1)).toEqual([0.5, 1]);
  });

  it('does not list every portion of a big batch', () => {
    const choices = portionChoices(12);
    expect(choices).toEqual([0.5, 1, 2, 3, 4, 12]);
  });

  it('labels each choice the way a person would say it', () => {
    expect(portionLabel(0.5, 4)).toBe('½ serving');
    expect(portionLabel(1, 4)).toBe('1 serving');
    expect(portionLabel(2, 4)).toBe('2 of 4');
    expect(portionLabel(4, 4)).toBe('all 4');
    expect(portionLabel(1, 1)).toBe('1 serving');
  });
});

describe('recipeSummary', () => {
  it('leads with what the batch makes', () => {
    expect(recipeSummary(meal({ servings: 4 }))).toMatch(/^Makes 4 ·/);
    expect(recipeSummary(meal({ servings: 4 }))).toMatch(/a serving$/);
  });

  it('says nothing about servings for a plain saved meal', () => {
    expect(recipeSummary(meal())).not.toMatch(/Makes/);
  });
});

describe('the note', () => {
  it('admits the portions are only as even as the cook', () => {
    expect(RECIPE_NOTE).toMatch(/portions you cut/);
  });
});

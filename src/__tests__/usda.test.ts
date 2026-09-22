import {
  chooseBasis,
  energyKcal,
  nutrientAmount,
  rankResults,
  readFood,
  readSearch,
  searchBody,
  type UsdaFood,
  type UsdaFoodResult,
} from '../domain/usda';

/**
 * Fixtures use the two nutrient shapes FDC actually returns. Building them by
 * hand from the wrong shape is exactly the bug these tests exist to catch, so
 * the helpers below are deliberately explicit about which endpoint they mimic.
 */

/** A nutrient as `/foods/search` returns it: flat. */
const flat = (id: number, value: number, unitName = 'G') => ({
  nutrientId: id,
  nutrientName: `n${id}`,
  unitName,
  value,
});

/** A nutrient as `/food/{id}` returns it: nested. */
const nested = (id: number, amount: number, unitName = 'G') => ({
  nutrient: { id, name: `n${id}`, number: String(id), unitName },
  amount,
});

describe('nutrientAmount', () => {
  it('reads the flat shape a search hit uses', () => {
    const food: UsdaFood = { fdcId: 1, description: 'x', foodNutrients: [flat(1003, 31)] };
    expect(nutrientAmount(food, 1003)).toEqual({ amount: 31, unit: 'G' });
  });

  it('reads the nested shape a detail response uses', () => {
    const food: UsdaFood = { fdcId: 1, description: 'x', foodNutrients: [nested(1003, 31)] };
    expect(nutrientAmount(food, 1003)).toEqual({ amount: 31, unit: 'G' });
  });

  it('returns null for a nutrient that is simply absent', () => {
    const food: UsdaFood = { fdcId: 1, description: 'x', foodNutrients: [flat(1003, 31)] };
    expect(nutrientAmount(food, 1079)).toBeNull();
  });

  it('skips an entry whose amount is missing rather than reading it as zero', () => {
    const food: UsdaFood = {
      fdcId: 1,
      description: 'x',
      foodNutrients: [{ nutrientId: 1003, nutrientName: 'Protein', unitName: 'G' }],
    };
    expect(nutrientAmount(food, 1003)).toBeNull();
  });
});

describe('energyKcal', () => {
  it('prefers nutrient 1008', () => {
    const food: UsdaFood = {
      fdcId: 1,
      description: 'x',
      foodNutrients: [flat(1008, 165, 'KCAL'), flat(2047, 170, 'KCAL')],
    };
    expect(energyKcal(food)).toBe(165);
  });

  it('falls back to the Atwater ids, which are all a Foundation food often has', () => {
    const food: UsdaFood = {
      fdcId: 1,
      description: 'x',
      foodNutrients: [nested(2047, 172, 'KCAL'), nested(1003, 31)],
    };
    expect(energyKcal(food)).toBe(172);
  });

  it('converts kJ rather than reading it as calories', () => {
    const food: UsdaFood = { fdcId: 1, description: 'x', foodNutrients: [flat(1008, 690, 'kJ')] };
    // 690 kJ / 4.184 = 164.9 kcal. Read as calories it would have been 690.
    expect(energyKcal(food)).toBe(165);
  });

  it('is null, not zero, when no energy was reported at all', () => {
    const food: UsdaFood = { fdcId: 1, description: 'x', foodNutrients: [flat(1003, 31)] };
    expect(energyKcal(food)).toBeNull();
  });
});

describe('chooseBasis', () => {
  it('uses 100 g for a reference food with no label serving', () => {
    expect(chooseBasis({ fdcId: 1, description: 'x', dataType: 'SR Legacy' })).toEqual({
      factor: 1,
      label: '100 g',
      fromLabel: false,
    });
  });

  it('scales a branded food to its label serving', () => {
    const basis = chooseBasis({
      fdcId: 1,
      description: 'x',
      dataType: 'Branded',
      servingSize: 55,
      servingSizeUnit: 'g',
      householdServingFullText: '1 cup',
    });
    expect(basis.factor).toBeCloseTo(0.55, 5);
    expect(basis.label).toBe('1 cup (55 g)');
    expect(basis.fromLabel).toBe(true);
  });

  it('labels a gram serving with no household text by its weight alone', () => {
    expect(chooseBasis({ fdcId: 1, description: 'x', servingSize: 30, servingSizeUnit: 'g' }).label).toBe('30 g');
  });

  it('refuses to treat millilitres as grams', () => {
    // 240 ml of oil is not 240 g of oil. Without a density there is nothing
    // honest to scale by, so it stays per 100 g.
    const basis = chooseBasis({
      fdcId: 1,
      description: 'x',
      servingSize: 240,
      servingSizeUnit: 'ml',
      householdServingFullText: '1 cup',
    });
    expect(basis).toEqual({ factor: 1, label: '100 g', fromLabel: false });
  });

  it('ignores a zero or negative serving size', () => {
    expect(chooseBasis({ fdcId: 1, description: 'x', servingSize: 0, servingSizeUnit: 'g' }).factor).toBe(1);
  });
});

describe('readFood', () => {
  const chicken: UsdaFood = {
    fdcId: 171077,
    description: 'Chicken, broilers or fryers, breast, meat only, cooked, roasted',
    dataType: 'SR Legacy',
    foodNutrients: [
      nested(1008, 165, 'KCAL'),
      nested(1003, 31.02),
      nested(1005, 0),
      nested(1004, 3.57),
      nested(1079, 0),
    ],
  };

  it('reads a reference food per 100 g', () => {
    const food = readFood(chicken)!;
    expect(food.servingLabel).toBe('100 g');
    expect(food.macros).toEqual({ calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6, fiberG: 0 });
    expect(food.missing).toEqual([]);
    expect(food.empty).toBe(false);
  });

  it('scales a branded food by its label serving', () => {
    const food = readFood({
      fdcId: 9,
      description: 'Oats',
      dataType: 'Branded',
      brandName: 'Somebrand',
      servingSize: 40,
      servingSizeUnit: 'g',
      householdServingFullText: '1/2 cup',
      foodNutrients: [flat(1008, 380, 'KCAL'), flat(1003, 13), flat(1005, 67), flat(1004, 7)],
    })!;
    // Per 100 g the record says 380 kcal; the label serving is 40 g.
    expect(food.macros.calories).toBe(152);
    expect(food.macros.proteinG).toBe(5.2);
    expect(food.servingLabel).toBe('1/2 cup (40 g)');
    expect(food.brand).toBe('Somebrand');
  });

  it('names the macros that were missing instead of presenting zeroes as data', () => {
    const food = readFood({
      fdcId: 3,
      description: 'Partial',
      dataType: 'Foundation',
      foodNutrients: [nested(1003, 10)],
    })!;
    expect(food.missing).toEqual(['calories', 'carbs', 'fat']);
    expect(food.macros.calories).toBe(0);
    expect(food.empty).toBe(false);
  });

  it('flags a record with no macros at all as empty', () => {
    const food = readFood({ fdcId: 4, description: 'Nothing', foodNutrients: [] })!;
    expect(food.empty).toBe(true);
  });

  it('rejects a record with no id or no description', () => {
    expect(readFood({ description: 'No id' })).toBeNull();
    expect(readFood({ fdcId: 5, description: '   ' })).toBeNull();
  });

  it('converts a milligram-reported macro to grams', () => {
    const food = readFood({
      fdcId: 6,
      description: 'Odd units',
      foodNutrients: [nested(1008, 100, 'KCAL'), nested(1003, 2500, 'MG'), nested(1005, 1), nested(1004, 1)],
    })!;
    expect(food.macros.proteinG).toBe(2.5);
  });
});

describe('readSearch', () => {
  it('drops records with nothing usable in them', () => {
    const results = readSearch({
      foods: [
        { fdcId: 1, description: 'Good', foodNutrients: [flat(1008, 100, 'KCAL'), flat(1003, 5), flat(1005, 5), flat(1004, 5)] },
        { fdcId: 2, description: 'Empty', foodNutrients: [] },
        { description: 'No id' },
      ],
    });
    expect(results.map((f) => f.fdcId)).toEqual([1]);
  });

  it('survives a response with no foods key', () => {
    expect(readSearch({})).toEqual([]);
  });
});

describe('searchBody', () => {
  it('searches every source for a worded query, reference sources first', () => {
    const body = searchBody('chicken breast');
    expect(body.query).toBe('chicken breast');
    expect(body.dataType).toEqual(['Foundation', 'SR Legacy', 'Survey (FNDDS)', 'Branded']);
  });

  it('sends a bare barcode to Branded alone', () => {
    // SR Legacy has no UPCs in it, so including it is a guaranteed miss.
    expect(searchBody('0123456789012').dataType).toEqual(['Branded']);
  });

  it('does not mistake a short number for a barcode', () => {
    expect(searchBody('2 eggs').dataType).toContain('SR Legacy');
    expect(searchBody('1234').dataType).toContain('SR Legacy');
  });

  it('clamps the page size to their ceiling', () => {
    expect(searchBody('x', { pageSize: 5000 }).pageSize).toBe(200);
    expect(searchBody('x', { pageSize: 0 }).pageSize).toBe(1);
  });

  it('honours an explicit dataType over the barcode guess', () => {
    expect(searchBody('0123456789012', { dataType: ['Foundation'] }).dataType).toEqual(['Foundation']);
  });

  it('trims the query', () => {
    expect(searchBody('  oats  ').query).toBe('oats');
  });
});

describe('rankResults', () => {
  const make = (dataType: string, missing: string[] = []): UsdaFoodResult => ({
    fdcId: 1,
    name: dataType,
    brand: null,
    category: null,
    dataType,
    servingLabel: '100 g',
    macros: { calories: 1, proteinG: 1, carbsG: 1, fatG: 1, fiberG: 0 },
    missing,
    empty: false,
  });

  it('puts laboratory sources ahead of manufacturer submissions', () => {
    const ranked = rankResults([make('Branded'), make('SR Legacy'), make('Foundation')]);
    expect(ranked.map((r) => r.dataType)).toEqual(['Foundation', 'SR Legacy', 'Branded']);
  });

  it('prefers a complete record within the same source', () => {
    const ranked = rankResults([make('SR Legacy', ['fat']), make('SR Legacy', [])]);
    expect(ranked[0]!.missing).toEqual([]);
  });

  it('does not mutate its input', () => {
    const input = [make('Branded'), make('Foundation')];
    rankResults(input);
    expect(input[0]!.dataType).toBe('Branded');
  });
});

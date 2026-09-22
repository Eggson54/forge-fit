import {
  PORTIONS,
  caloriesFromMacros,
  checkMacros,
  findByBarcode,
  isProductBarcode,
  normaliseBarcode,
  scaleMacros,
  scoreFood,
  searchLibrary,
  type LibraryFood,
} from '../domain/foodLibrary';
import { FOOD_DB } from '../data/foods';

const food = (over: Partial<LibraryFood> = {}): LibraryFood => ({
  id: 'f1', name: 'Chicken Breast', servingLabel: '100 g',
  calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6,
  source: 'bundled', ...over,
});

describe('scoreFood', () => {
  it('ranks an exact name above a prefix above a substring', () => {
    const exact = scoreFood(food({ name: 'Egg' }), 'egg');
    const prefix = scoreFood(food({ name: 'Egg Fried Rice' }), 'egg');
    const inside = scoreFood(food({ name: 'Scrambled Eggs' }), 'egg');
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(inside);
  });

  it('matches a brand as well as a name', () => {
    expect(scoreFood(food({ name: 'Protein Bar', brand: 'Grenade' }), 'grenade')).toBeGreaterThan(0);
  });

  it('ranks a name above a brand on the same word', () => {
    const byName = scoreFood(food({ name: 'Oats' }), 'oats');
    const byBrand = scoreFood(food({ name: 'Cereal', brand: 'Oats Co' }), 'oats');
    expect(byName).toBeGreaterThan(byBrand);
  });

  it('puts your own foods above the bundled ones', () => {
    const mine = scoreFood(food({ source: 'custom' }), 'chicken');
    const theirs = scoreFood(food({ source: 'bundled' }), 'chicken');
    expect(mine).toBeGreaterThan(theirs);
  });

  it('lifts something logged often above something never logged', () => {
    const often = scoreFood(food({ uses: 60 }), 'chicken');
    const never = scoreFood(food({ uses: 0 }), 'chicken');
    expect(often).toBeGreaterThan(never);
  });

  it('will not let use count beat a much better name match', () => {
    // "chick" must not surface a much-logged chickpea above the chicken.
    const chicken = scoreFood(food({ name: 'Chicken Breast', uses: 0 }), 'chick');
    const chickpea = scoreFood(food({ name: 'Roasted Chickpea Snack', uses: 200 }), 'chick');
    expect(chicken).toBeGreaterThan(chickpea);
  });

  it('ignores a one- or two-character substring inside a word', () => {
    expect(scoreFood(food({ name: 'Kebab' }), 'ba')).toBe(0);
    expect(scoreFood(food({ name: 'Banana' }), 'ban')).toBeGreaterThan(0);
  });

  it('is zero for an empty query and for no match', () => {
    expect(scoreFood(food(), '')).toBe(0);
    expect(scoreFood(food(), 'aubergine')).toBe(0);
  });
});

describe('searchLibrary', () => {
  const library: LibraryFood[] = [
    food({ id: 'a', name: 'Chicken Breast' }),
    food({ id: 'b', name: 'Chicken Thigh' }),
    food({ id: 'c', name: 'Beef Mince' }),
    food({ id: 'd', name: 'My Chicken Curry', source: 'custom', uses: 12 }),
  ];

  it('finds everything that matches, best first', () => {
    const results = searchLibrary(library, 'chicken');
    expect(results).toHaveLength(3);
    expect(results[0]!.id).toBe('d');
  });

  it('shows what you actually eat when nothing is typed', () => {
    const results = searchLibrary(library, '');
    expect(results[0]!.id).toBe('d');
    expect(results).toHaveLength(4);
  });

  it('honours the limit', () => {
    expect(searchLibrary(library, 'chicken', 2)).toHaveLength(2);
  });

  it('returns nothing rather than everything for a query with no match', () => {
    expect(searchLibrary(library, 'zzzz')).toEqual([]);
  });

  it('searches the real bundled list usefully', () => {
    const bundled: LibraryFood[] = FOOD_DB.map((f) => ({ ...f, source: 'bundled' as const }));
    expect(searchLibrary(bundled, 'rice').length).toBeGreaterThanOrEqual(3);
    expect(searchLibrary(bundled, 'greek')[0]!.name).toMatch(/greek/i);
    expect(searchLibrary(bundled, 'oat').length).toBeGreaterThanOrEqual(2);
  });
});

describe('barcodes', () => {
  it('pads a twelve-digit UPC to the thirteen-digit EAN', () => {
    // The same product in two countries prints two codes; one entry, not two.
    expect(normaliseBarcode('012345678905')).toBe('0012345678905');
    expect(normaliseBarcode('0012345678905')).toBe('0012345678905');
  });

  it('strips whatever punctuation a scanner adds', () => {
    expect(normaliseBarcode(' 5 000 112 637 922 ')).toBe('5000112637922');
  });

  it('recognises the lengths a product code actually comes in', () => {
    expect(isProductBarcode('5000112637922')).toBe(true);
    expect(isProductBarcode('012345678905')).toBe(true);
    expect(isProductBarcode('96385074')).toBe(true);
    expect(isProductBarcode('12345')).toBe(false);
    expect(isProductBarcode('https://example.com')).toBe(false);
  });

  it('finds a food by either spelling of its code', () => {
    const library = [food({ id: 'x', barcode: '0012345678905', source: 'scanned' })];
    expect(findByBarcode(library, '012345678905')!.id).toBe('x');
    expect(findByBarcode(library, '0012345678905')!.id).toBe('x');
  });

  it('finds nothing for an unknown code, and does not throw on nonsense', () => {
    expect(findByBarcode([food()], '5000112637922')).toBeNull();
    expect(findByBarcode([], '')).toBeNull();
  });
});

describe('scaleMacros', () => {
  it('scales everything it has', () => {
    expect(scaleMacros({ calories: 200, proteinG: 20, carbsG: 10, fatG: 8, fiberG: 3 }, 0.5))
      .toEqual({ calories: 100, proteinG: 10, carbsG: 5, fatG: 4, fiberG: 1.5 });
  });

  it('reports zero fibre for a food that never had any', () => {
    expect(scaleMacros({ calories: 200, proteinG: 20, carbsG: 10, fatG: 8 }, 2).fiberG).toBe(0);
  });

  it('treats a nonsense multiplier as one rather than producing NaN', () => {
    // A half-typed portion must not turn a logged meal into NaN calories and
    // poison the day's total and every score built on it.
    const base = { calories: 200, proteinG: 20, carbsG: 10, fatG: 8 };
    expect(scaleMacros(base, Number.NaN)).toEqual({ ...base, fiberG: 0 });
    expect(scaleMacros(base, -3)).toEqual({ ...base, fiberG: 0 });
  });

  it('offers the fractions people actually eat', () => {
    expect(PORTIONS.map((p) => p.multiplier)).toContain(0.5);
    expect(PORTIONS.map((p) => p.multiplier)).toContain(1);
  });
});

describe('checkMacros', () => {
  it('passes a food that adds up', () => {
    expect(checkMacros({ calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6 })).toEqual([]);
  });

  it('catches a calorie figure that contradicts the macros', () => {
    const problems = checkMacros({ calories: 100, proteinG: 31, carbsG: 20, fatG: 10 });
    expect(problems).toHaveLength(1);
    expect(problems[0]!.message).toMatch(/typo/);
  });

  it('tolerates the rounding on a real label', () => {
    // 4-4-9 gives 166 against a printed 160. Nagging here would teach people
    // to ignore the warning that matters.
    expect(checkMacros({ calories: 160, proteinG: 10, carbsG: 20, fatG: 6 })).toEqual([]);
  });

  it('rejects a negative or absurd number outright', () => {
    expect(checkMacros({ calories: -5, proteinG: 1, carbsG: 1, fatG: 1 }).length).toBeGreaterThan(0);
    expect(checkMacros({ calories: 200, proteinG: 99_999, carbsG: 1, fatG: 1 }).length).toBeGreaterThan(0);
  });

  it('says nothing about a food with no calories entered yet', () => {
    expect(checkMacros({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 })).toEqual([]);
  });

  it('computes calories for filling the field in', () => {
    expect(caloriesFromMacros({ proteinG: 20, carbsG: 30, fatG: 10 })).toBe(290);
  });
});

import {
  chooseBasis,
  kcalFor,
  lookupUrl,
  readProduct,
  REQUESTED_FIELDS,
  type OffResponse,
} from '../domain/productLookup';

/**
 * Shapes taken from the OpenAPI-generated types in Open Food Facts' own Node
 * SDK, not from memory. The three traps those types make explicit — suffixed
 * fields, energy in kilojoules, and a miss returning HTTP 200 — each have a
 * test below.
 */
const response = (over: Partial<OffResponse['product']> = {}, status: 0 | 1 = 1): OffResponse => ({
  status,
  code: '5000112637922',
  product: {
    code: '5000112637922',
    product_name: 'Baked Beans in Tomato Sauce',
    brands: 'Heinz, Heinz UK',
    serving_size: '207 g',
    nutrition_data_per: 'serving',
    nutriments: {
      'energy-kcal_100g': 78,
      'energy-kcal_serving': 162,
      proteins_100g: 4.7,
      proteins_serving: 9.7,
      carbohydrates_100g: 12.5,
      carbohydrates_serving: 25.9,
      fat_100g: 0.2,
      fat_serving: 0.4,
      fiber_100g: 3.7,
      fiber_serving: 7.7,
    },
    ...over,
  },
});

describe('kcalFor', () => {
  it('prefers the unambiguous kcal field', () => {
    expect(kcalFor({ 'energy-kcal_100g': 78, 'energy-kj_100g': 331 }, '100g')).toBe(78);
  });

  it('converts kilojoules when that is all there is', () => {
    // 331 kJ / 4.184 = 79 kcal.
    expect(kcalFor({ 'energy-kj_100g': 331 }, '100g')).toBe(79);
  });

  it('treats the bare energy field as kilojoules, because it is', () => {
    // Reading `energy` as calories under-reports by a factor of about 4.2 —
    // a 2,000 kJ bar logged as 2,000 kcal, or the reverse.
    expect(kcalFor({ energy_serving: 837 }, 'serving')).toBe(200);
  });

  it('reads the basis it was asked for, not the other one', () => {
    const n = { 'energy-kcal_100g': 78, 'energy-kcal_serving': 162 };
    expect(kcalFor(n, '100g')).toBe(78);
    expect(kcalFor(n, 'serving')).toBe(162);
  });

  it('returns nothing when the product has no energy at all', () => {
    expect(kcalFor({ proteins_100g: 4 }, '100g')).toBeNull();
    expect(kcalFor({}, 'serving')).toBeNull();
  });

  it('ignores a value that is not a usable number', () => {
    expect(kcalFor({ 'energy-kcal_100g': 'unknown' }, '100g')).toBeNull();
    expect(kcalFor({ 'energy-kcal_100g': -5 }, '100g')).toBeNull();
  });
});

describe('chooseBasis', () => {
  it('uses the serving on the packet when there is one', () => {
    expect(chooseBasis(response().product!)).toEqual({ basis: 'serving', label: '207 g' });
  });

  it('falls back to 100 g when the product declares no serving', () => {
    const product = response().product!;
    expect(chooseBasis({
      ...product,
      serving_size: undefined,
      nutriments: { 'energy-kcal_100g': 78, proteins_100g: 4.7 },
    })).toEqual({ basis: '100g', label: '100 g' });
  });

  it('uses per-serving values even when the size is unnamed', () => {
    expect(chooseBasis({ nutriments: { 'energy-kcal_serving': 162 } }))
      .toEqual({ basis: 'serving', label: '1 serving' });
  });

  it('does not claim a serving basis from a serving size with no serving values', () => {
    // Some products name a serving and only publish per-100g figures.
    expect(chooseBasis({ serving_size: '30 g', nutriments: { 'energy-kcal_100g': 400 } }).basis).toBe('100g');
  });
});

describe('readProduct', () => {
  it('reads a real product at its serving size', () => {
    const result = readProduct(response(), '5000112637922');
    expect(result.kind).toBe('found');
    if (result.kind !== 'found') return;
    expect(result.product.name).toBe('Baked Beans in Tomato Sauce');
    expect(result.product.servingLabel).toBe('207 g');
    expect(result.product.macros).toEqual({ calories: 162, proteinG: 9.7, carbsG: 25.9, fatG: 0.4, fiberG: 7.7 });
    expect(result.product.per100g).toBe(false);
    expect(result.product.missing).toEqual([]);
  });

  it('takes only the first of a comma-separated brand list', () => {
    const result = readProduct(response(), '5000112637922');
    if (result.kind !== 'found') throw new Error('expected found');
    expect(result.product.brand).toBe('Heinz');
  });

  it('treats status 0 as a miss even though the HTTP call succeeded', () => {
    // Their API answers 200 for an unknown barcode. A client that only checks
    // the HTTP status reads undefined fields as zeroes and logs a phantom.
    expect(readProduct(response({}, 0), '5000112637922').kind).toBe('not_found');
    expect(readProduct({ status: 1 }, '999').kind).toBe('not_found');
  });

  it('says when a product exists but carries no nutrition', () => {
    // Very common: somebody photographed a packet and typed the name.
    const result = readProduct(response({ nutriments: {} }), '5000112637922');
    expect(result.kind).toBe('no_nutrition');
    if (result.kind !== 'no_nutrition') return;
    expect(result.name).toBe('Baked Beans in Tomato Sauce');
  });

  it('lists what was missing rather than presenting a zero as a reading', () => {
    const result = readProduct(
      response({ nutriments: { 'energy-kcal_100g': 250, proteins_100g: 8 }, serving_size: undefined }),
      '5000112637922',
    );
    if (result.kind !== 'found') throw new Error('expected found');
    expect(result.product.missing).toEqual(['carbs', 'fat']);
    expect(result.product.macros.carbsG).toBe(0);
    expect(result.product.per100g).toBe(true);
  });

  it('falls back through the name fields', () => {
    const named = (over: Record<string, unknown>) => {
      const r = readProduct(response(over), '5000112637922');
      return r.kind === 'found' ? r.product.name : null;
    };
    expect(named({ product_name: '', product_name_en: 'Baked Beans' })).toBe('Baked Beans');
    expect(named({ product_name: '', product_name_en: '', generic_name: 'Beans' })).toBe('Beans');
    expect(named({ product_name: '', product_name_en: '', generic_name: '' })).toBe('Product 5000112637922');
  });

  it('normalises the barcode it reports back', () => {
    const result = readProduct({ ...response(), code: '012345678905' }, '012345678905');
    if (result.kind !== 'found') throw new Error('expected found');
    expect(result.product.barcode).toBe('0012345678905');
  });

  it('leaves fibre out entirely when the product has none', () => {
    const product = response().product!;
    const { fiber_100g: _a, fiber_serving: _b, ...rest } = product.nutriments as Record<string, unknown>;
    const result = readProduct(response({ nutriments: rest }), '5000112637922');
    if (result.kind !== 'found') throw new Error('expected found');
    expect(result.product.macros.fiberG).toBeUndefined();
  });

  it('survives a response with nothing in it', () => {
    expect(readProduct({}, '5000112637922').kind).toBe('not_found');
  });
});

describe('lookupUrl', () => {
  it('asks for only the fields the app reads', () => {
    const url = lookupUrl('5000112637922');
    expect(url).toContain('/api/v2/product/5000112637922.json');
    expect(url).toContain(`fields=${REQUESTED_FIELDS}`);
    // A full product is hundreds of fields; on a supermarket connection that
    // is the difference between instant and a spinner.
    expect(REQUESTED_FIELDS.split(',').length).toBeLessThan(12);
  });

  it('normalises a twelve-digit code before asking', () => {
    expect(lookupUrl('012345678905')).toContain('/product/0012345678905.json');
  });

  it('honours a different base, for a self-hosted mirror', () => {
    expect(lookupUrl('5000112637922', 'https://off.example.com/')).toContain('https://off.example.com/api/v2/');
  });
});

import {
  BANDS,
  BODY_FAT_CAVEAT,
  bodyFatBand,
  bodyFatChange,
  bodyFatSeries,
  composition,
  defaultFormula,
  estimateBodyFat,
  latestInputs,
  missingForBodyFat,
  siteLabelsUsedBy,
  sitesUsedBy,
} from '../domain/bodyFat';
import type { MeasurementLog } from '../domain/types';

const log = (over: Partial<MeasurementLog> = {}): MeasurementLog => ({
  id: Math.random().toString(36).slice(2),
  date: '2026-09-20',
  ...over,
});

describe('estimateBodyFat', () => {
  it('lands in the right neighbourhood for a typical male set of numbers', () => {
    // 180 cm, 38 cm neck, 85 cm waist — the Navy formula puts this near 17–18%.
    const e = estimateBodyFat({ formula: 'male', heightCm: 180, neckCm: 38, waistCm: 85 })!;
    expect(e.pct).toBeGreaterThan(14);
    expect(e.pct).toBeLessThan(21);
    expect(e.formula).toBe('male');
  });

  it('lands in the right neighbourhood for a typical female set of numbers', () => {
    const e = estimateBodyFat({ formula: 'female', heightCm: 165, neckCm: 32, waistCm: 74, hipsCm: 97 })!;
    expect(e.pct).toBeGreaterThan(22);
    expect(e.pct).toBeLessThan(33);
  });

  it('moves down as the waist comes in, everything else held', () => {
    const before = estimateBodyFat({ formula: 'male', heightCm: 180, neckCm: 38, waistCm: 92 })!;
    const after = estimateBodyFat({ formula: 'male', heightCm: 180, neckCm: 38, waistCm: 85 })!;
    expect(after.pct).toBeLessThan(before.pct);
  });

  it('refuses rather than returning a number when an input is missing', () => {
    expect(estimateBodyFat({ formula: 'male', heightCm: 180, waistCm: 85 })).toBeNull();
    expect(estimateBodyFat({ formula: 'male', heightCm: null, neckCm: 38, waistCm: 85 })).toBeNull();
    // The female formula needs hips; the male one does not.
    expect(estimateBodyFat({ formula: 'female', heightCm: 165, neckCm: 32, waistCm: 74 })).toBeNull();
    expect(estimateBodyFat({ formula: 'male', heightCm: 180, neckCm: 38, waistCm: 85, hipsCm: undefined })).not.toBeNull();
  });

  it('refuses a waist smaller than the neck instead of taking a log of a negative', () => {
    expect(estimateBodyFat({ formula: 'male', heightCm: 180, neckCm: 90, waistCm: 40 })).toBeNull();
    expect(estimateBodyFat({ formula: 'male', heightCm: 180, neckCm: 85, waistCm: 85 })).toBeNull();
  });

  it('refuses a result outside the range a living person occupies', () => {
    // A waist barely above the neck drives the formula to something absurd.
    expect(estimateBodyFat({ formula: 'male', heightCm: 180, neckCm: 38, waistCm: 38.1 })).toBeNull();
  });

  it('never returns NaN or Infinity', () => {
    for (const waist of [39, 60, 85, 120, 200]) {
      const e = estimateBodyFat({ formula: 'male', heightCm: 180, neckCm: 38, waistCm: waist });
      if (e) expect(Number.isFinite(e.pct)).toBe(true);
    }
  });
});

describe('missingForBodyFat', () => {
  it('names each missing input the way the screen labels it', () => {
    expect(missingForBodyFat({ formula: 'female', heightCm: null })).toEqual(['Height', 'Neck', 'Waist', 'Hips']);
    expect(missingForBodyFat({ formula: 'male', heightCm: 180, neckCm: 38, waistCm: 85 })).toEqual([]);
  });

  it('does not ask a male formula for hips', () => {
    expect(missingForBodyFat({ formula: 'male', heightCm: 180, neckCm: 38, waistCm: 85 })).not.toContain('Hips');
  });
});

describe('bands', () => {
  it('rise monotonically and cover the whole range', () => {
    for (const formula of ['male', 'female'] as const) {
      const seen = BANDS.map((b) => {
        // Find the lowest whole percent that lands in this band.
        for (let p = 1; p <= 70; p++) if (bodyFatBand(p, formula) === b) return p;
        return null;
      });
      const found = seen.filter((p): p is number => p !== null);
      expect(found).toHaveLength(BANDS.length);
      for (let i = 1; i < found.length; i++) expect(found[i]!).toBeGreaterThan(found[i - 1]!);
    }
  });

  it('puts the same number in a different band per formula', () => {
    expect(bodyFatBand(20, 'male')).toBe('average');
    expect(bodyFatBand(20, 'female')).toBe('athletic');
  });
});

describe('composition', () => {
  it('splits a bodyweight into fat and everything else', () => {
    expect(composition(80, 20)).toEqual({ pct: 20, fatMassKg: 16, leanMassKg: 64 });
  });

  it('refuses without a bodyweight or a percentage', () => {
    expect(composition(null, 20)).toBeNull();
    expect(composition(80, null)).toBeNull();
    expect(composition(0, 20)).toBeNull();
    expect(composition(80, 0)).toBeNull();
    expect(composition(80, 100)).toBeNull();
  });
});

describe('bodyFatSeries', () => {
  it('prefers a measurement the user entered over the tape estimate', () => {
    const series = bodyFatSeries([log({ bodyFatPct: 12.5, neckCm: 38, waistCm: 85 })], 'male', 180);
    expect(series[0]!.pct).toBe(12.5);
    expect(series[0]!.measured).toBe(true);
  });

  it('falls back to the estimate when no measurement was entered', () => {
    const series = bodyFatSeries([log({ neckCm: 38, waistCm: 85 })], 'male', 180);
    expect(series[0]!.measured).toBe(false);
    expect(series[0]!.pct).toBeGreaterThan(0);
  });

  it('drops entries that cannot produce a number at all', () => {
    const series = bodyFatSeries([log({ chestCm: 100 }), log({ date: '2026-09-21', neckCm: 38, waistCm: 85 })], 'male', 180);
    expect(series).toHaveLength(1);
  });

  it('is oldest first, so a chart reads left to right', () => {
    const series = bodyFatSeries(
      [
        log({ date: '2026-09-20', neckCm: 38, waistCm: 85 }),
        log({ date: '2026-08-01', neckCm: 38, waistCm: 92 }),
      ],
      'male',
      180,
    );
    expect(series.map((p) => p.date)).toEqual(['2026-08-01', '2026-09-20']);
  });

  it('produces nothing without a height, rather than guessing one', () => {
    expect(bodyFatSeries([log({ neckCm: 38, waistCm: 85 })], 'male', null)).toHaveLength(0);
  });
});

describe('bodyFatChange', () => {
  it('reports the move from first to last', () => {
    const series = bodyFatSeries(
      [
        log({ date: '2026-08-01', bodyFatPct: 22 }),
        log({ date: '2026-09-20', bodyFatPct: 18.5 }),
      ],
      'male',
      180,
    );
    expect(bodyFatChange(series)!.deltaPct).toBe(-3.5);
  });

  it('says nothing with a single reading', () => {
    expect(bodyFatChange([{ date: '2026-09-20', pct: 18, measured: true }])).toBeNull();
    expect(bodyFatChange([])).toBeNull();
  });
});

describe('which sites the formula reads', () => {
  it('asks the female formula for hips and the male one not', () => {
    expect(sitesUsedBy('male')).toEqual(['neckCm', 'waistCm']);
    expect(sitesUsedBy('female')).toContain('hipsCm');
    expect(siteLabelsUsedBy('female')).toEqual(['Waist', 'Hips', 'Neck']);
  });
});

describe('latestInputs', () => {
  it('takes the most recent value per site, from different entries if need be', () => {
    const got = latestInputs([
      log({ date: '2026-08-01', neckCm: 40, waistCm: 92 }),
      log({ date: '2026-09-20', waistCm: 85 }),
    ]);
    expect(got).toEqual({ neckCm: 40, waistCm: 85, hipsCm: undefined });
  });
});

describe('defaultFormula', () => {
  it('preselects from the profile without locking it', () => {
    expect(defaultFormula('female')).toBe('female');
    expect(defaultFormula('male')).toBe('male');
    expect(['male', 'female']).toContain(defaultFormula('prefer_not_say'));
  });
});

describe('the caveat', () => {
  it('says it is an estimate and gives the size of the error', () => {
    expect(BODY_FAT_CAVEAT).toMatch(/estimate/i);
    expect(BODY_FAT_CAVEAT).toMatch(/three to four/i);
  });
});

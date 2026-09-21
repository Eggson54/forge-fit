import {
  BIO_AGE_CAVEAT,
  FLOOR_AGE,
  MARKER_LABEL,
  MAX_OFFSET_YEARS,
  bioAge,
  estimateVo2Max,
  projectBioAge,
  type BioAgeInput,
} from '../domain/bioAge';

const base: BioAgeInput = {
  chronologicalAge: 40,
  sex: 'male',
  restingHeartRate: 62,
  hrvMs: 41,
  sleepMinutes: 450,
  bodyFatPct: 24,
  activityMinutesPerWeek: 180,
};

const b = (over: Partial<BioAgeInput> = {}) => bioAge({ ...base, ...over })!;

describe('estimateVo2Max', () => {
  it('rises as resting heart rate falls', () => {
    expect(estimateVo2Max(45, 40)!).toBeGreaterThan(estimateVo2Max(70, 40)!);
  });

  it('falls with age at the same resting heart rate', () => {
    expect(estimateVo2Max(60, 60)!).toBeLessThan(estimateVo2Max(60, 25)!);
  });

  it('refuses a resting heart rate outside the range a human has', () => {
    expect(estimateVo2Max(0, 40)).toBeNull();
    expect(estimateVo2Max(200, 40)).toBeNull();
  });
});

describe('bioAge', () => {
  it('lands near the chronological age for someone average for their age', () => {
    const r = b();
    expect(Math.abs(r.delta)).toBeLessThan(3);
    expect(r.chronologicalAge).toBe(40);
  });

  it('scores against what is expected at that age, not against a 25-year-old', () => {
    // Identical markers, different ages. If the reference were fixed, the
    // older athlete would be punished for being older, which is just age
    // again with noise on top.
    const younger = bioAge({ ...base, chronologicalAge: 30, hrvMs: 41 })!;
    const older = bioAge({ ...base, chronologicalAge: 60, hrvMs: 41 })!;
    expect(older.delta).toBeLessThan(younger.delta);
  });

  it('comes out younger for better markers', () => {
    const fit = b({ restingHeartRate: 48, hrvMs: 75, bodyFatPct: 13, activityMinutesPerWeek: 360 });
    const unfit = b({ restingHeartRate: 78, hrvMs: 22, bodyFatPct: 34, activityMinutesPerWeek: 20 });
    expect(fit.years).toBeLessThan(unfit.years);
    expect(fit.delta).toBeLessThan(0);
    expect(unfit.delta).toBeGreaterThan(0);
  });

  it('never moves further than the cap, however extreme the inputs', () => {
    const extreme = b({ restingHeartRate: 33, hrvMs: 200, bodyFatPct: 3, activityMinutesPerWeek: 2000, sleepMinutes: 700 });
    expect(Math.abs(extreme.delta)).toBeLessThanOrEqual(MAX_OFFSET_YEARS);
  });

  it('does not let one extraordinary marker carry the whole number', () => {
    // A superhuman HRV and nothing else changed should not shave a decade.
    const one = b({ hrvMs: 400 });
    expect(Math.abs(one.delta - b().delta)).toBeLessThan(2);
  });

  it('never tells anyone they are younger than the floor', () => {
    const young = bioAge({ ...base, chronologicalAge: 19, restingHeartRate: 38, hrvMs: 160, bodyFatPct: 5, activityMinutesPerWeek: 900 })!;
    expect(young.years).toBeGreaterThanOrEqual(FLOOR_AGE);
  });

  it('drops every marker it was not given', () => {
    const sparse = bioAge({ chronologicalAge: 40, sex: 'male', hrvMs: 41 })!;
    expect(sparse.markers.map((m) => m.key)).toEqual(['hrv']);
    expect(sparse.confidence).toBe('low');
  });

  it('grades confidence by how much is behind it', () => {
    expect(b().confidence).toBe('good');
    expect(bioAge({ chronologicalAge: 40, sex: 'male', hrvMs: 41, sleepMinutes: 450 })!.confidence).toBe('low');
    expect(
      bioAge({ chronologicalAge: 40, sex: 'male', hrvMs: 41, sleepMinutes: 450, bodyFatPct: 20 })!.confidence,
    ).toBe('fair');
  });

  it('says nothing at all without a single marker', () => {
    expect(bioAge({ chronologicalAge: 40, sex: 'male' })).toBeNull();
  });

  it('refuses an age nobody is', () => {
    expect(bioAge({ ...base, chronologicalAge: 4 })).toBeNull();
    expect(bioAge({ ...base, chronologicalAge: 0 })).toBeNull();
  });

  it('uses the expectations that differ by sex', () => {
    const male = bioAge({ ...base, sex: 'male', bodyFatPct: 24 })!;
    const female = bioAge({ ...base, sex: 'female', bodyFatPct: 24 })!;
    const maleFat = male.markers.find((m) => m.key === 'bodyFat')!;
    const femaleFat = female.markers.find((m) => m.key === 'bodyFat')!;
    expect(femaleFat.expected).toBeGreaterThan(maleFat.expected);
    expect(femaleFat.years).toBeLessThan(maleFat.years);
  });

  it('derives a VO2 max estimate from resting heart rate rather than asking for one', () => {
    expect(b().markers.map((m) => m.key)).toContain('vo2max');
    expect(bioAge({ chronologicalAge: 40, sex: 'male', hrvMs: 41 })!.markers.map((m) => m.key)).not.toContain('vo2max');
  });

  it('names what is helping when younger and what is hurting when older', () => {
    const fit = b({ restingHeartRate: 46, hrvMs: 80, bodyFatPct: 11, activityMinutesPerWeek: 400 });
    expect(fit.headline).toMatch(/years younger/);
    // The marker name is used as written; lowercasing turned VO₂ into vo₂.
    expect(fit.headline).not.toMatch(/vo₂/);
    const unfit = b({ restingHeartRate: 82, hrvMs: 18, bodyFatPct: 36, activityMinutesPerWeek: 10 });
    expect(unfit.headline).toMatch(/years older/);
    expect(unfit.headline).toMatch(/biggest single reason/);
  });

  it('has a label for every marker it can return', () => {
    for (const m of b().markers) expect(MARKER_LABEL[m.key]).toBe(m.label);
  });
});

describe('projectBioAge', () => {
  const point = (date: string, years: number) => ({ date, years });

  it('extends the recent direction', () => {
    const p = projectBioAge([point('2026-08-21', 42), point('2026-09-21', 41)])!;
    expect(p.years).toBeLessThan(41);
    expect(p.delta).toBeLessThan(0);
  });

  it('refuses a projection drawn through a week of noise', () => {
    expect(projectBioAge([point('2026-09-15', 42), point('2026-09-21', 39)])).toBeNull();
    expect(projectBioAge([point('2026-09-21', 41)])).toBeNull();
    expect(projectBioAge([])).toBeNull();
  });

  it('caps a slope a body could not actually do', () => {
    // A ten-year "improvement" in a fortnight is the measurement moving, not
    // the person.
    const wild = projectBioAge([point('2026-09-01', 50), point('2026-09-21', 40)])!;
    expect(Math.abs(wild.delta)).toBeLessThanOrEqual(1.5);
  });

  it('never looks further ahead than a month', () => {
    const p = projectBioAge([point('2026-07-21', 42), point('2026-09-21', 41)], 3650)!;
    expect(p.horizonDays).toBe(30);
  });

  it('says so plainly when nothing is moving', () => {
    const flat = projectBioAge([point('2026-08-21', 41), point('2026-09-21', 41)])!;
    expect(flat.note).toMatch(/holding steady/i);
  });

  it('hedges the projection rather than stating it as fact', () => {
    const p = projectBioAge([point('2026-08-21', 43), point('2026-09-21', 41)])!;
    expect(p.note).toMatch(/if it holds/i);
  });
});

describe('the caveat', () => {
  it('refuses the clinical reading out loud', () => {
    expect(BIO_AGE_CAVEAT).toMatch(/not a measurement of biological ageing/i);
    expect(BIO_AGE_CAVEAT).toMatch(/cannot diagnose/i);
    expect(BIO_AGE_CAVEAT).toMatch(/methylation/i);
  });
});

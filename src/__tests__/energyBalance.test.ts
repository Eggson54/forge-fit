import {
  CONFIDENCE_LABEL,
  ENERGY_CAVEAT,
  KCAL_PER_KG,
  calorieFloor,
  dailyCalories,
  energyGap,
  formulaGap,
  intakeForRate,
  observedTdee,
  rateForIntake,
  usualRateRange,
  weeksToGoal,
  weightTrend,
} from '../domain/energyBalance';
import { addDaysISO } from '../domain/date';
import type { NutritionEntry, WeightLog } from '../domain/types';

const TODAY = '2026-09-21';

const entry = (date: string, calories: number, over: Partial<NutritionEntry> = {}): NutritionEntry => ({
  id: `${date}-${calories}-${Math.random()}`,
  date,
  slot: 'lunch',
  name: 'Whatever',
  quantity: 1,
  servingLabel: '1 serving',
  macros: { calories, proteinG: 0, carbsG: 0, fatG: 0 },
  source: 'manual',
  isEstimate: false,
  loggedAt: `${date}T12:00:00.000Z`,
  ...over,
});

const weigh = (date: string, weightKg: number): WeightLog => ({
  id: `${date}-w`,
  date,
  weightKg,
  loggedAt: `${date}T07:00:00.000Z`,
});

/** N days of intake ending today, oldest first. */
function intakeRun(days: number, kcal: number, end = TODAY): NutritionEntry[] {
  return Array.from({ length: days }, (_, i) => entry(addDaysISO(end, -(days - 1 - i)), kcal));
}

/** Weigh-ins every `every` days across the window, moving at a steady rate. */
function weighRun(days: number, startKg: number, kgPerDay: number, every = 3, end = TODAY): WeightLog[] {
  const out: WeightLog[] = [];
  for (let i = 0; i < days; i += every) {
    out.push(weigh(addDaysISO(end, -(days - 1 - i)), startKg + kgPerDay * i));
  }
  return out;
}

describe('dailyCalories', () => {
  it('adds up a day and scales by quantity', () => {
    const days = dailyCalories([
      entry('2026-09-20', 300, { quantity: 2 }),
      entry('2026-09-20', 400),
    ]);
    expect(days).toEqual([{ date: '2026-09-20', calories: 1000 }]);
  });

  it('leaves unlogged days out rather than calling them zero', () => {
    const days = dailyCalories([entry('2026-09-18', 2000), entry('2026-09-20', 2000)]);
    expect(days.map((d) => d.date)).toEqual(['2026-09-18', '2026-09-20']);
  });

  it('is oldest first', () => {
    const days = dailyCalories([entry('2026-09-20', 1), entry('2026-09-01', 1)]);
    expect(days[0]!.date).toBe('2026-09-01');
  });
});

describe('weightTrend', () => {
  it('measures the slope of a steady decline', () => {
    const trend = weightTrend([
      weigh('2026-09-01', 90),
      weigh('2026-09-08', 89.3),
      weigh('2026-09-15', 88.6),
    ])!;
    expect(trend.kgPerWeek).toBeCloseTo(-0.7, 2);
    expect(trend.readings).toBe(3);
    expect(trend.spanDays).toBe(14);
  });

  it('is not thrown by a single water-weight spike the way endpoints would be', () => {
    const clean = weightTrend([
      weigh('2026-09-01', 90), weigh('2026-09-05', 89.5), weigh('2026-09-09', 89),
      weigh('2026-09-13', 88.5), weigh('2026-09-17', 88),
    ])!;
    const spiked = weightTrend([
      weigh('2026-09-01', 90), weigh('2026-09-05', 89.5), weigh('2026-09-09', 89),
      weigh('2026-09-13', 88.5), weigh('2026-09-17', 89.2),
    ])!;
    // The spike moves the answer, but nothing like the 1.2kg it adds at the end.
    expect(Math.abs(spiked.kgPerWeek - clean.kgPerWeek)).toBeLessThan(0.5);
  });

  it('takes one reading per day', () => {
    const trend = weightTrend([
      weigh('2026-09-01', 90), weigh('2026-09-01', 90.4), weigh('2026-09-15', 89),
    ])!;
    expect(trend.readings).toBe(2);
  });

  it('says nothing from a single reading, or from readings all on one day', () => {
    expect(weightTrend([weigh('2026-09-01', 90)])).toBeNull();
    expect(weightTrend([])).toBeNull();
    expect(weightTrend([weigh('2026-09-01', 90), weigh('2026-09-01', 91)])).toBeNull();
  });

  it('ignores a zero or negative reading', () => {
    expect(weightTrend([weigh('2026-09-01', 0), weigh('2026-09-15', 89)])).toBeNull();
  });
});

describe('observedTdee', () => {
  it('recovers maintenance when weight holds flat', () => {
    const est = observedTdee(intakeRun(28, 2600), weighRun(28, 82, 0), { today: TODAY })!;
    expect(est.kcal).toBe(2600);
    expect(est.meanIntake).toBe(2600);
  });

  it('reads maintenance above intake when weight is falling', () => {
    // Half a kilo a week is 7700/2 kcal over seven days: 550 a day.
    const est = observedTdee(intakeRun(28, 2000), weighRun(28, 82, -0.5 / 7), { today: TODAY })!;
    expect(est.kcal).toBeGreaterThan(2450);
    expect(est.kcal).toBeLessThan(2650);
  });

  it('reads maintenance below intake when weight is climbing', () => {
    const est = observedTdee(intakeRun(28, 3200), weighRun(28, 82, 0.25 / 7), { today: TODAY })!;
    expect(est.kcal).toBeLessThan(3200);
  });

  it('refuses without enough logged days', () => {
    expect(observedTdee(intakeRun(6, 2600), weighRun(28, 82, 0), { today: TODAY })).toBeNull();
  });

  it('refuses without enough weigh-ins, or without enough time between them', () => {
    expect(observedTdee(intakeRun(28, 2600), [weigh('2026-09-01', 82), weigh('2026-09-20', 82)], { today: TODAY })).toBeNull();
    const bunched = [weigh('2026-09-19', 82), weigh('2026-09-20', 82), weigh('2026-09-21', 82)];
    expect(observedTdee(intakeRun(28, 2600), bunched, { today: TODAY })).toBeNull();
  });

  it('ignores everything outside the window', () => {
    const old = intakeRun(28, 2600, '2026-06-01');
    expect(observedTdee(old, weighRun(28, 82, 0), { today: TODAY })).toBeNull();
  });

  it('does not treat an unlogged day as a fast', () => {
    // Twenty logged days at 2600 and eight days of nothing. If the gaps counted
    // as zero the mean would fall to about 1860 and maintenance with it.
    const sparse = intakeRun(28, 2600).filter((_, i) => i % 7 !== 0);
    const est = observedTdee(sparse, weighRun(28, 82, 0), { today: TODAY })!;
    expect(est.kcal).toBe(2600);
    expect(est.daysLogged).toBe(24);
  });

  it('refuses a figure outside the range a human occupies', () => {
    // A weigh-in entered in pounds looks like an enormous overnight gain.
    const wrongUnits = [weigh('2026-09-01', 82), weigh('2026-09-10', 150), weigh('2026-09-20', 181)];
    expect(observedTdee(intakeRun(28, 2600), wrongUnits, { today: TODAY })).toBeNull();
  });

  it('grades its own confidence by how much is behind it', () => {
    const thin = observedTdee(intakeRun(11, 2600), weighRun(28, 82, 0, 7), { today: TODAY })!;
    const thick = observedTdee(intakeRun(28, 2600), weighRun(28, 82, 0, 2), { today: TODAY })!;
    expect(thin.confidence).toBe('low');
    expect(thick.confidence).toBe('good');
    expect(CONFIDENCE_LABEL[thick.confidence]).toBeTruthy();
  });
});

describe('energyGap', () => {
  it('says what is still missing without pretending to an answer', () => {
    const gap = energyGap(intakeRun(4, 2600), [weigh('2026-09-20', 82)], { today: TODAY });
    expect(gap.haveDaysLogged).toBe(4);
    expect(gap.haveWeighIns).toBe(1);
    expect(gap.haveSpanDays).toBe(0);
    expect(gap.needDaysLogged).toBeGreaterThan(gap.haveDaysLogged);
  });
});

describe('rate arithmetic', () => {
  it('round-trips intake and rate', () => {
    const intake = intakeForRate(2600, -0.5);
    expect(rateForIntake(2600, intake)).toBeCloseTo(-0.5, 1);
  });

  it('puts maintenance at a rate of zero', () => {
    expect(intakeForRate(2600, 0)).toBe(2600);
    expect(rateForIntake(2600, 2600)).toBe(0);
  });

  it('uses the same energy constant in both directions', () => {
    expect(intakeForRate(2000, 1) - 2000).toBeCloseTo(KCAL_PER_KG / 7, -1);
  });
});

describe('weeksToGoal', () => {
  it('divides the gap by the rate', () => {
    expect(weeksToGoal(90, 85, -0.5)).toBe(10);
  });

  it('says nothing when the rate moves away from the goal, or nowhere', () => {
    expect(weeksToGoal(90, 85, 0.5)).toBeNull();
    expect(weeksToGoal(90, 85, 0)).toBeNull();
  });

  it('calls an already-met goal zero', () => {
    expect(weeksToGoal(85, 85, -0.5)).toBe(0);
  });
});

describe('formulaGap', () => {
  it('calls a small difference close rather than inventing a finding', () => {
    expect(formulaGap(2600, 2550)!.verdict).toBe('close');
  });

  it('names the direction when the formula was well out', () => {
    expect(formulaGap(2900, 2400)!.verdict).toBe('higher');
    expect(formulaGap(2000, 2400)!.verdict).toBe('lower');
    expect(formulaGap(2000, 2400)!.deltaKcal).toBe(-400);
  });

  it('refuses to divide by a formula figure of zero', () => {
    expect(formulaGap(2600, 0)).toBeNull();
  });
});

describe('guard rails', () => {
  it('keeps a floor under any recommendation', () => {
    expect(calorieFloor('female')).toBe(1200);
    expect(calorieFloor('male')).toBe(1500);
  });

  it('scales the usual rate band with bodyweight', () => {
    expect(usualRateRange(100).minKgPerWeek).toBe(-1);
    expect(usualRateRange(60).minKgPerWeek).toBe(-0.6);
    expect(usualRateRange(100).maxKgPerWeek).toBeGreaterThan(0);
  });

  it('says out loud that this is a description, not a prescription', () => {
    expect(ENERGY_CAVEAT).toMatch(/not a prescription/i);
    expect(ENERGY_CAVEAT).toMatch(/water/i);
  });
});

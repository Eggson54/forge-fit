import {
  MAX_STRAIN,
  SCORES_CAVEAT,
  bandFor,
  baselineStrain,
  cardioLoad,
  dayStillRunning,
  energyBank,
  nutritionScore,
  recentNights,
  sleepScore,
  strainFor,
  targetStrain,
} from '../domain/scores';
import type { CardioSession } from '../domain/cardio';
import type { SessionEffort, SetEntry, SleepLog, Targets, Workout } from '../domain/types';
import { addDaysISO } from '../domain/date';

const TODAY = '2026-09-21';

const TARGETS: Targets = {
  calories: 2650,
  proteinG: 180,
  carbsG: 280,
  fatG: 75,
  waterOz: 110,
  steps: 10000,
  sleepMinutes: 480,
};

const set = (over: Partial<SetEntry> = {}): SetEntry => ({
  id: Math.random().toString(36).slice(2),
  weightKg: 80,
  reps: 8,
  rpe: null,
  completed: true,
  ...over,
});

const session = (date: string, sets: number, effort?: SessionEffort): Workout => ({
  id: `${date}-${sets}-${effort ?? 'x'}`,
  name: 'Session',
  status: 'completed',
  date,
  startedAt: null,
  completedAt: `${date}T19:00:00.000Z`,
  durationSeconds: 3600,
  focus: [],
  effort,
  exercises: [
    {
      id: 'e1',
      exerciseId: 'barbell_squat',
      name: 'Squat',
      primaryMuscle: 'quads',
      restSeconds: 120,
      sets: Array.from({ length: sets }, () => set()),
    },
  ],
});

const cardio = (date: string, minutes: number): CardioSession => ({
  id: `${date}-${minutes}`,
  date,
  type: 'run',
  minutes,
  source: 'manual',
  loggedAt: `${date}T08:00:00.000Z`,
});

const sleepLog = (date: string, minutes: number): SleepLog => ({ id: date, date, minutes });

describe('bandFor', () => {
  it('means the same thing at every score', () => {
    expect(bandFor(92).label).toBe('Excellent');
    expect(bandFor(71).label).toBe('Good');
    expect(bandFor(55).label).toBe('Fair');
    expect(bandFor(12).label).toBe('Poor');
    expect(bandFor(0).label).toBe('Poor');
  });
});

describe('sleepScore', () => {
  it('rewards hitting the target', () => {
    const s = sleepScore({ minutes: 480, targetMinutes: 480, recentMinutes: [470, 485, 475] })!;
    expect(s.value).toBeGreaterThan(85);
    expect(s.headline).toMatch(/hit your own sleep target/);
  });

  it('does not keep rewarding sleep past the target', () => {
    const at = sleepScore({ minutes: 480, targetMinutes: 480, recentMinutes: [480, 480, 480] })!;
    const over = sleepScore({ minutes: 660, targetMinutes: 480, recentMinutes: [480, 480, 480] })!;
    expect(over.value).toBe(at.value);
  });

  it('separates a steady week from a wildly swinging one', () => {
    // Same average, same night, very different weeks.
    const steady = sleepScore({ minutes: 420, targetMinutes: 480, recentMinutes: [420, 425, 415, 420] })!;
    const chaos = sleepScore({ minutes: 420, targetMinutes: 480, recentMinutes: [300, 540, 300, 540] })!;
    expect(steady.value).toBeGreaterThan(chaos.value);
  });

  it('leaves consistency out entirely with too few nights behind it', () => {
    const s = sleepScore({ minutes: 420, targetMinutes: 480, recentMinutes: [430] })!;
    expect(s.parts.map((p) => p.label)).not.toContain('Consistency');
  });

  it('counts the athlete own rating when they gave one', () => {
    const rated = sleepScore({ minutes: 420, targetMinutes: 480, quality: 5, recentMinutes: [420, 420, 420] })!;
    const bad = sleepScore({ minutes: 420, targetMinutes: 480, quality: 1, recentMinutes: [420, 420, 420] })!;
    expect(rated.value).toBeGreaterThan(bad.value);
  });

  it('says nothing rather than scoring a night nobody logged', () => {
    expect(sleepScore({ minutes: null, targetMinutes: 480, recentMinutes: [] })).toBeNull();
    expect(sleepScore({ minutes: 0, targetMinutes: 480, recentMinutes: [] })).toBeNull();
  });
});

describe('strainFor', () => {
  it('is zero on a day with nothing logged', () => {
    const s = strainFor({ workouts: [], cardio: [], date: TODAY });
    expect(s.value).toBe(0);
    expect(s.headline).toMatch(/rest day counts as a day/);
  });

  it('rises with volume', () => {
    const light = strainFor({ workouts: [session(TODAY, 6)], cardio: [], date: TODAY });
    const heavy = strainFor({ workouts: [session(TODAY, 24)], cardio: [], date: TODAY });
    expect(heavy.value).toBeGreaterThan(light.value);
  });

  it('multiplies by effort rather than adding it', () => {
    // Twenty sets at an RPE of 2 is not the day twenty at a 5 is.
    const easy = strainFor({ workouts: [session(TODAY, 20, 1)], cardio: [], date: TODAY });
    const brutal = strainFor({ workouts: [session(TODAY, 20, 5)], cardio: [], date: TODAY });
    expect(brutal.rawLoad / easy.rawLoad).toBeGreaterThan(3);
  });

  it('counts conditioning as well as lifting', () => {
    const both = strainFor({ workouts: [session(TODAY, 10)], cardio: [cardio(TODAY, 45)], date: TODAY });
    const lifting = strainFor({ workouts: [session(TODAY, 10)], cardio: [], date: TODAY });
    expect(both.value).toBeGreaterThan(lifting.value);
    expect(both.parts.map((p) => p.label)).toContain('Conditioning');
  });

  it('compresses, so a huge day approaches the ceiling without passing it', () => {
    const enormous = strainFor({
      workouts: [session(TODAY, 80, 5)],
      cardio: [cardio(TODAY, 400)],
      date: TODAY,
    });
    expect(enormous.value).toBeLessThanOrEqual(MAX_STRAIN);
    // The curve is logarithmic: doubling an already-huge day barely moves it.
    const double = strainFor({
      workouts: [session(TODAY, 160, 5)],
      cardio: [cardio(TODAY, 800)],
      date: TODAY,
    });
    expect(double.value - enormous.value).toBeLessThan(4);
  });

  it('ignores warm-up sets', () => {
    const w = session(TODAY, 4);
    w.exercises[0]!.sets = [set({ kind: 'warmup' }), set({ kind: 'warmup' }), set(), set()];
    expect(strainFor({ workouts: [w], cardio: [], date: TODAY }).parts[0]!.note).toMatch(/2 working sets/);
  });

  it('ignores other days', () => {
    expect(strainFor({ workouts: [session('2026-09-01', 20)], cardio: [], date: TODAY }).value).toBe(0);
  });
});

describe('baselineStrain', () => {
  const week = Array.from({ length: 6 }, (_, i) => session(addDaysISO(TODAY, -(i + 1)), 15, 3));

  it('averages training days only, not rest days', () => {
    // Averaging in rest days would drag the usual toward zero and make every
    // session look like an overreach.
    const base = baselineStrain(week, [], TODAY)!;
    const oneDay = strainFor({ workouts: week, cardio: [], date: addDaysISO(TODAY, -1) }).value;
    expect(base).toBeCloseTo(oneDay, 0);
  });

  it('says nothing from one or two sessions', () => {
    expect(baselineStrain([session(addDaysISO(TODAY, -1), 15)], [], TODAY)).toBeNull();
  });

  it('never counts today, which is still in progress', () => {
    const withToday = [...week, session(TODAY, 60, 5)];
    expect(baselineStrain(withToday, [], TODAY)).toBeCloseTo(baselineStrain(week, [], TODAY)!, 1);
  });
});

describe('targetStrain', () => {
  it('opens the range up when recovery is high and closes it when it is low', () => {
    const fresh = targetStrain(95, 12)!;
    const wrecked = targetStrain(30, 12)!;
    expect(fresh.high).toBeGreaterThan(wrecked.high);
    expect(wrecked.low).toBeGreaterThanOrEqual(0);
  });

  it('is a range, not a number, because the input is indirect', () => {
    const t = targetStrain(70, 12)!;
    expect(t.high).toBeGreaterThan(t.low);
  });

  it('never exceeds the top of the scale', () => {
    expect(targetStrain(100, 20)!.high).toBeLessThanOrEqual(MAX_STRAIN);
  });

  it('says nothing without a baseline to anchor to', () => {
    expect(targetStrain(80, null)).toBeNull();
    expect(targetStrain(80, 0)).toBeNull();
  });
});

describe('cardioLoad', () => {
  const weeks = (minutesPerWeek: number) =>
    Array.from({ length: 4 }, (_, w) => cardio(addDaysISO(TODAY, -(8 + w * 7)), minutesPerWeek));

  it('calls a big jump a spike', () => {
    const load = cardioLoad([...weeks(100), cardio(addDaysISO(TODAY, -2), 200)], TODAY)!;
    expect(load.verdict).toBe('spiking');
    expect(load.note).toMatch(/injuries/);
  });

  it('calls a steady week steady', () => {
    const load = cardioLoad([...weeks(100), cardio(addDaysISO(TODAY, -2), 100)], TODAY)!;
    expect(load.verdict).toBe('steady');
    expect(load.ratio).toBeCloseTo(1, 1);
  });

  it('calls a quiet week what it is, without alarm', () => {
    const load = cardioLoad([...weeks(100), cardio(addDaysISO(TODAY, -2), 20)], TODAY)!;
    expect(load.verdict).toBe('detraining');
    expect(load.note).toMatch(/deliberate/);
  });

  it('says nothing without weeks behind the current one', () => {
    // A ratio from a fortnight is a ratio of noise.
    expect(cardioLoad([cardio(addDaysISO(TODAY, -2), 100)], TODAY)).toBeNull();
    expect(cardioLoad([], TODAY)).toBeNull();
  });
});

describe('energyBank', () => {
  it('balances intake against maintenance plus what was burned', () => {
    const bank = energyBank({ consumedKcal: 2000, maintenanceKcal: 2400, activeKcal: 500, targetKcal: 2200 })!;
    expect(bank.balance).toBe(-900);
  });

  it('treats a missing active figure as zero rather than guessing', () => {
    const bank = energyBank({ consumedKcal: 2000, maintenanceKcal: 2400, activeKcal: null, targetKcal: 2200 })!;
    expect(bank.activeKcal).toBe(0);
    expect(bank.balance).toBe(-400);
  });

  it('reports against the target the athlete actually set', () => {
    expect(
      energyBank({ consumedKcal: 2180, maintenanceKcal: 2400, activeKcal: 0, targetKcal: 2200 })!.note,
    ).toMatch(/on your target/i);
    expect(
      energyBank({ consumedKcal: 2800, maintenanceKcal: 2400, activeKcal: 0, targetKcal: 2200 })!.note,
    ).toMatch(/600 kcal over/);
  });

  it('says nothing without a maintenance figure', () => {
    expect(energyBank({ consumedKcal: 2000, maintenanceKcal: 0, activeKcal: 0, targetKcal: 2200 })).toBeNull();
  });
});

describe('nutritionScore', () => {
  it('scores a day that met its targets highly', () => {
    const s = nutritionScore({ calories: 2650, proteinG: 180, fiberG: 32, waterOz: 110, targets: TARGETS })!;
    expect(s.value).toBeGreaterThan(90);
    expect(s.headline).toMatch(/met or close/);
  });

  it('penalises a thousand over as much as a thousand under', () => {
    const under = nutritionScore({ calories: 1650, proteinG: 180, fiberG: 30, waterOz: 110, targets: TARGETS })!;
    const over = nutritionScore({ calories: 3650, proteinG: 180, fiberG: 30, waterOz: 110, targets: TARGETS })!;
    expect(under.value).toBe(over.value);
  });

  it('does not penalise clearing the protein target', () => {
    const met = nutritionScore({ calories: 2650, proteinG: 180, fiberG: 30, waterOz: 110, targets: TARGETS })!;
    const over = nutritionScore({ calories: 2650, proteinG: 260, fiberG: 30, waterOz: 110, targets: TARGETS })!;
    expect(over.value).toBeGreaterThanOrEqual(met.value);
  });

  it('leaves fibre out when nothing tracked it', () => {
    const s = nutritionScore({ calories: 2650, proteinG: 180, fiberG: null, waterOz: 110, targets: TARGETS })!;
    expect(s.parts.map((p) => p.label)).not.toContain('Fibre');
  });

  it('names the weakest part rather than the score', () => {
    const s = nutritionScore({ calories: 2650, proteinG: 60, fiberG: 30, waterOz: 110, targets: TARGETS })!;
    expect(s.headline).toMatch(/^Biggest gap: protein/);
  });

  it('does not call a half-finished day a bad one', () => {
    // At two in the afternoon "Poor" is the app misreading a clock as a verdict.
    const s = nutritionScore({
      calories: 900, proteinG: 40, fiberG: 4, waterOz: 30, targets: TARGETS, dayInProgress: true,
    })!;
    expect(s.headline).toMatch(/^Still today — the furthest to go is calories/);
    expect(s.headline).not.toMatch(/gap:/);
  });

  it('groups thousands so a four-digit miss is readable', () => {
    const s = nutritionScore({ calories: 1000, proteinG: 180, fiberG: 30, waterOz: 110, targets: TARGETS })!;
    expect(s.parts.find((p) => p.label === 'Calories')!.note).toContain('1,650');
  });

  it('refuses to score an unlogged day as a bad one', () => {
    // Punishing people for the app's blind spots is how a score stops meaning
    // anything.
    expect(nutritionScore({ calories: 0, proteinG: 0, fiberG: null, waterOz: 0, targets: TARGETS })).toBeNull();
  });
});

describe('dayStillRunning', () => {
  it('is only ever true for today, and only before the evening', () => {
    const afternoon = new Date('2026-09-21T14:00:00');
    const night = new Date('2026-09-21T22:00:00');
    expect(dayStillRunning(TODAY, TODAY, afternoon)).toBe(true);
    expect(dayStillRunning(TODAY, TODAY, night)).toBe(false);
    expect(dayStillRunning('2026-09-20', TODAY, afternoon)).toBe(false);
  });
});

describe('recentNights', () => {
  it('excludes the night being scored and anything outside the window', () => {
    const logs = [sleepLog(TODAY, 300), sleepLog(addDaysISO(TODAY, -1), 480), sleepLog('2026-01-01', 200)];
    expect(recentNights(logs, TODAY)).toEqual([480]);
  });
});

describe('the caveat', () => {
  it('admits strain is not built from heart rate', () => {
    expect(SCORES_CAVEAT).toMatch(/not from heart rate/);
    expect(SCORES_CAVEAT).toMatch(/indexes, not measurements/);
  });
});

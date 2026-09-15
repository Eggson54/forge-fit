import { BAR_OPTIONS, PLATES, planPlates, totalPlates } from '../domain/plates';
import { warmupPlan } from '../domain/warmup';
import {
  applyDailyOutcome,
  bmr,
  caloriesFromMacros,
  disciplineScore,
  DEFAULT_DISCIPLINE_WEIGHTS,
  emptyStreaks,
  epley1RM,
  evaluateAchievements,
  findPreviousPerformance,
  ftInToCm,
  kgToLb,
  lbToKg,
  recommendedTargets,
  recommendNext,
  sanitizeMacros,
  scaleMacros,
  sumMacros,
  workoutStats,
} from '../domain';
import type { NutritionEntry, Profile, Workout } from '../domain/types';
import { displayVolume, groupThousands } from '../domain/units';
import { longestRunOfDays } from '../domain/date';
import { isWarmupSet, nextSetKind, setKind } from '../domain/sets';

const baseProfile: Profile = {
  id: 'u1',
  name: 'Test',
  sex: 'male',
  age: 30,
  heightCm: 180,
  weightKg: 80,
  targetWeightKg: 75,
  goal: 'lose_fat',
  activityLevel: 'moderate',
  experience: 'intermediate',
  trainingDaysPerWeek: 4,
  preferredWorkoutMinutes: 60,
  equipment: ['full_gym'],
  dietaryPreferences: ['high_protein'],
  units: 'imperial',
  onboardedAt: null,
};

describe('units', () => {
  it('converts lb <-> kg round trip', () => {
    expect(kgToLb(lbToKg(135))).toBeCloseTo(135, 5);
  });
  it('converts height ft/in to cm', () => {
    expect(ftInToCm(5, 11)).toBeCloseTo(180.34, 1);
  });
});

describe('nutrition targets', () => {
  it('computes a plausible BMR (Mifflin-St Jeor)', () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(bmr(80, 180, 30, 'male')).toBe(1780);
  });
  it('produces a fat-loss deficit below maintenance with a safety floor', () => {
    const t = recommendedTargets(baseProfile);
    expect(t.calories).toBeGreaterThanOrEqual(1500);
    expect(t.calories).toBeLessThan(maintenanceApprox());
    expect(t.proteinG).toBeGreaterThan(150); // 2.2 g/kg * 80
    expect(t.steps).toBe(10000);
  });
  it('never recommends below the female floor', () => {
    const tiny: Profile = { ...baseProfile, sex: 'female', weightKg: 45, heightCm: 150, age: 60, goal: 'lose_fat', activityLevel: 'sedentary' };
    expect(recommendedTargets(tiny).calories).toBeGreaterThanOrEqual(1200);
  });
});

function maintenanceApprox() {
  return Math.round(1780 * 1.55);
}

describe('macros', () => {
  it('derives calories from macros (4/4/9)', () => {
    expect(caloriesFromMacros({ proteinG: 40, carbsG: 50, fatG: 10 })).toBe(40 * 4 + 50 * 4 + 10 * 9);
  });
  it('scales and sums entries', () => {
    const entry = (qty: number): NutritionEntry => ({
      id: 'x', date: '2026-01-01', slot: 'lunch', name: 'Chicken', quantity: qty,
      servingLabel: '1 bowl', macros: { calories: 500, proteinG: 40, carbsG: 30, fatG: 20 },
      source: 'manual', isEstimate: false, loggedAt: '',
    });
    expect(scaleMacros(entry(2).macros, 2).calories).toBe(1000);
    expect(sumMacros([entry(1), entry(2)]).proteinG).toBe(120);
  });
  it('sanitizes an implausible estimate by trusting macros', () => {
    const { macros } = sanitizeMacros({ calories: 99999, proteinG: 40, carbsG: 50, fatG: 10 });
    expect(macros.calories).toBe(caloriesFromMacros({ proteinG: 40, carbsG: 50, fatG: 10 }));
  });
});

describe('strength', () => {
  it('epley 1RM', () => {
    expect(epley1RM(100, 1)).toBe(100);
    expect(epley1RM(100, 10)).toBeCloseTo(133.3, 1);
  });
  it('aggregates workout volume and best e1RM', () => {
    const w: Workout = {
      id: 'w', name: 'Push', status: 'completed', date: '2026-01-01', startedAt: null, completedAt: null,
      durationSeconds: 3600, focus: ['chest'],
      exercises: [{
        id: 'we', exerciseId: 'bench', name: 'Bench', primaryMuscle: 'chest', restSeconds: 120,
        sets: [
          { id: 's0', weightKg: 60, reps: 10, rpe: null, completed: true, isWarmup: true },
          { id: 's1', weightKg: 100, reps: 8, rpe: 8, completed: true },
          { id: 's2', weightKg: 100, reps: 7, rpe: 9, completed: true },
          { id: 's3', weightKg: 100, reps: 6, rpe: null, completed: false },
        ],
      }],
    };
    const s = workoutStats(w);
    expect(s.totalVolumeKg).toBe(100 * 8 + 100 * 7); // warmup + incomplete excluded
    expect(s.totalSets).toBe(2);
    expect(s.muscleVolume.chest).toBe(1500);
  });
});

describe('progressive overload', () => {
  const history: Workout[] = [{
    id: 'w1', name: 'Push', status: 'completed', date: '2026-01-05', startedAt: null, completedAt: null,
    durationSeconds: null, focus: ['chest'],
    exercises: [{
      id: 'we', exerciseId: 'bench', name: 'Bench', primaryMuscle: 'chest', restSeconds: 120,
      sets: [{ id: 's1', weightKg: 100, reps: 10, rpe: 8, completed: true }],
    }],
  }];
  it('finds previous top set', () => {
    expect(findPreviousPerformance(history, 'bench')?.weightKg).toBe(100);
  });
  it('recommends adding weight when hitting top of range', () => {
    const prev = findPreviousPerformance(history, 'bench');
    const rec = recommendNext(prev, { experience: 'intermediate', repRange: [6, 10] });
    expect(rec?.weightKg).toBeGreaterThan(100);
    expect(rec?.reps).toBe(6);
  });
  it('recommends adding a rep when mid-range and hard', () => {
    const rec = recommendNext({ weightKg: 100, reps: 7, rpe: 9, date: '2026-01-05' }, { experience: 'intermediate', repRange: [6, 10] });
    expect(rec?.weightKg).toBe(100);
    expect(rec?.reps).toBe(8);
  });
});

describe('discipline score', () => {
  it('scores a perfect day at 100', () => {
    const r = disciplineScore({
      workoutCompleted: true, workoutPlanned: true,
      calories: 2400, calorieTarget: 2400, protein: 170, proteinTarget: 170,
      steps: 10000, stepsTarget: 10000, waterOz: 100, waterTarget: 100,
      sleepMinutes: 480, sleepTarget: 480,
    });
    expect(r.score).toBe(100);
  });
  it('penalizes a missed workout by its weight', () => {
    const r = disciplineScore({
      workoutCompleted: false, workoutPlanned: true,
      calories: 2400, calorieTarget: 2400, protein: 170, proteinTarget: 170,
      steps: 10000, stepsTarget: 10000, waterOz: 100, waterTarget: 100,
      sleepMinutes: 480, sleepTarget: 480,
    });
    expect(r.score).toBe(100 - DEFAULT_DISCIPLINE_WEIGHTS.workout);
  });
  it('does not punish when no workout was planned', () => {
    const r = disciplineScore({
      workoutCompleted: false, workoutPlanned: false,
      calories: 2400, calorieTarget: 2400, protein: 170, proteinTarget: 170,
      steps: 10000, stepsTarget: 10000, waterOz: 100, waterTarget: 100,
      sleepMinutes: 480, sleepTarget: 480,
    });
    expect(r.score).toBe(100);
  });
  it('awards nothing for a day with nothing logged and nothing planned', () => {
    const r = disciplineScore({
      workoutCompleted: false, workoutPlanned: false,
      calories: 0, calorieTarget: 2400, protein: 0, proteinTarget: 170,
      steps: 0, stepsTarget: 10000, waterOz: 0, waterTarget: 100,
      sleepMinutes: 0, sleepTarget: 480,
    });
    expect(r.score).toBe(0);
  });
  it('drops the workout component on a rest day rather than gifting its weight', () => {
    const rest = disciplineScore({
      workoutCompleted: false, workoutPlanned: false,
      calories: 0, calorieTarget: 2400, protein: 170, proteinTarget: 170,
      steps: 0, stepsTarget: 10000, waterOz: 0, waterTarget: 100,
      sleepMinutes: 0, sleepTarget: 480,
    });
    // Protein is the only metric met, and it is 20 of the 75 remaining weight.
    const remaining =
      DEFAULT_DISCIPLINE_WEIGHTS.nutrition +
      DEFAULT_DISCIPLINE_WEIGHTS.protein +
      DEFAULT_DISCIPLINE_WEIGHTS.steps +
      DEFAULT_DISCIPLINE_WEIGHTS.water +
      DEFAULT_DISCIPLINE_WEIGHTS.sleep;
    expect(rest.score).toBe(Math.round((DEFAULT_DISCIPLINE_WEIGHTS.protein / remaining) * 100));
  });
});

describe('streaks', () => {
  it('increments on consecutive complete days and resets on a gap', () => {
    let s = emptyStreaks();
    s = applyDailyOutcome(s, { date: '2026-01-01', workoutDone: true, proteinHit: true, nutritionHit: true, hydrationHit: true, dayComplete: true });
    s = applyDailyOutcome(s, { date: '2026-01-02', workoutDone: true, proteinHit: true, nutritionHit: true, hydrationHit: true, dayComplete: true });
    expect(s.daily).toBe(2);
    // gap of 2 days -> reset to 1
    s = applyDailyOutcome(s, { date: '2026-01-04', workoutDone: true, proteinHit: true, nutritionHit: true, hydrationHit: true, dayComplete: true });
    expect(s.daily).toBe(1);
    expect(s.longestDaily).toBe(2);
  });
});

describe('achievements', () => {
  it('unlocks first workout and streak badges', () => {
    const unlocked = evaluateAchievements({
      workoutsCompleted: 12, currentDailyStreak: 8, proteinStreak: 2, hydrationStreak: 1,
      prsSet: 1, progressPhotos: 0, bestDisciplineScore: 92,
    });
    expect(unlocked).toEqual(expect.arrayContaining(['first_workout', 'workouts_10', 'streak_7', 'first_pr']));
    expect(unlocked).not.toContain('workouts_100');
  });
});

describe('plate maths', () => {
  it('loads a standard 225 lb bench', () => {
    const p = planPlates(225, 45, 'imperial');
    expect(p.perSide).toEqual([{ weight: 45, count: 2 }]);
    expect(p.achievable).toBe(225);
    expect(p.delta).toBe(0);
  });

  it('reports the closest achievable load when the target cannot be made', () => {
    const p = planPlates(226, 45, 'imperial');
    expect(p.achievable).toBe(225);
    expect(p.delta).toBe(-1);
  });

  it('mixes denominations, heaviest first', () => {
    const p = planPlates(155, 45, 'imperial');
    expect(p.perSide).toEqual([
      { weight: 45, count: 1 },
      { weight: 10, count: 1 },
    ]);
    expect(p.achievable).toBe(155);
  });

  it('cannot reach a target that needs a plate the gym does not have', () => {
    // 147.5 needs 1.25 per side; the lightest imperial plate here is 2.5.
    const p = planPlates(147.5, 45, 'imperial');
    expect(p.achievable).toBe(145);
    expect(p.delta).toBe(-2.5);
  });

  it('works in metric', () => {
    const p = planPlates(100, 20, 'metric');
    expect(p.achievable).toBe(100);
    expect(totalPlates(p)).toBe(4);
  });

  it('gets within one plate of every loadable target', () => {
    // Greedy is only safe if it never strands a remainder the smaller plates
    // could have covered, so check the whole reachable range in both units.
    for (const unit of ['imperial', 'metric'] as const) {
      const smallest = PLATES[unit]![PLATES[unit]!.length - 1]!;
      const bar = BAR_OPTIONS[unit]![0]!;
      for (let perSide = smallest; perSide <= 200; perSide += smallest) {
        const target = bar + perSide * 2;
        const plan = planPlates(target, bar, unit);
        expect(plan.achievable).toBeCloseTo(target, 5);
      }
    }
  });

  it('flags a target at or below the bar', () => {
    expect(planPlates(40, 45, 'imperial').belowBar).toBe(true);
    expect(planPlates(45, 45, 'imperial').perSide).toEqual([]);
  });
});

describe('warm-up ramp', () => {
  it('starts at the empty bar and rises to a primer single', () => {
    const steps = warmupPlan({ workingWeight: 315, bar: 45, unit: 'imperial' });
    expect(steps[0]!.loadedWeight).toBe(45);
    expect(steps[steps.length - 1]!.reps).toBe(1);
    expect(steps.every((s, i) => i === 0 || s.loadedWeight > steps[i - 1]!.loadedWeight)).toBe(true);
  });

  it('rounds every stage to a loadable bar', () => {
    const steps = warmupPlan({ workingWeight: 225, bar: 45, unit: 'imperial' });
    for (const s of steps) {
      const perSide = (s.loadedWeight - 45) / 2;
      expect(Math.round(perSide / 2.5) * 2.5).toBeCloseTo(perSide, 5);
    }
  });

  it('skips the empty bar and sub-bar stages for a light working set', () => {
    const steps = warmupPlan({ workingWeight: 65, bar: 45, unit: 'imperial' });
    expect(steps.every((s) => s.loadedWeight > 45)).toBe(true);
  });

  it('does not round when there is no bar', () => {
    const steps = warmupPlan({ workingWeight: 100, bar: 0, unit: 'imperial', barbell: false });
    expect(steps[0]!.loadedWeight).toBe(40);
  });

  it('returns nothing for a missing working weight', () => {
    expect(warmupPlan({ workingWeight: 0, bar: 45, unit: 'imperial' })).toEqual([]);
  });
});

describe('overload rationale units', () => {
  const prev = { weightKg: 100, reps: 10, rpe: 7, date: '2026-01-01' };

  it('speaks pounds to an imperial user', () => {
    const r = recommendNext(prev, { experience: 'intermediate', units: 'imperial' });
    expect(r!.rationale).toContain('lb');
    expect(r!.rationale).not.toContain('kg');
  });

  it('speaks kilos to a metric user', () => {
    const r = recommendNext(prev, { experience: 'intermediate', units: 'metric' });
    expect(r!.rationale).toContain('kg');
  });

  it('keeps the recommended weight in kg regardless of display units', () => {
    const imperial = recommendNext(prev, { experience: 'intermediate', units: 'imperial' })!;
    const metric = recommendNext(prev, { experience: 'intermediate', units: 'metric' })!;
    expect(imperial.weightKg).toBe(metric.weightKg);
  });
});



describe('volume formatting', () => {
  it('groups thousands without Intl', () => {
    expect(groupThousands(0)).toBe('0');
    expect(groupThousands(999)).toBe('999');
    expect(groupThousands(1000)).toBe('1,000');
    expect(groupThousands(137480.3)).toBe('137,480');
    expect(groupThousands(-4200)).toBe('-4,200');
  });

  it('switches to k only once the number stops fitting', () => {
    expect(displayVolume(1000, 'metric')).toEqual({ value: '1,000', unit: 'kg' });
    expect(displayVolume(9999, 'metric')).toEqual({ value: '9,999', unit: 'kg' });
    expect(displayVolume(12500, 'metric')).toEqual({ value: '12.5k', unit: 'kg' });
    expect(displayVolume(250000, 'metric')).toEqual({ value: '250k', unit: 'kg' });
  });

  it('converts before deciding the format', () => {
    // 5000 kg is 11,023 lb — compact in one unit, grouped in the other.
    expect(displayVolume(5000, 'metric').value).toBe('5,000');
    expect(displayVolume(5000, 'imperial')).toEqual({ value: '11k', unit: 'lb' });
  });
});

describe('longestRun', () => {
  it('finds the longest consecutive block', () => {
    const dates = new Set(['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-09', '2026-03-28']);
    expect(longestRunOfDays(dates)).toBe(3);
  });

  it('walks across a month boundary', () => {
    expect(longestRunOfDays(new Set(['2026-01-30', '2026-01-31', '2026-02-01']))).toBe(3);
  });

  it('is 0 for no training and 1 for a single day', () => {
    expect(longestRunOfDays(new Set())).toBe(0);
    expect(longestRunOfDays(new Set(['2026-05-05']))).toBe(1);
  });
});

describe('set kinds', () => {
  const base = { id: 's1', weightKg: 100, reps: 5, rpe: null, completed: true };

  it('reads the legacy isWarmup flag', () => {
    expect(setKind({ ...base, isWarmup: true })).toBe('warmup');
    expect(isWarmupSet({ ...base, isWarmup: true })).toBe(true);
  });

  it('prefers kind over the legacy flag', () => {
    expect(setKind({ ...base, kind: 'drop', isWarmup: true })).toBe('drop');
  });

  it('defaults to a working set', () => {
    expect(setKind(base)).toBe('working');
    expect(isWarmupSet(base)).toBe(false);
  });

  it('counts drop and failure sets as real work', () => {
    expect(isWarmupSet({ ...base, kind: 'drop' })).toBe(false);
    expect(isWarmupSet({ ...base, kind: 'failure' })).toBe(false);
  });

  it('cycles back around', () => {
    let kind = setKind(base);
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      kind = nextSetKind({ ...base, kind });
      seen.push(kind);
    }
    expect(seen).toEqual(['warmup', 'drop', 'failure', 'working']);
  });
});

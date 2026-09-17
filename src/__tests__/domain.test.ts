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
  displayWeight,
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
import { longestRunOfDays , parseDurationMinutes } from '../domain/date';
import { isWarmupSet, nextSetKind, setKind } from '../domain/sets';
import { MEASUREMENT_SITES, changeVerdict, latestBySite, siteChange, siteSeries } from '../domain/measurements';
import { formatDateLong, formatDateWithWeekday, formatDayMonth } from '../domain/date';
import { groupExercises, restAfterSet, toggleSupersetAt } from '../domain/superset';
import { recentExerciseIds } from '../domain/history';
import { strengthChangePct } from '../domain/strength';
import { suggestToday, volumeDeficits } from '../domain/suggestion';
import { activeDaysInWindow, adherence, expectedDoses } from '../domain/protocol';
import { ACHIEVEMENT_CATALOG, achievementProgress, nextAchievements } from '../domain/achievements';
import { daysBetween, movingAverage, nearestValue, projectGoal, ratePerWeek } from '../domain/trend';
import { balanceMacros, frequentFoods, summariseIntake, waterQuickAdds } from '../domain/nutrition';
import { availablePlates } from '../domain/plates';
import { isSubscriptionActive } from '../domain/subscription';
import { amountLabel, effectiveLoadKg, formatSetAmount, isSetLogged, loadLabel, setVolumeKg, substitutesFor } from '../domain/tracking';
import { EXERCISE_LIBRARY, exerciseById as libraryExercise } from '../data/exercises';
import { isStale, programPosition, projectedDates, weekMultiplier } from '../domain/program';
import { PROGRAMS, programById } from '../data/programs';
import { exerciseSessions, personalRecords, recentPrEvents, repMaxes } from '../domain/records';
import { answerCoachQuestion, easiestGap, openGaps, type CoachContext } from '../domain/coach';
import type { CoachSettings } from '../domain/types';
import { brzycki1RM, percentOfMax, weightForReps } from '../domain/strength';

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
      gymsClaimed: 0, gymKindsClaimed: 0, rareGymsClaimed: 0,
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

  it('always returns canonical kg, whatever the display units', () => {
    const imperial = recommendNext(prev, { experience: 'intermediate', units: 'imperial' })!;
    const metric = recommendNext(prev, { experience: 'intermediate', units: 'metric' })!;
    // Both are a small step up from the previous kg weight, not a pound number
    // smuggled into a kg field.
    for (const r of [imperial, metric]) {
      expect(r.weightKg).toBeGreaterThan(prev.weightKg);
      expect(r.weightKg - prev.weightKg).toBeLessThan(3);
    }
  });

  it('steps by a jump that exists on the rack in the user\'s units', () => {
    const imperial = recommendNext(prev, { experience: 'intermediate', units: 'imperial' })!;
    const metric = recommendNext(prev, { experience: 'intermediate', units: 'metric' })!;
    // 2.5 lb is loadable; 1.25 kg converted (2.76 lb) is not, so the number the
    // athlete reads has to move by exactly the step.
    const shownLb = (kg: number) => displayWeight(kg, 'imperial').value;
    expect(shownLb(imperial.weightKg) - shownLb(prev.weightKg)).toBeCloseTo(2.5, 5);
    // Kilos are stored exactly; displayWeight's single decimal cannot resolve a
    // 1.25 step, so the stored value is what this one has to check.
    expect(metric.weightKg - prev.weightKg).toBeCloseTo(1.25, 5);
    expect(imperial.rationale).toContain('2.5 lb');
    expect(metric.rationale).toContain('1.25 kg');
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

describe('measurement series', () => {
  // Stored newest-first, and any site can be blank in a given entry.
  const logs = [
    { id: 'm4', date: '2026-09-12', chestCm: 106.7, waistCm: 85.1 },
    { id: 'm3', date: '2026-09-01', chestCm: 105.4 },
    { id: 'm2', date: '2026-08-18', chestCm: 104.8, waistCm: 87.6 },
    { id: 'm1', date: '2026-08-04', chestCm: 104.1, waistCm: 88.9 },
  ];

  it('returns one site oldest-first, skipping blanks', () => {
    expect(siteSeries(logs, 'chestCm').map((p) => p.cm)).toEqual([104.1, 104.8, 105.4, 106.7]);
    expect(siteSeries(logs, 'waistCm').map((p) => p.date)).toEqual(['2026-08-04', '2026-08-18', '2026-09-12']);
    expect(siteSeries(logs, 'armCm')).toEqual([]);
  });

  it('measures change from first to last reading of that site', () => {
    const waist = siteChange(logs, 'waistCm')!;
    expect(waist.first.date).toBe('2026-08-04');
    expect(waist.last.date).toBe('2026-09-12');
    expect(waist.deltaCm).toBeCloseTo(-3.8, 5);
  });

  it('needs two readings to report a change', () => {
    expect(siteChange([logs[0]!], 'chestCm')).toBeNull();
    expect(siteChange(logs, 'armCm')).toBeNull();
  });

  it('takes each site from its own most recent entry', () => {
    // The newest log has no arm value; the waist one is two entries back.
    const latest = latestBySite(logs);
    expect(latest.chestCm!.cm).toBe(106.7);
    expect(latest.waistCm!.date).toBe('2026-09-12');
    expect(latest.armCm).toBeUndefined();
  });
});

describe('date formatting', () => {
  it('formats a calendar date in local time, not UTC', () => {
    // Parsed as UTC this would render as Sep 13 anywhere west of Greenwich.
    expect(formatDayMonth('2026-09-14')).toBe('Sep 14');
    expect(formatDateLong('2026-09-14')).toBe('Sep 14, 2026');
    expect(formatDateWithWeekday('2026-09-14')).toBe('Mon, Sep 14');
  });

  it('accepts a full timestamp too', () => {
    const noon = new Date(2026, 0, 5, 12, 0, 0).toISOString();
    expect(formatDayMonth(noon)).toBe('Jan 5');
  });
});

describe('changeVerdict', () => {
  const site = (key: string) => MEASUREMENT_SITES.find((s) => s.key === key)!;
  const waist = site('waistCm');
  const arm = site('armCm');

  it('treats tape noise as neutral whatever the goal', () => {
    expect(changeVerdict(waist, 0.15, 'lose_fat')).toBe('neutral');
    expect(changeVerdict(arm, -0.1, 'build_muscle')).toBe('neutral');
  });

  it('flips the wanted direction for fat sites with the goal', () => {
    expect(changeVerdict(waist, -2, 'lose_fat')).toBe('toward');
    expect(changeVerdict(waist, 2, 'lose_fat')).toBe('away');
    expect(changeVerdict(waist, -2, 'recomposition')).toBe('toward');
  });

  it('does not call a growing waist a failure while bulking', () => {
    // It's a side effect of the goal, not a regression against it.
    expect(changeVerdict(waist, 2, 'gain_weight')).toBe('neutral');
    expect(changeVerdict(waist, 2, 'build_muscle')).toBe('neutral');
  });

  it('counts limb size as progress under any goal that wants size', () => {
    expect(changeVerdict(arm, 1, 'build_muscle')).toBe('toward');
    expect(changeVerdict(arm, 1, 'athletic_performance')).toBe('toward');
    // Holding size through a cut is the win, so losing it still reads as away.
    expect(changeVerdict(arm, -1, 'lose_fat')).toBe('away');
  });

  it('judges nothing when the goal is maintenance', () => {
    expect(changeVerdict(arm, 1, 'maintain')).toBe('neutral');
    expect(changeVerdict(waist, -1, 'maintain')).toBe('neutral');
  });
});

describe('supersets', () => {
  const ex = (id: string, supersetGroup?: string) => ({ id, supersetGroup });
  const tags = (list: ReturnType<typeof toggleSupersetAt>) => list.map((e) => e.supersetGroup ?? '-');

  it('links an exercise with the one below it', () => {
    const out = toggleSupersetAt([ex('a'), ex('b'), ex('c')], 0);
    expect(tags(out)).toEqual(['ss1', 'ss1', '-']);
  });

  it('extends the group rather than starting a new pair', () => {
    const out = toggleSupersetAt([ex('a', 'ss1'), ex('b', 'ss1'), ex('c')], 1);
    expect(tags(out)).toEqual(['ss1', 'ss1', 'ss1']);
  });

  it('absorbs the group below instead of tearing its head out', () => {
    const out = toggleSupersetAt([ex('a'), ex('b', 'ss1'), ex('c', 'ss1')], 0);
    expect(new Set(tags(out)).size).toBe(1);
  });

  it('splits at the seam and keeps the tail training together', () => {
    const out = toggleSupersetAt([ex('a', 'ss1'), ex('b', 'ss1'), ex('c', 'ss1')], 0);
    expect(out[0]!.supersetGroup).toBeUndefined();
    expect(out[1]!.supersetGroup).toBe(out[2]!.supersetGroup);
    expect(out[1]!.supersetGroup).toBeDefined();
  });

  it('leaves no tag on an exercise left on its own', () => {
    const out = toggleSupersetAt([ex('a', 'ss1'), ex('b', 'ss1')], 0);
    expect(tags(out)).toEqual(['-', '-']);
  });

  it('does nothing on the last exercise', () => {
    const list = [ex('a'), ex('b')];
    expect(toggleSupersetAt(list, 1)).toBe(list);
  });

  it('only groups adjacent exercises', () => {
    // Same tag, but separated — you cannot alternate between them.
    const groups = groupExercises([ex('a', 'ss1'), ex('b'), ex('c', 'ss1')]);
    expect(groups.map((g) => g.items.length)).toEqual([1, 1, 1]);
    expect(groups.every((g) => g.supersetId === null)).toBe(true);
  });

  it('demotes a group of one', () => {
    const groups = groupExercises([ex('a', 'ss1'), ex('b')]);
    expect(groups[0]!.supersetId).toBeNull();
  });

  it('rests fully only after the last exercise in the group', () => {
    const group = groupExercises([ex('a', 'ss1'), ex('b', 'ss1')])[0]!;
    expect(restAfterSet(group, 0, 150)).toBe(20);
    expect(restAfterSet(group, 1, 150)).toBe(150);
  });

  it('never stretches a short rest into a longer transition', () => {
    const group = groupExercises([ex('a', 'ss1'), ex('b', 'ss1')])[0]!;
    expect(restAfterSet(group, 0, 15)).toBe(15);
  });
});

describe('recentExerciseIds', () => {
  const w = (date: string, ids: string[], status = 'completed') =>
    ({ date, status, exercises: ids.map((exerciseId) => ({ exerciseId })) }) as never;

  it('lists each exercise once, most recent first', () => {
    const history = [
      w('2026-09-01', ['bench', 'fly']),
      w('2026-09-10', ['squat', 'bench']),
    ];
    expect(recentExerciseIds(history)).toEqual(['squat', 'bench', 'fly']);
  });

  it('ignores workouts that were never finished', () => {
    const history = [w('2026-09-12', ['deadlift'], 'in_progress'), w('2026-09-01', ['row'])];
    expect(recentExerciseIds(history)).toEqual(['row']);
  });

  it('stops at the limit', () => {
    const history = [w('2026-09-10', ['a', 'b', 'c', 'd'])];
    expect(recentExerciseIds(history, 2)).toEqual(['a', 'b']);
  });

  it('is empty with no history', () => {
    expect(recentExerciseIds([])).toEqual([]);
  });
});

describe('strengthChangePct', () => {
  const session = (date: string, lifts: Record<string, [number, number]>) =>
    ({
      date,
      status: 'completed',
      exercises: Object.entries(lifts).map(([exerciseId, [weightKg, reps]]) => ({
        exerciseId,
        sets: [{ id: `${date}-${exerciseId}`, weightKg, reps, rpe: null, completed: true }],
      })),
    }) as never;

  it('averages the per-lift change between the halves', () => {
    const history = [
      session('2026-09-01', { bench: [100, 5] }),
      session('2026-09-15', { bench: [110, 5] }),
    ];
    expect(strengthChangePct(history)).toBeCloseTo(10, 0);
  });

  it('is not fooled by which muscle group came up in the rotation', () => {
    // Heavy deadlift day early, light arm day late: session-best e1RM would
    // read as a huge regression even though bench went up.
    const history = [
      session('2026-09-01', { deadlift: [200, 3], bench: [100, 5] }),
      session('2026-09-15', { curl: [20, 10], bench: [110, 5] }),
    ];
    expect(strengthChangePct(history)!).toBeGreaterThan(0);
  });

  it('reads the history in date order, not storage order', () => {
    // Workouts are stored newest-first; a naive first-vs-last flips the sign.
    const newestFirst = [
      session('2026-09-15', { bench: [110, 5] }),
      session('2026-09-01', { bench: [100, 5] }),
    ];
    expect(strengthChangePct(newestFirst)).toBeCloseTo(10, 0);
  });

  it('returns null when no lift appears on both sides', () => {
    const history = [session('2026-09-01', { squat: [100, 5] }), session('2026-09-15', { bench: [100, 5] })];
    expect(strengthChangePct(history)).toBeNull();
  });

  it('returns null with too little history', () => {
    expect(strengthChangePct([])).toBeNull();
    expect(strengthChangePct([session('2026-09-01', { bench: [100, 5] })])).toBeNull();
  });

  it('ignores warm-up sets', () => {
    const history = [
      session('2026-09-01', { bench: [100, 5] }),
      {
        date: '2026-09-15',
        status: 'completed',
        exercises: [
          {
            exerciseId: 'bench',
            sets: [
              { id: 'w', weightKg: 300, reps: 5, rpe: null, completed: true, kind: 'warmup' },
              { id: 'x', weightKg: 110, reps: 5, rpe: null, completed: true },
            ],
          },
        ],
      } as never,
    ];
    expect(strengthChangePct(history)).toBeCloseTo(10, 0);
  });
});

describe('suggestToday', () => {
  const WEEK = ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16'];
  const TODAY = '2026-09-16';

  const session = (date: string, muscle: string, sets = 10) =>
    ({
      date,
      status: 'completed',
      exercises: [
        {
          exerciseId: `${muscle}-lift`,
          primaryMuscle: muscle,
          secondaryMuscles: [],
          sets: Array.from({ length: sets }, (_, i) => ({ id: `${date}${i}`, weightKg: 50, reps: 8, rpe: null, completed: true })),
        },
      ],
    }) as never;

  const base = { today: TODAY, weekDates: WEEK, trainingDaysPerWeek: 4, routines: [] };

  it('says nothing to do once today is logged', () => {
    const s = suggestToday({ ...base, workouts: [session(TODAY, 'chest')] });
    expect(s.kind).toBe('logged');
  });

  it('does not nag someone who already hit their weekly target', () => {
    const workouts = WEEK.slice(0, 4).map((d) => session(d, 'chest'));
    const s = suggestToday({ ...base, workouts });
    expect(s.kind).toBe('rest');
    expect(s.reason).toContain('4 of 4');
  });

  it('names the muscle furthest behind when there is no routine', () => {
    // A week of chest only: chest is covered, everything else is not.
    const s = suggestToday({ ...base, workouts: [session(WEEK[0]!, 'chest', 12)] });
    expect(s.kind).toBe('focus');
    expect(s.title).not.toContain('Chest');
    expect(s.focus.length).toBeGreaterThan(0);
  });

  it('prefers a routine that covers what is behind', () => {
    const routines = [
      { id: 'r1', name: 'Chest day', muscles: ['chest'] as never },
      { id: 'r2', name: 'Leg day', muscles: ['quads', 'hamstrings'] as never },
    ];
    const s = suggestToday({ ...base, workouts: [session(WEEK[0]!, 'chest', 20)], routines });
    expect(s.kind).toBe('routine');
    expect(s.routineId).toBe('r2');
  });

  it('only counts sessions inside the week window', () => {
    // Four sessions, but all of them last week.
    const workouts = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'].map((d) => session(d, 'chest'));
    expect(suggestToday({ ...base, workouts }).kind).not.toBe('rest');
  });

  it('ranks deficits by how far below the minimum they are', () => {
    const deficits = volumeDeficits({ chest: 10, back: 2 });
    expect(deficits.find((d) => d.muscle === 'chest')).toBeUndefined();
    expect(deficits[0]!.missing).toBeGreaterThanOrEqual(deficits[deficits.length - 1]!.missing);
  });
});

describe('protocol adherence', () => {
  const TODAY = '2026-09-30';
  const proto = (over: Record<string, unknown> = {}) =>
    ({
      id: 'p1',
      name: 'Item',
      dose: 1,
      unit: 'mg',
      frequency: 'daily',
      reminderEnabled: false,
      startedAt: '2026-09-01',
      active: true,
      ...over,
    }) as never;
  const log = (date: string, taken = true) => ({ id: date, protocolId: 'p1', date, taken, dose: 1, unit: 'mg', time: '08:00' }) as never;

  it('counts only the days the protocol has been running', () => {
    expect(activeDaysInWindow('2026-09-01', 30, TODAY)).toBe(30);
    // Started inside the window: 25th to 30th inclusive.
    expect(activeDaysInWindow('2026-09-25', 30, TODAY)).toBe(6);
    expect(activeDaysInWindow('2026-12-01', 30, TODAY)).toBe(0);
  });

  it('derives expected doses from the schedule the user set', () => {
    expect(expectedDoses(proto(), 30, TODAY)).toBe(30);
    expect(expectedDoses(proto({ frequency: 'eod' }), 30, TODAY)).toBe(15);
    expect(expectedDoses(proto({ frequency: '2x_week' }), 28, TODAY)).toBe(8);
  });

  it('has no expected count for a custom schedule', () => {
    expect(expectedDoses(proto({ frequency: 'custom' }), 30, TODAY)).toBeNull();
    const a = adherence(proto({ frequency: 'custom' }), [log('2026-09-29')], 30, TODAY);
    expect(a.ratio).toBeNull();
    expect(a.taken).toBe(1);
  });

  it('measures against the schedule, not against the log', () => {
    // Three days logged, all taken. The old "taken / logged" read 100%.
    const logs = [log('2026-09-28'), log('2026-09-29'), log('2026-09-30')];
    const a = adherence(proto(), logs, 30, TODAY);
    expect(a.taken).toBe(3);
    expect(a.expected).toBe(30);
    expect(a.ratio).toBeCloseTo(0.1, 5);
  });

  it('ignores logs outside the window and skipped days', () => {
    const logs = [log('2026-07-01'), log('2026-09-29', false), log('2026-09-30')];
    expect(adherence(proto(), logs, 30, TODAY).taken).toBe(1);
  });

  it('never reports more than 100%', () => {
    const logs = Array.from({ length: 10 }, (_, i) => log(`2026-09-${String(21 + i).padStart(2, '0')}`));
    const a = adherence(proto({ frequency: 'weekly' }), logs, 30, TODAY);
    expect(a.ratio).toBe(1);
  });
});

describe('achievements', () => {
  const inputs = {
    workoutsCompleted: 12,
    currentDailyStreak: 5,
    proteinStreak: 7,
    hydrationStreak: 2,
    prsSet: 3,
    progressPhotos: 0,
    bestDisciplineScore: 88,
    gymsClaimed: 0,
    gymKindsClaimed: 0,
    rareGymsClaimed: 0,
  };

  it('unlocks exactly the badges whose target is met', () => {
    const ids = evaluateAchievements(inputs);
    expect(ids).toContain('first_workout');
    expect(ids).toContain('workouts_10');
    expect(ids).toContain('protein_week');
    expect(ids).not.toContain('workouts_100');
    expect(ids).not.toContain('streak_7');
    expect(ids).not.toContain('perfect_day');
  });

  it('reports progress in the badge\'s own units', () => {
    const centurion = ACHIEVEMENT_CATALOG.find((a) => a.id === 'workouts_100')!;
    const p = achievementProgress(centurion, inputs);
    expect(p).toEqual({ current: 12, target: 100, ratio: 0.12, remaining: 88 });
  });

  it('never shows more than the target, or a ratio above 1', () => {
    const first = ACHIEVEMENT_CATALOG.find((a) => a.id === 'first_workout')!;
    const p = achievementProgress(first, inputs);
    expect(p.current).toBe(1);
    expect(p.ratio).toBe(1);
    expect(p.remaining).toBe(0);
  });

  it('agrees with the unlock rule at the threshold', () => {
    // One table drives both, so this can only break if that stops being true.
    for (const a of ACHIEVEMENT_CATALOG) {
      const atTarget = { ...inputs, [a.metric]: a.target };
      const belowTarget = { ...inputs, [a.metric]: a.target - 1 };
      expect(evaluateAchievements(atTarget)).toContain(a.id);
      expect(achievementProgress(a, atTarget).ratio).toBe(1);
      expect(evaluateAchievements(belowTarget)).not.toContain(a.id);
    }
  });

  it('orders locked badges by how close they are', () => {
    const locked = ACHIEVEMENT_CATALOG.map((a) => ({ ...a, unlockedAt: null }));
    const next = nextAchievements(locked, inputs, 3);
    // first_workout is already at its target, so it leads; centurion is last.
    expect(next[0]!.id).not.toBe('workouts_100');
    const ratios = next.map((a) => achievementProgress(a, inputs).ratio);
    expect([...ratios].sort((x, y) => y - x)).toEqual(ratios);
  });
});

describe('trend maths', () => {
  const at = (day: number, value: number) => ({ date: `2026-09-${String(day).padStart(2, '0')}`, value });

  it('averages over what exists rather than dropping the start', () => {
    const out = movingAverage([at(1, 10), at(2, 20), at(3, 30)], 3);
    expect(out.map((p) => p.value)).toEqual([10, 15, 20]);
    expect(out).toHaveLength(3);
  });

  it('only looks backwards', () => {
    // The last point must not be pulled by values that have not happened.
    const out = movingAverage([at(1, 10), at(2, 10), at(3, 100)], 2);
    expect(out[out.length - 1]!.value).toBe(55);
    expect(out[0]!.value).toBe(10);
  });

  it('smooths a spike without erasing the level', () => {
    const flat = [at(1, 80), at(2, 80), at(3, 84), at(4, 80), at(5, 80)];
    const avg = movingAverage(flat, 5);
    expect(avg[avg.length - 1]!.value).toBeCloseTo(80.8, 5);
  });

  it('fits a rate across every reading, not the first and last', () => {
    // A clean 1 per day is 7 per week.
    const series = [at(1, 100), at(2, 101), at(3, 102), at(4, 103)];
    expect(ratePerWeek(series)).toBeCloseTo(7, 5);
  });

  it('is not thrown by one unlucky weigh-in the way first-vs-last is', () => {
    // Falling steadily, but the last reading is high. First-vs-last says +1.
    const series = [at(1, 80), at(2, 79.5), at(3, 79), at(4, 78.5), at(5, 81)];
    expect(series[series.length - 1]!.value - series[0]!.value).toBe(1);
    expect(ratePerWeek(series)!).toBeLessThan(1.5);
  });

  it('returns null when a rate is undefined', () => {
    expect(ratePerWeek([])).toBeNull();
    expect(ratePerWeek([at(1, 80)])).toBeNull();
    // Every reading on the same day: no slope exists.
    expect(ratePerWeek([at(1, 80), at(1, 81)])).toBeNull();
  });
});

describe('rep max estimates', () => {
  it('returns the weight itself at one rep, under either formula', () => {
    expect(epley1RM(100, 1)).toBe(100);
    expect(brzycki1RM(100, 1)).toBe(100);
  });

  it('is undefined where Brzycki diverges', () => {
    // The 37 - reps denominator hits zero at 37 and flips sign past it.
    expect(brzycki1RM(50, 36)).toBeNull();
    expect(brzycki1RM(50, 40)).toBeNull();
    expect(brzycki1RM(50, 35)).not.toBeNull();
  });

  it('rejects nonsense input rather than returning a number', () => {
    expect(brzycki1RM(0, 5)).toBeNull();
    expect(brzycki1RM(100, 0)).toBeNull();
    expect(epley1RM(100, 0)).toBe(0);
    expect(weightForReps(0, 5)).toBe(0);
  });

  it('round-trips a max back to the weight that produced it', () => {
    const max = epley1RM(100, 5);
    expect(weightForReps(max, 5)).toBeCloseTo(100, 1);
  });

  it('asks for less weight as the reps go up', () => {
    const max = epley1RM(140, 3);
    const weights = [1, 3, 5, 8, 12].map((r) => weightForReps(max, r));
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  });

  it('expresses a rep count as a percentage of max', () => {
    expect(percentOfMax(1)).toBeCloseTo(96.8, 1);
    expect(percentOfMax(10)).toBeCloseTo(75, 1);
    expect(percentOfMax(0)).toBe(0);
  });
});

describe('nearestValue', () => {
  const series = [
    { date: '2026-08-01', value: 90 },
    { date: '2026-09-01', value: 86 },
    { date: '2026-09-10', value: 85 },
  ];

  it('picks the closest reading in either direction', () => {
    expect(nearestValue(series, '2026-09-03')!.date).toBe('2026-09-01');
    expect(nearestValue(series, '2026-09-08')!.date).toBe('2026-09-10');
  });

  it('refuses to reach beyond the tolerance', () => {
    // Nothing within a week of mid-August, so no weight belongs to that photo.
    expect(nearestValue(series, '2026-08-15')).toBeNull();
    expect(nearestValue(series, '2026-08-15', 30)!.date).toBe('2026-08-01');
  });

  it('is null for an empty series', () => {
    expect(nearestValue([], '2026-09-01')).toBeNull();
  });

  it('counts whole days between dates in either order', () => {
    expect(daysBetween('2026-09-01', '2026-09-10')).toBe(9);
    expect(daysBetween('2026-09-10', '2026-09-01')).toBe(9);
    expect(daysBetween('2026-09-01', '2026-09-01')).toBe(0);
  });
});

describe('frequentFoods', () => {
  const entry = (name: string, date: string, over: Record<string, unknown> = {}) =>
    ({
      id: `${name}${date}`,
      date,
      slot: 'lunch',
      name,
      quantity: 1,
      servingLabel: '100 g',
      macros: { calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6, fiberG: 0 },
      source: 'search',
      isEstimate: false,
      loggedAt: `${date}T12:00:00Z`,
      ...over,
    }) as never;

  it('ranks by how often each food is logged', () => {
    const log = [entry('Chicken', '2026-09-01'), entry('Rice', '2026-09-01'), entry('Chicken', '2026-09-02')];
    const out = frequentFoods(log);
    expect(out[0]!.name).toBe('Chicken');
    expect(out[0]!.count).toBe(2);
    expect(out[1]!.name).toBe('Rice');
  });

  it('keeps different servings of the same food apart', () => {
    // Re-logging "1 breast" when you meant "100 g" logs the wrong portion.
    const log = [entry('Chicken', '2026-09-01'), entry('Chicken', '2026-09-02', { servingLabel: '1 breast' })];
    expect(frequentFoods(log)).toHaveLength(2);
  });

  it('groups case and whitespace differences', () => {
    const log = [entry('Chicken', '2026-09-01'), entry(' chicken ', '2026-09-02')];
    expect(frequentFoods(log)).toHaveLength(1);
  });

  it('offers the portion used most recently, not the first one', () => {
    const log = [
      entry('Chicken', '2026-09-01', { quantity: 1 }),
      entry('Chicken', '2026-09-05', { quantity: 2.5 }),
      entry('Chicken', '2026-09-03', { quantity: 2 }),
    ];
    expect(frequentFoods(log)[0]!.quantity).toBe(2.5);
  });

  it('breaks ties on recency and respects the limit', () => {
    const log = [entry('A', '2026-09-01'), entry('B', '2026-09-09')];
    const out = frequentFoods(log);
    expect(out[0]!.name).toBe('B');
    expect(frequentFoods(log, 1)).toHaveLength(1);
  });
});

describe('personalRecords', () => {
  const set = (weightKg: number, reps: number, over: Record<string, unknown> = {}) =>
    ({ id: `${weightKg}x${reps}`, weightKg, reps, rpe: null, completed: true, ...over });
  const session = (id: string, date: string, sets: unknown[], name = 'Bench') =>
    ({
      id,
      date,
      status: 'completed',
      exercises: [{ exerciseId: 'bench', name, primaryMuscle: 'chest', sets }],
    }) as never;

  it('keeps the heaviest set and the best estimated max apart', () => {
    // 80x12 estimates 112, above 100x1, but 100 is still the heavier lift.
    const history = [session('w1', '2026-09-01', [set(100, 1), set(80, 12)])];
    const [r] = personalRecords(history);
    expect(r!.heaviest.weightKg).toBe(100);
    expect(r!.best.weightKg).toBe(80);
    expect(r!.best.e1RMKg).toBeGreaterThan(r!.heaviest.e1RMKg);
  });

  it('ignores warm-ups and incomplete sets', () => {
    const history = [
      session('w1', '2026-09-01', [
        set(200, 5, { kind: 'warmup' }),
        set(180, 5, { completed: false }),
        set(100, 5),
      ]),
    ];
    expect(personalRecords(history)[0]!.best.weightKg).toBe(100);
  });

  it('measures improvement against the first session, not the first set', () => {
    const history = [
      session('w1', '2026-09-01', [set(100, 5), set(110, 5)]),
      session('w2', '2026-09-08', [set(120, 5)]),
    ];
    const [r] = personalRecords(history);
    expect(r!.sessions).toBe(2);
    expect(r!.improvementPct).toBeGreaterThan(0);
  });

  it('reports no improvement rather than zero for a single session', () => {
    const history = [session('w1', '2026-09-01', [set(100, 5)])];
    expect(personalRecords(history)[0]!.improvementPct).toBeNull();
  });

  it('reads history in date order whatever the storage order', () => {
    // Newest-first storage would otherwise compare against the wrong baseline.
    const history = [
      session('w2', '2026-09-08', [set(120, 5)]),
      session('w1', '2026-09-01', [set(100, 5)]),
    ];
    expect(personalRecords(history)[0]!.improvementPct).toBeGreaterThan(0);
  });

  it('sorts the strongest lift first', () => {
    const history = [
      session('w1', '2026-09-01', [set(60, 5)], 'Curl'),
      {
        id: 'w2',
        date: '2026-09-02',
        status: 'completed',
        exercises: [{ exerciseId: 'dl', name: 'Deadlift', primaryMuscle: 'back', sets: [set(200, 5)] }],
      } as never,
    ];
    expect(personalRecords(history)[0]!.name).toBe('Deadlift');
  });

  it('finds records without needing an isPr flag on the set', () => {
    // A restored backup carries no flags; the events still have to be there.
    const history = [
      session('w1', '2026-09-01', [set(100, 5)]),
      session('w2', '2026-09-08', [set(110, 5)]),
    ];
    const events = recentPrEvents(history);
    expect(events).toHaveLength(1);
    expect(events[0]!.weightKg).toBe(110);
  });

  it('treats the first session with a lift as a baseline, not a record', () => {
    expect(recentPrEvents([session('w1', '2026-09-01', [set(100, 5)])])).toEqual([]);
  });

  it('posts one record per session, not one per set on the way up', () => {
    const history = [
      session('w1', '2026-09-01', [set(80, 5)]),
      session('w2', '2026-09-08', [set(90, 5), set(100, 5), set(105, 5)]),
    ];
    const events = recentPrEvents(history);
    expect(events).toHaveLength(1);
    expect(events[0]!.weightKg).toBe(105);
  });

  it('does not post a record for a session that failed to beat the best', () => {
    const history = [
      session('w1', '2026-09-01', [set(120, 5)]),
      session('w2', '2026-09-08', [set(100, 5)]),
      session('w3', '2026-09-15', [set(125, 5)]),
    ];
    const events = recentPrEvents(history);
    expect(events).toHaveLength(1);
    expect(events[0]!.date).toBe('2026-09-15');
  });

  it('returns newest first and respects the limit', () => {
    const history = [
      session('w1', '2026-09-01', [set(100, 5)]),
      session('w2', '2026-09-08', [set(110, 5)]),
      session('w3', '2026-09-15', [set(120, 5)]),
    ];
    expect(recentPrEvents(history)[0]!.date).toBe('2026-09-15');
    expect(recentPrEvents(history, 1)).toHaveLength(1);
  });
});

describe('repMaxes', () => {
  const set = (weightKg: number, reps: number, over: Record<string, unknown> = {}) =>
    ({ id: `${weightKg}x${reps}`, weightKg, reps, rpe: null, completed: true, ...over });
  const session = (id: string, date: string, sets: unknown[]) =>
    ({ id, date, status: 'completed', exercises: [{ exerciseId: 'bench', name: 'Bench', primaryMuscle: 'chest', sets }] }) as never;

  it('counts a heavier set for every rep count at or below it', () => {
    // Eight reps at 100 proves five at 100; a table of exact matches would be
    // almost entirely blank for anyone training in ranges.
    const out = repMaxes([session('w1', '2026-09-01', [set(100, 8)])], 'bench');
    const at = (reps: number) => out.find((m) => m.reps === reps);
    expect(at(1)!.weightKg).toBe(100);
    expect(at(5)!.weightKg).toBe(100);
    expect(at(8)!.weightKg).toBe(100);
    expect(at(10)).toBeUndefined();
  });

  it('takes the heaviest weight per rep count across sessions', () => {
    const history = [
      session('w1', '2026-09-01', [set(140, 1)]),
      session('w2', '2026-09-08', [set(100, 10)]),
    ];
    const out = repMaxes(history, 'bench');
    expect(out.find((m) => m.reps === 1)!.weightKg).toBe(140);
    expect(out.find((m) => m.reps === 10)!.weightKg).toBe(100);
  });

  it('ignores warm-ups and other exercises', () => {
    const history = [session('w1', '2026-09-01', [set(300, 5, { kind: 'warmup' }), set(100, 5)])];
    expect(repMaxes(history, 'bench').find((m) => m.reps === 5)!.weightKg).toBe(100);
    expect(repMaxes(history, 'squat')).toEqual([]);
  });
});

describe('exerciseSessions', () => {
  const set = (weightKg: number, reps: number, over: Record<string, unknown> = {}) =>
    ({ id: `${weightKg}x${reps}`, weightKg, reps, rpe: null, completed: true, ...over });
  const session = (id: string, date: string, sets: unknown[]) =>
    ({ id, date, name: 'Push', status: 'completed', exercises: [{ exerciseId: 'bench', name: 'Bench', primaryMuscle: 'chest', sets }] }) as never;

  it('returns sessions newest first with the sets as logged', () => {
    const history = [
      session('w1', '2026-09-01', [set(100, 5)]),
      session('w2', '2026-09-08', [set(105, 5), set(105, 4)]),
    ];
    const out = exerciseSessions(history, 'bench');
    expect(out[0]!.date).toBe('2026-09-08');
    expect(out[0]!.sets).toHaveLength(2);
  });

  it('excludes warm-ups from volume but still lists them', () => {
    const history = [session('w1', '2026-09-01', [set(60, 10, { kind: 'warmup' }), set(100, 5)])];
    const [s] = exerciseSessions(history, 'bench');
    expect(s!.sets).toHaveLength(2);
    expect(s!.volumeKg).toBe(500);
    expect(s!.sets[0]!.warmup).toBe(true);
  });

  it('skips sessions where nothing was completed', () => {
    const history = [session('w1', '2026-09-01', [set(100, 5, { completed: false })])];
    expect(exerciseSessions(history, 'bench')).toEqual([]);
  });

  it('respects the limit', () => {
    const history = [1, 2, 3].map((i) => session(`w${i}`, `2026-09-0${i}`, [set(100, 5)]));
    expect(exerciseSessions(history, 'bench', 2)).toHaveLength(2);
  });
});

describe('coach intents', () => {
  const settings: CoachSettings = {
    personality: 'motivational',
    aggression: 60,
    allowAggressiveLanguage: true,
    enabled: true,
  };
  const ctx: CoachContext = {
    disciplineScore: 55,
    dailyStreak: 3,
    workoutPlanned: true,
    workoutCompleted: false,
    proteinRemainingG: 60,
    waterRemainingOz: 20,
    stepsRemaining: 3000,
    missedWorkoutsThisWeek: 0,
    timeOfDay: 'afternoon',
  };

  it('puts training above everything else that is open', () => {
    // A missed session cannot be made up with a glass of water.
    expect(openGaps(ctx)[0]!.key).toBe('workout');
  });

  it('picks the quickest gap to close as the next win, not the biggest', () => {
    expect(easiestGap(ctx)!.key).toBe('water');
  });

  it('reports nothing open once every target is met', () => {
    const done = { ...ctx, workoutCompleted: true, proteinRemainingG: 0, waterRemainingOz: 0, stepsRemaining: 0 };
    expect(openGaps(done)).toEqual([]);
    expect(easiestGap(done)).toBeNull();
  });

  it('gives a different answer to each question', () => {
    const asked = (['weakest', 'push', 'next_win', 'on_track'] as const).map(
      (intent) => answerCoachQuestion(ctx, settings, intent).text,
    );
    expect(new Set(asked).size).toBe(asked.length);
  });

  it('answers the question from the real context, unmodified', () => {
    // The screen used to inflate protein-remaining to force variety; the same
    // context must now produce the protein number the athlete actually has.
    const proteinOnly = { ...ctx, workoutPlanned: false, waterRemainingOz: 0, stepsRemaining: 0 };
    expect(answerCoachQuestion(proteinOnly, settings, 'weakest').text).toContain('60g');
  });

  it('never claims work is outstanding when it is not', () => {
    const done = { ...ctx, workoutCompleted: true, proteinRemainingG: 0, waterRemainingOz: 0, stepsRemaining: 0, disciplineScore: 100 };
    for (const intent of ['weakest', 'next_win', 'push'] as const) {
      expect(answerCoachQuestion(done, settings, intent).tone).not.toBe('nudge');
    }
  });

  it('stays quiet when the coach is switched off, whatever is asked', () => {
    const off = { ...settings, enabled: false };
    for (const intent of ['weakest', 'push', 'next_win', 'on_track'] as const) {
      expect(answerCoachQuestion(ctx, off, intent).text).toContain('Coach is off');
    }
  });

  it('softens aggressive personalities when the user has asked it to', () => {
    const savage: CoachSettings = { ...settings, personality: 'savage', allowAggressiveLanguage: false };
    const raw: CoachSettings = { ...settings, personality: 'savage', allowAggressiveLanguage: true };
    const softened = answerCoachQuestion(ctx, savage, 'weakest').text;
    expect(softened).not.toBe(answerCoachQuestion(ctx, raw, 'weakest').text);
    expect(softened).toBe(answerCoachQuestion(ctx, settings, 'weakest').text);
  });
});

describe('summariseIntake', () => {
  const targets = { calories: 2600, proteinG: 180, carbsG: 260, fatG: 80, waterOz: 110, steps: 10000, sleepMinutes: 480 };
  const day = (date: string, calories: number, proteinG: number, logged = true) =>
    ({ date, calories, proteinG, carbsG: 0, fatG: 0, logged });

  it('averages over logged days only', () => {
    // Counting the blank day as zero would report 1300 and make a missed day
    // look like a fast.
    const out = summariseIntake([day('2026-09-01', 2600, 180), day('2026-09-02', 0, 0, false)], targets);
    expect(out.avgCalories).toBe(2600);
    expect(out.loggedDays).toBe(1);
  });

  it('reports zero rather than NaN when nothing is logged', () => {
    const out = summariseIntake([day('2026-09-01', 0, 0, false)], targets);
    expect(out.avgCalories).toBe(0);
    expect(out.avgProteinG).toBe(0);
    expect(out.loggedDays).toBe(0);
  });

  it('counts a protein day as hit at the target, not above it', () => {
    const out = summariseIntake([day('2026-09-01', 2600, 180), day('2026-09-02', 2600, 179)], targets);
    expect(out.proteinHits).toBe(1);
  });

  it('allows calories within ten percent either side', () => {
    const out = summariseIntake(
      [
        day('2026-09-01', 2600, 0),
        day('2026-09-02', 2860, 0), // +10%
        day('2026-09-03', 2340, 0), // -10%
        day('2026-09-04', 2900, 0), // outside
      ],
      targets,
    );
    expect(out.calorieHits).toBe(3);
  });

  it('never counts an unlogged day as a hit', () => {
    const out = summariseIntake([day('2026-09-01', 2600, 180, false)], targets);
    expect(out.calorieHits).toBe(0);
    expect(out.proteinHits).toBe(0);
  });
});

describe('isSubscriptionActive', () => {
  const now = new Date('2026-09-16T12:00:00Z');

  it('is false for the free tier however the dates read', () => {
    expect(isSubscriptionActive({ tier: 'free', productId: null, expiresAt: null }, now)).toBe(false);
    expect(isSubscriptionActive({ tier: 'free', productId: null, expiresAt: '2030-01-01T00:00:00Z' }, now)).toBe(false);
  });

  it('is false once a Pro subscription has expired', () => {
    // The tier stays 'pro' in whatever was last read from the store, so this is
    // the case that hands Pro to someone whose access ran out last month.
    const lapsed = { tier: 'pro' as const, productId: 'p', expiresAt: '2026-08-01T00:00:00Z' };
    expect(isSubscriptionActive(lapsed, now)).toBe(false);
  });

  it('is true while a Pro subscription is still running', () => {
    expect(isSubscriptionActive({ tier: 'pro', productId: 'p', expiresAt: '2026-10-01T00:00:00Z' }, now)).toBe(true);
  });

  it('treats no expiry as a lifetime entitlement', () => {
    // Revoking access from a paying customer over missing metadata is worse
    // than honouring it.
    expect(isSubscriptionActive({ tier: 'pro', productId: 'p', expiresAt: null }, now)).toBe(true);
    expect(isSubscriptionActive({ tier: 'pro', productId: 'p', expiresAt: 'not a date' }, now)).toBe(true);
  });

  it('expires exactly at the boundary, not after it', () => {
    const atExpiry = { tier: 'pro' as const, productId: 'p', expiresAt: now.toISOString() };
    expect(isSubscriptionActive(atExpiry, now)).toBe(false);
  });
});

describe('balanceMacros', () => {
  it('solves carbs so the three macros hit the calorie target', () => {
    const out = balanceMacros({ calories: 2650, proteinG: 180, carbsG: 265, fatG: 80 })!;
    expect(out.proteinG).toBe(180);
    expect(out.fatG).toBe(80);
    expect(out.proteinG * 4 + out.carbsG * 4 + out.fatG * 9).toBeCloseTo(2650, -1);
  });

  it('can solve fat instead, without touching the others', () => {
    const out = balanceMacros({ calories: 2650, proteinG: 180, carbsG: 265, fatG: 80 }, 'fatG')!;
    expect(out.carbsG).toBe(265);
    expect(out.proteinG * 4 + out.carbsG * 4 + out.fatG * 9).toBeCloseTo(2650, -1);
  });

  it('leaves an already-balanced set alone', () => {
    // 180p + 80f + 265c is 2500 kcal exactly.
    const out = balanceMacros({ calories: 2500, proteinG: 180, carbsG: 265, fatG: 80 })!;
    expect(out.carbsG).toBe(265);
  });

  it('refuses rather than returning a negative target', () => {
    // Protein and fat alone already blow past the calorie number.
    expect(balanceMacros({ calories: 1000, proteinG: 200, carbsG: 100, fatG: 80 })).toBeNull();
  });

  it('is exactly satisfiable at the boundary', () => {
    // 200p + 0f = 800 kcal, so carbs land on zero rather than going negative.
    const out = balanceMacros({ calories: 800, proteinG: 200, carbsG: 50, fatG: 0 })!;
    expect(out.carbsG).toBe(0);
  });
});

describe('program position', () => {
  const program = programById('upper_lower_4')!;
  const enrolment = (done: number) => ({
    programId: program.id,
    startedOn: '2026-09-01',
    completedDates: Array.from({ length: done }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`),
    completedDayIndices: [],
  });

  it('advances on sessions completed, not on days elapsed', () => {
    // A plan driven by the calendar marks a missed Tuesday failed; this one
    // simply waits.
    expect(programPosition(program, enrolment(0)).day!.name).toBe(program.days[0]!.name);
    expect(programPosition(program, enrolment(1)).day!.name).toBe(program.days[1]!.name);
  });

  it('rolls into the next week after a full week of sessions', () => {
    expect(programPosition(program, enrolment(3)).week).toBe(1);
    expect(programPosition(program, enrolment(4)).week).toBe(2);
    expect(programPosition(program, enrolment(4)).day!.name).toBe(program.days[0]!.name);
  });

  it('finishes once every session is done and offers no next day', () => {
    const total = program.weeks * program.daysPerWeek;
    const end = programPosition(program, enrolment(total));
    expect(end.finished).toBe(true);
    expect(end.day).toBeNull();
    expect(end.week).toBe(program.weeks);
  });

  it('does not run past the end when extra sessions are logged', () => {
    const total = program.weeks * program.daysPerWeek;
    const over = programPosition(program, enrolment(total + 10));
    expect(over.sessionsDone).toBe(total);
    expect(over.week).toBe(program.weeks);
  });

  it('starts week one at the athlete own weights', () => {
    expect(weekMultiplier(program, 1)).toBe(1);
    expect(weekMultiplier(program, 3)).toBeGreaterThan(1);
  });

  it('keeps progression modest across a whole block', () => {
    // A plan promising a big weekly jump for two months is selling something.
    for (const p of PROGRAMS) {
      expect(weekMultiplier(p, p.weeks)).toBeLessThan(1.2);
    }
  });

  it('spreads projected sessions across the week rather than stacking them', () => {
    const dates = projectedDates(program, '2026-09-16', 3);
    expect(dates[0]).toBe('2026-09-16');
    expect(new Set(dates).size).toBe(3);
  });

  it('flags a plan left idle for weeks', () => {
    const idle = { ...enrolment(2), completedDates: ['2026-08-01', '2026-08-02'] };
    expect(isStale(idle, '2026-09-16')).toBe(true);
    expect(isStale({ ...enrolment(2), completedDates: ['2026-09-15'] }, '2026-09-16')).toBe(false);
  });

  it('measures idleness from the start date when nothing has been done', () => {
    const never = { programId: program.id, startedOn: '2026-08-01', completedDates: [], completedDayIndices: [] };
    expect(isStale(never, '2026-09-16')).toBe(true);
  });
});

describe('built-in programs', () => {
  it('declares as many days as it lists', () => {
    for (const p of PROGRAMS) expect(p.days).toHaveLength(p.daysPerWeek);
  });

  it('references exercises that exist in the library', () => {
    for (const p of PROGRAMS) {
      for (const day of p.days) {
        for (const e of day.exercises) {
          // A name falling back to the raw id means the library lookup missed.
          expect(e.name).not.toBe(e.exerciseId);
        }
      }
    }
  });

  it('pairs superset tags only with an adjacent partner', () => {
    for (const p of PROGRAMS) {
      for (const day of p.days) {
        const tagged = day.exercises.filter((e) => e.supersetGroup);
        for (const e of tagged) {
          const i = day.exercises.indexOf(e);
          const neighbours = [day.exercises[i - 1], day.exercises[i + 1]];
          expect(neighbours.some((n) => n?.supersetGroup === e.supersetGroup)).toBe(true);
        }
      }
    }
  });
});

describe('exercise tracking modes', () => {
  const set = (over: Record<string, unknown> = {}) =>
    ({ id: 's', weightKg: null, reps: null, rpe: null, completed: true, ...over }) as never;

  it('counts the athlete own mass on a bodyweight movement', () => {
    // Forty hard pull-ups used to register as zero work.
    expect(setVolumeKg(set({ weightKg: 0, reps: 10 }), 'bodyweight', 80)).toBe(800);
    expect(setVolumeKg(set({ weightKg: 0, reps: 10 }), 'load', 80)).toBe(0);
  });

  it('treats entered weight as added load, not total load', () => {
    expect(effectiveLoadKg(set({ weightKg: 20 }), 'bodyweight', 80)).toBe(100);
    expect(effectiveLoadKg(set({ weightKg: 20 }), 'load', 80)).toBe(20);
  });

  it('handles an assisted movement without going negative', () => {
    // A band or assist machine takes weight off; it cannot take off more than
    // the athlete weighs.
    expect(effectiveLoadKg(set({ weightKg: -30 }), 'bodyweight', 80)).toBe(50);
    expect(effectiveLoadKg(set({ weightKg: -200 }), 'bodyweight', 80)).toBe(0);
  });

  it('gives a held set no volume rather than a fabricated one', () => {
    // A 60-second plank and a 100kg squat are not commensurable.
    expect(setVolumeKg(set({ seconds: 60, reps: 1 }), 'duration', 80)).toBe(0);
  });

  it('knows when a set of each kind counts as logged', () => {
    expect(isSetLogged(set({ seconds: 45 }), 'duration')).toBe(true);
    expect(isSetLogged(set({ reps: 5 }), 'duration')).toBe(false);
    expect(isSetLogged(set({ reps: 5 }), 'load')).toBe(true);
    expect(isSetLogged(set({ reps: 5, completed: false }), 'load')).toBe(false);
  });

  it('formats a hold as time and a rep set as a count', () => {
    expect(formatSetAmount(set({ seconds: 90 }), 'duration')).toBe('1:30');
    expect(formatSetAmount(set({ seconds: 45 }), 'duration')).toBe('45s');
    expect(formatSetAmount(set({ reps: 8 }), 'load')).toBe('8');
  });

  it('labels the columns for the mode', () => {
    expect(amountLabel('duration')).toBe('TIME');
    expect(amountLabel('load')).toBe('REPS');
    expect(loadLabel('duration', 'LB')).toBeNull();
    // The plus sign says the number is added to bodyweight, not the whole load.
    expect(loadLabel('bodyweight', 'LB')).toBe('+LB');
    expect(loadLabel('load', 'LB')).toBe('LB');
  });
});

describe('substitutesFor', () => {
  const bench = libraryExercise('barbell_bench_press')!;

  it('never offers the exercise itself', () => {
    expect(substitutesFor(bench, EXERCISE_LIBRARY).map((e) => e.id)).not.toContain(bench.id);
  });

  it('leads with something that trains the same muscle', () => {
    const [first] = substitutesFor(bench, EXERCISE_LIBRARY);
    expect(first!.primaryMuscle === bench.primaryMuscle || first!.secondaryMuscles.includes(bench.primaryMuscle)).toBe(true);
  });

  it('excludes exercises that do not train the muscle at all', () => {
    for (const option of substitutesFor(bench, EXERCISE_LIBRARY, [], 50)) {
      const related = option.primaryMuscle === bench.primaryMuscle || option.secondaryMuscles.includes(bench.primaryMuscle);
      expect(related).toBe(true);
    }
  });

  it('prefers equipment the athlete listed', () => {
    // The point of a swap is usually that the kit is occupied or absent.
    const dumbbellOnly = substitutesFor(bench, EXERCISE_LIBRARY, ['dumbbells'], 3);
    const usable = dumbbellOnly.filter((e) => e.equipment === 'dumbbells' || e.equipment === 'bodyweight');
    expect(usable.length).toBeGreaterThan(0);
  });

  it('always treats bodyweight as available', () => {
    const kettlebellOnly = substitutesFor(bench, EXERCISE_LIBRARY, ['kettlebell'], 20);
    expect(kettlebellOnly.some((e) => e.equipment === 'bodyweight')).toBe(true);
  });

  it('respects the limit', () => {
    expect(substitutesFor(bench, EXERCISE_LIBRARY, [], 2)).toHaveLength(2);
  });
});

describe('rest days and the workout streak', () => {
  const day = (date: string, over: Record<string, unknown> = {}) => ({
    date,
    workoutDone: false,
    proteinHit: true,
    nutritionHit: true,
    hydrationHit: true,
    dayComplete: true,
    ...over,
  });

  it('holds the workout streak through a planned rest day', () => {
    // Training four days a week as planned could never show a streak above one.
    let s = emptyStreaks();
    s = applyDailyOutcome(s, day('2026-01-01', { workoutDone: true }));
    s = applyDailyOutcome(s, day('2026-01-02', { restDay: true }));
    s = applyDailyOutcome(s, day('2026-01-03', { workoutDone: true }));
    expect(s.workout).toBe(2);
  });

  it('still breaks the streak on a day that was meant for training', () => {
    let s = emptyStreaks();
    s = applyDailyOutcome(s, day('2026-01-01', { workoutDone: true }));
    s = applyDailyOutcome(s, day('2026-01-02', { restDay: false }));
    expect(s.workout).toBe(0);
  });

  it('does not treat a long absence as rest', () => {
    // A week away is absence, not planned recovery.
    let s = emptyStreaks();
    s = applyDailyOutcome(s, day('2026-01-01', { workoutDone: true }));
    s = applyDailyOutcome(s, day('2026-01-09', { restDay: true }));
    expect(s.workout).toBe(0);
  });

  it('is idempotent when the same rest day is recomputed', () => {
    let s = emptyStreaks();
    s = applyDailyOutcome(s, day('2026-01-01', { workoutDone: true }));
    s = applyDailyOutcome(s, day('2026-01-02', { restDay: true }));
    const once = s.workout;
    s = applyDailyOutcome(s, day('2026-01-02', { restDay: true }));
    expect(s.workout).toBe(once);
  });
});

describe('personalised amounts', () => {
  it('falls back to the standard plate set when nothing is chosen', () => {
    expect(availablePlates('imperial')).toEqual([45, 35, 25, 10, 5, 2.5]);
    expect(availablePlates('imperial', [])).toEqual([45, 35, 25, 10, 5, 2.5]);
  });

  it('uses the gym inventory heaviest-first, since the greedy pass depends on it', () => {
    expect(availablePlates('imperial', [5, 45, 25])).toEqual([45, 25, 5]);
  });

  it('drops nonsense plate values rather than looping on them', () => {
    expect(availablePlates('metric', [0, -5])).toEqual([25, 20, 15, 10, 5, 2.5, 1.25]);
    expect(availablePlates('metric', [20, 20, 10])).toEqual([20, 10]);
  });

  it('loads only from the plates the gym has', () => {
    // No 10s: 225 lb is unreachable from a 45 bar, and the plan says so.
    const without10s = planPlates(225, 45, 'imperial', [45, 35, 25, 5, 2.5]);
    expect(without10s.perSide.every((p) => p.weight !== 10)).toBe(true);
    expect(without10s.achievable).toBe(225);
  });

  it('keeps the default water amounts until the athlete sets their own', () => {
    expect(waterQuickAdds()).toEqual([8, 16]);
    expect(waterQuickAdds([])).toEqual([8, 16]);
  });

  it('sorts custom water amounts small to large and caps the row', () => {
    expect(waterQuickAdds([24, 12])).toEqual([12, 24]);
    expect(waterQuickAdds([1, 2, 3, 4, 5])).toHaveLength(4);
  });

  it('ignores implausible water amounts', () => {
    expect(waterQuickAdds([0, -8, 5000])).toEqual([8, 16]);
  });
});

describe('parseDurationMinutes', () => {
  it('reads the formats people actually type', () => {
    expect(parseDurationMinutes('7:35')).toBe(455);
    expect(parseDurationMinutes('7h35')).toBe(455);
    expect(parseDurationMinutes('7h 35m')).toBe(455);
    expect(parseDurationMinutes('7h')).toBe(420);
    expect(parseDurationMinutes('7.5')).toBe(450);
    expect(parseDurationMinutes('7.5h')).toBe(450);
    expect(parseDurationMinutes('45m')).toBe(45);
  });

  it('resolves a bare number by plausibility, not by guessing', () => {
    // Nobody sleeps eight minutes, and nobody sleeps 455 hours.
    expect(parseDurationMinutes('8')).toBe(480);
    expect(parseDurationMinutes('455')).toBe(455);
    expect(parseDurationMinutes('24')).toBe(1440);
    expect(parseDurationMinutes('25')).toBe(25);
  });

  it('rejects nonsense rather than inventing a number', () => {
    for (const bad of ['', '   ', 'abc', '7:99', '7h99', '-3', '7:']) {
      expect(parseDurationMinutes(bad)).toBeNull();
    }
  });

  it('ignores spacing and case', () => {
    expect(parseDurationMinutes('  7H35M ')).toBe(455);
  });
});

describe('projectGoal', () => {
  /** A clean linear series, one reading a day. */
  const falling = (from: number, perDay: number, days: number) =>
    Array.from({ length: days }, (_, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, '0')}`,
      value: Math.round((from - perDay * i) * 100) / 100,
    }));

  it('projects a date when the trend is heading the right way', () => {
    // 0.2/day = 1.4/week, starting at 90, ending at 88, goal 84.
    const p = projectGoal(falling(90, 0.2, 11), 84);
    expect(p.verdict).toBe('on_course');
    expect(p.ratePerWeek).toBeCloseTo(-1.4, 2);
    expect(p.weeks).toBe(3);
    // 4 units to lose at 1.4/week is 20 days, not a round 3 weeks — the date is
    // rounded to the day, which is tighter than rounding the weeks first.
    expect(p.date).toBe('2026-10-01');
  });

  it('refuses to project when the trend runs away from the goal', () => {
    const gaining = falling(80, -0.2, 11); // rising
    const p = projectGoal(gaining, 75);
    expect(p.verdict).toBe('wrong_way');
    expect(p.date).toBeNull();
    expect(p.weeks).toBeNull();
  });

  it('refuses when the trend is too flat to extrapolate', () => {
    // "340 weeks" is the arithmetic and a lie about what the data supports.
    const flat = falling(90, 0.001, 11);
    const p = projectGoal(flat, 70);
    expect(p.verdict).toBe('too_slow');
    expect(p.date).toBeNull();
  });

  it('refuses when a real rate would still take years', () => {
    const p = projectGoal(falling(200, 0.02, 11), 90);
    expect(p.verdict).toBe('too_slow');
  });

  it('says you are there when you are within the band', () => {
    const p = projectGoal(falling(84.2, 0.2, 11), 82.5);
    expect(p.verdict).toBe('arrived');
  });

  it('needs enough readings before it says anything at all', () => {
    expect(projectGoal(falling(90, 0.2, 3), 84).verdict).toBe('not_enough_data');
    expect(projectGoal([], 84).verdict).toBe('not_enough_data');
  });

  it('works in both directions', () => {
    const bulking = falling(70, -0.15, 11); // gaining ~1.05/wk
    const p = projectGoal(bulking, 75);
    expect(p.verdict).toBe('on_course');
    expect(p.ratePerWeek!).toBeGreaterThan(0);
    expect(p.weeks).toBeGreaterThan(0);
  });

  it('counts from a supplied today rather than the last reading', () => {
    const series = falling(90, 0.2, 11);
    const fromLater = projectGoal(series, 84, { today: '2026-09-20' });
    expect(fromLater.date).toBe('2026-10-10');
  });
});

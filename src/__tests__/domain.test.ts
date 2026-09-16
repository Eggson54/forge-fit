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
import { longestRunOfDays } from '../domain/date';
import { isWarmupSet, nextSetKind, setKind } from '../domain/sets';
import { MEASUREMENT_SITES, changeVerdict, latestBySite, siteChange, siteSeries } from '../domain/measurements';
import { formatDateLong, formatDateWithWeekday, formatDayMonth } from '../domain/date';
import { groupExercises, restAfterSet, toggleSupersetAt } from '../domain/superset';
import { recentExerciseIds } from '../domain/history';
import { strengthChangePct } from '../domain/strength';
import { suggestToday, volumeDeficits } from '../domain/suggestion';
import { activeDaysInWindow, adherence, expectedDoses } from '../domain/protocol';
import { ACHIEVEMENT_CATALOG, achievementProgress, nextAchievements } from '../domain/achievements';
import { movingAverage, ratePerWeek } from '../domain/trend';

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

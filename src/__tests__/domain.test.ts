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

import type { Program, ProgramExercise } from '../domain/program';
import { exerciseById } from './exercises';

/**
 * Built-in training plans.
 *
 * These are ordinary training structures — full body, upper/lower, push/pull/
 * legs — assembled from this app's own exercise library. Nothing here is copied
 * from another product, and none of it is medical advice: they are starting
 * templates the athlete edits, skips or abandons freely.
 */

/** Build an exercise entry, pulling name and muscle from the library. */
function ex(exerciseId: string, sets: number, targetReps: number, restSeconds: number, supersetGroup?: string): ProgramExercise {
  const lib = exerciseById(exerciseId);
  return {
    exerciseId,
    name: lib?.name ?? exerciseId,
    primaryMuscle: lib?.primaryMuscle ?? 'full_body',
    sets,
    targetReps,
    restSeconds,
    supersetGroup,
  };
}

export const PROGRAMS: Program[] = [
  {
    id: 'foundation_3',
    name: 'Foundation',
    summary: 'Three full-body days a week on the basic barbell lifts. Built for a first structured block.',
    weeks: 8,
    daysPerWeek: 3,
    experience: 'beginner',
    weeklyProgressionPct: 2,
    days: [
      {
        index: 1,
        name: 'Full Body A',
        focus: ['quads', 'chest', 'back'],
        exercises: [
          ex('barbell_squat', 3, 5, 180),
          ex('barbell_bench_press', 3, 5, 180),
          ex('barbell_row', 3, 8, 120),
          ex('plank', 3, 1, 60),
        ],
      },
      {
        index: 2,
        name: 'Full Body B',
        focus: ['back', 'shoulders', 'hamstrings'],
        exercises: [
          ex('romanian_deadlift', 3, 8, 150),
          ex('overhead_press', 3, 5, 150),
          ex('lat_pulldown', 3, 10, 90),
          ex('standing_calf_raise', 3, 12, 60),
        ],
      },
      {
        index: 3,
        name: 'Full Body C',
        focus: ['back', 'quads', 'biceps'],
        exercises: [
          ex('deadlift', 2, 5, 210),
          ex('leg_press', 3, 10, 120),
          ex('incline_db_press', 3, 10, 90),
          ex('db_curl', 3, 12, 60),
        ],
      },
    ],
  },
  {
    id: 'upper_lower_4',
    name: 'Upper / Lower',
    summary: 'Four days split between upper and lower body. The standard next step once three days stops being enough.',
    weeks: 8,
    daysPerWeek: 4,
    experience: 'intermediate',
    weeklyProgressionPct: 1.5,
    days: [
      {
        index: 1,
        name: 'Upper — Heavy',
        focus: ['chest', 'back', 'shoulders'],
        exercises: [
          ex('barbell_bench_press', 4, 5, 180),
          ex('barbell_row', 4, 6, 150),
          ex('overhead_press', 3, 8, 120),
          ex('pull_up', 3, 8, 120),
        ],
      },
      {
        index: 2,
        name: 'Lower — Heavy',
        focus: ['quads', 'hamstrings', 'glutes'],
        exercises: [
          ex('barbell_squat', 4, 5, 210),
          ex('romanian_deadlift', 3, 8, 150),
          ex('walking_lunge', 3, 10, 90),
          ex('standing_calf_raise', 4, 12, 60),
        ],
      },
      {
        index: 3,
        name: 'Upper — Volume',
        focus: ['chest', 'back', 'triceps'],
        exercises: [
          ex('incline_db_press', 4, 10, 90),
          ex('lat_pulldown', 4, 10, 90),
          ex('db_lateral_raise', 3, 15, 60, 'ul_arms'),
          ex('triceps_pushdown', 3, 12, 60, 'ul_arms'),
          ex('db_curl', 3, 12, 60),
        ],
      },
      {
        index: 4,
        name: 'Lower — Volume',
        focus: ['quads', 'glutes', 'core'],
        exercises: [
          ex('leg_press', 4, 12, 120),
          ex('hip_thrust', 3, 10, 90),
          ex('goblet_squat', 3, 12, 75),
          ex('hanging_leg_raise', 3, 12, 60),
        ],
      },
    ],
  },
  {
    id: 'ppl_6',
    name: 'Push / Pull / Legs',
    summary: 'Six days, each muscle trained twice a week. Only worth starting if six sessions a week is realistic for you.',
    weeks: 6,
    daysPerWeek: 6,
    experience: 'advanced',
    weeklyProgressionPct: 1.25,
    days: [
      {
        index: 1,
        name: 'Push — Heavy',
        focus: ['chest', 'shoulders', 'triceps'],
        exercises: [
          ex('barbell_bench_press', 4, 5, 180),
          ex('overhead_press', 3, 8, 120),
          ex('incline_db_press', 3, 10, 90),
          ex('triceps_pushdown', 3, 12, 60),
        ],
      },
      {
        index: 2,
        name: 'Pull — Heavy',
        focus: ['back', 'biceps'],
        exercises: [
          ex('deadlift', 3, 5, 210),
          ex('pull_up', 4, 8, 120),
          ex('barbell_row', 3, 10, 120),
          ex('db_curl', 3, 12, 60),
        ],
      },
      {
        index: 3,
        name: 'Legs — Heavy',
        focus: ['quads', 'hamstrings', 'calves'],
        exercises: [
          ex('barbell_squat', 4, 5, 210),
          ex('romanian_deadlift', 3, 8, 150),
          ex('leg_press', 3, 12, 120),
          ex('standing_calf_raise', 4, 15, 60),
        ],
      },
      {
        index: 4,
        name: 'Push — Volume',
        focus: ['chest', 'shoulders'],
        exercises: [
          ex('incline_db_press', 4, 12, 90),
          ex('db_lateral_raise', 4, 15, 60, 'ppl_delts'),
          ex('push_up', 3, 15, 60, 'ppl_delts'),
          ex('triceps_pushdown', 3, 15, 60),
        ],
      },
      {
        index: 5,
        name: 'Pull — Volume',
        focus: ['back', 'biceps'],
        exercises: [
          ex('lat_pulldown', 4, 12, 90),
          ex('barbell_row', 3, 12, 90),
          ex('band_pull_apart', 3, 20, 45, 'ppl_arms'),
          ex('db_curl', 4, 12, 60, 'ppl_arms'),
        ],
      },
      {
        index: 6,
        name: 'Legs — Volume',
        focus: ['glutes', 'quads', 'core'],
        exercises: [
          ex('hip_thrust', 4, 10, 120),
          ex('walking_lunge', 3, 12, 90),
          ex('goblet_squat', 3, 15, 75),
          ex('hanging_leg_raise', 3, 15, 60),
        ],
      },
    ],
  },
];

export const programById = (id: string): Program | undefined => PROGRAMS.find((p) => p.id === id);

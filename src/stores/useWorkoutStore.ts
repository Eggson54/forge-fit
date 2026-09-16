import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { todayISO } from '../domain/date';
import { epley1RM } from '../domain/strength';
import { isWarmupSet, nextSetKind } from '../domain/sets';
import { toggleSupersetAt } from '../domain/superset';
import { findPreviousPerformance, recommendNext, type PreviousPerformance } from '../domain/progressiveOverload';
import type {
  Exercise,
  Experience,
  MuscleGroup,
  SetEntry,
  Units,
  Workout,
  WorkoutExercise,
} from '../domain/types';
import type { WorkoutGenResult } from '../services/ai/types';
import { EXERCISE_LIBRARY, exerciseById } from '../data/exercises';
import { uid } from '../lib/uid';
import { analytics } from '../services/analytics';
import { jsonStorage, STORE_KEYS } from './persist';

export interface NewPr {
  exerciseName: string;
  e1RMKg: number;
}

interface WorkoutState {
  workouts: Workout[]; // history (completed) + planned
  activeId: string | null;
  customExercises: Exercise[];
  prs: Record<string, number>; // exerciseId -> best e1RM (kg)
  favouriteExerciseIds: string[];

  allExercises: () => Exercise[];
  toggleFavourite: (exerciseId: string) => void;
  isFavourite: (exerciseId: string) => boolean;
  addCustomExercise: (e: Omit<Exercise, 'id' | 'isCustom'>) => Exercise;

  startEmptyWorkout: (name?: string) => string;
  startFromGenerated: (gen: WorkoutGenResult, experience: Experience) => string;
  activeWorkout: () => Workout | null;

  addExerciseToActive: (exerciseId: string) => void;
  removeExercise: (workoutExerciseId: string) => void;
  addSet: (workoutExerciseId: string) => void;
  updateSet: (workoutExerciseId: string, setId: string, patch: Partial<SetEntry>) => void;
  removeSet: (workoutExerciseId: string, setId: string) => void;
  cycleSetKind: (workoutExerciseId: string, setId: string) => void;
  /** Link this exercise with the one below it into a superset, or unlink it. */
  toggleSupersetWithNext: (workoutExerciseId: string) => void;
  setExerciseNote: (workoutExerciseId: string, note: string) => void;
  /** Replace an exercise with another, keeping its position and set count. */
  swapExercise: (workoutExerciseId: string, newExerciseId: string) => void;
  setWorkoutNote: (note: string) => void;
  /** Start a new session with the same exercises and sets as a past one. */
  repeatWorkout: (workoutId: string) => string | null;
  /** Returns the new personal record this completion set, if any. */
  toggleSetComplete: (workoutExerciseId: string, setId: string) => NewPr | null;

  finishActive: () => Workout | null;
  discardActive: () => void;
  deleteWorkout: (id: string) => void;

  previousFor: (exerciseId: string) => PreviousPerformance | null;
  recommendationFor: (exerciseId: string, experience: Experience, units?: Units) => ReturnType<typeof recommendNext>;
  completedWorkouts: () => Workout[];
  reset: () => void;
}

function newSet(): SetEntry {
  return { id: uid('s_'), weightKg: null, reps: null, rpe: null, completed: false };
}

function toWorkoutExercise(ex: Exercise, targetReps?: number): WorkoutExercise {
  return {
    id: uid('we_'),
    exerciseId: ex.id,
    name: ex.name,
    primaryMuscle: ex.primaryMuscle,
    restSeconds: ex.category === 'compound' ? 150 : 75,
    targetReps,
    sets: [newSet(), newSet(), newSet()],
  };
}

export const useWorkoutStore = create<WorkoutState>()(
  persist(
    (set, get) => {
      // Local helper: apply a transform to the currently-active workout.
      const mutateActive = (fn: (w: Workout) => Workout) => {
        const { activeId } = get();
        if (!activeId) return;
        set((s) => ({ workouts: s.workouts.map((w) => (w.id === activeId ? fn(w) : w)) }));
      };

      return {
      workouts: [],
      activeId: null,
      customExercises: [],
      prs: {},
      favouriteExerciseIds: [],

      allExercises: () => [...get().customExercises, ...EXERCISE_LIBRARY],

      toggleFavourite: (exerciseId) =>
        set((s) => ({
          favouriteExerciseIds: s.favouriteExerciseIds.includes(exerciseId)
            ? s.favouriteExerciseIds.filter((id) => id !== exerciseId)
            : [...s.favouriteExerciseIds, exerciseId],
        })),

      isFavourite: (exerciseId) => get().favouriteExerciseIds.includes(exerciseId),

      addCustomExercise: (e) => {
        const created: Exercise = { ...e, id: uid('cust_'), isCustom: true };
        set((s) => ({ customExercises: [created, ...s.customExercises] }));
        return created;
      },

      startEmptyWorkout: (name = 'Workout') => {
        const id = uid('wk_');
        const workout: Workout = {
          id,
          name,
          status: 'in_progress',
          date: todayISO(),
          startedAt: new Date().toISOString(),
          completedAt: null,
          durationSeconds: null,
          exercises: [],
          focus: [],
        };
        set((s) => ({ workouts: [workout, ...s.workouts], activeId: id }));
        analytics.track('workout_started', { source: 'empty' });
        return id;
      },

      startFromGenerated: (gen, experience) => {
        const id = uid('wk_');
        const exercises: WorkoutExercise[] = gen.exercises.map((ge) => {
          const lib = exerciseById(ge.exerciseId) ?? get().customExercises.find((c) => c.id === ge.exerciseId);
          const base = lib ?? {
            id: ge.exerciseId,
            name: ge.name,
            primaryMuscle: ge.primaryMuscle,
            secondaryMuscles: [] as MuscleGroup[],
            equipment: 'full_gym' as const,
            category: 'compound' as const,
            difficulty: experience,
            instructions: [],
          };
          const we = toWorkoutExercise(base, ge.reps[1]);
          we.sets = Array.from({ length: ge.sets }, newSet);
          we.restSeconds = ge.restSeconds;
          we.supersetGroup = ge.supersetGroup;
          return we;
        });
        const workout: Workout = {
          id,
          name: gen.name,
          status: 'in_progress',
          date: todayISO(),
          startedAt: new Date().toISOString(),
          completedAt: null,
          durationSeconds: null,
          exercises,
          focus: gen.focus,
        };
        set((s) => ({ workouts: [workout, ...s.workouts], activeId: id }));
        analytics.track('workout_started', { source: 'ai' });
        return id;
      },

      activeWorkout: () => {
        const { activeId, workouts } = get();
        return workouts.find((w) => w.id === activeId) ?? null;
      },

      addExerciseToActive: (exerciseId) => {
        const ex = get().allExercises().find((e) => e.id === exerciseId);
        if (!ex) return;
        mutateActive((w) => ({ ...w, exercises: [...w.exercises, toWorkoutExercise(ex)] }));
      },

      removeExercise: (weId) =>
        mutateActive((w) => ({ ...w, exercises: w.exercises.filter((e) => e.id !== weId) })),

      addSet: (weId) =>
        mutateActive((w) => ({
          ...w,
          exercises: w.exercises.map((e) => (e.id === weId ? { ...e, sets: [...e.sets, newSet()] } : e)),
        })),

      updateSet: (weId, setId, patch) =>
        mutateActive((w) => ({
          ...w,
          exercises: w.exercises.map((e) =>
            e.id === weId ? { ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) } : e,
          ),
        })),

      removeSet: (weId, setId) =>
        mutateActive((w) => ({
          ...w,
          exercises: w.exercises.map((e) => (e.id === weId ? { ...e, sets: e.sets.filter((s) => s.id !== setId) } : e)),
        })),

      toggleSupersetWithNext: (weId) =>
        mutateActive((w) => ({ ...w, exercises: toggleSupersetAt(w.exercises, w.exercises.findIndex((e) => e.id === weId)) })),

      cycleSetKind: (weId, setId) =>
        mutateActive((w) => ({
          ...w,
          exercises: w.exercises.map((e) =>
            e.id === weId
              ? { ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, kind: nextSetKind(s), isWarmup: undefined } : s)) }
              : e,
          ),
        })),

      swapExercise: (weId, newExerciseId) => {
        const replacement = get().allExercises().find((e) => e.id === newExerciseId);
        if (!replacement) return;
        mutateActive((w) => ({
          ...w,
          exercises: w.exercises.map((e) => {
            if (e.id !== weId) return e;
            const fresh = toWorkoutExercise(replacement, e.targetReps);
            return {
              // Keep the row's identity, its place in any superset, and how many
              // sets were planned — swapping the movement is not restarting it.
              ...fresh,
              id: e.id,
              supersetGroup: e.supersetGroup,
              restSeconds: e.restSeconds,
              sets: Array.from({ length: Math.max(1, e.sets.length) }, newSet),
            };
          }),
        }));
      },

      setWorkoutNote: (note) => mutateActive((w) => ({ ...w, notes: note.trim() ? note : undefined })),

      repeatWorkout: (workoutId) => {
        const source = get().workouts.find((w) => w.id === workoutId);
        if (!source) return null;
        const id = uid('wk_');
        const workout: Workout = {
          id,
          name: source.name,
          status: 'in_progress',
          date: todayISO(),
          startedAt: new Date().toISOString(),
          completedAt: null,
          durationSeconds: null,
          focus: source.focus,
          // The structure comes across; the numbers do not. Carrying last
          // session's weights in pre-filled would have the athlete confirming
          // them rather than deciding them.
          exercises: source.exercises.map((e) => ({
            ...e,
            id: uid('we_'),
            notes: undefined,
            sets: e.sets.map(() => newSet()),
          })),
        };
        set((s) => ({ workouts: [workout, ...s.workouts], activeId: id }));
        analytics.track('workout_started', { source: 'repeat' });
        return id;
      },

      setExerciseNote: (weId, note) =>
        mutateActive((w) => ({
          ...w,
          exercises: w.exercises.map((e) => (e.id === weId ? { ...e, notes: note.trim() ? note : undefined } : e)),
        })),

      toggleSetComplete: (weId, setId) => {
        const prs = { ...get().prs };
        // Reported back so the screen can celebrate the moment it happens rather
        // than only on the summary after the session ends.
        let newPr: { exerciseName: string; e1RMKg: number } | null = null;
        mutateActive((w) => ({
          ...w,
          exercises: w.exercises.map((e) => {
            if (e.id !== weId) return e;
            return {
              ...e,
              sets: e.sets.map((s) => {
                if (s.id !== setId) return s;
                const completed = !s.completed;
                let isPr = s.isPr;
                if (completed && s.weightKg && s.reps && !isWarmupSet(s)) {
                  const e1rm = epley1RM(s.weightKg, s.reps);
                  if (e1rm > (prs[e.exerciseId] ?? 0)) {
                    prs[e.exerciseId] = e1rm;
                    isPr = true;
                    newPr = { exerciseName: e.name, e1RMKg: e1rm };
                  }
                }
                return { ...s, completed, isPr };
              }),
            };
          }),
        }));
        set({ prs });
        return newPr;
      },

      finishActive: () => {
        const w = get().activeWorkout();
        if (!w) return null;
        const started = w.startedAt ? Date.parse(w.startedAt) : Date.now();
        const durationSeconds = Math.max(0, Math.round((Date.now() - started) / 1000));
        const completed: Workout = {
          ...w,
          status: 'completed',
          completedAt: new Date().toISOString(),
          durationSeconds,
        };
        set((s) => ({ workouts: s.workouts.map((x) => (x.id === w.id ? completed : x)), activeId: null }));
        analytics.track('workout_completed', { duration_bucket: analyticsBucket(durationSeconds) });
        return completed;
      },

      discardActive: () => {
        const id = get().activeId;
        if (!id) return;
        set((s) => ({ workouts: s.workouts.filter((w) => w.id !== id), activeId: null }));
      },

      deleteWorkout: (id) => set((s) => ({ workouts: s.workouts.filter((w) => w.id !== id) })),

      previousFor: (exerciseId) => findPreviousPerformance(get().completedWorkouts(), exerciseId),

      recommendationFor: (exerciseId, experience, units) =>
        recommendNext(findPreviousPerformance(get().completedWorkouts(), exerciseId), { experience, units }),

      completedWorkouts: () => get().workouts.filter((w) => w.status === 'completed'),

      reset: () => set({ workouts: [], activeId: null, customExercises: [], prs: {}, favouriteExerciseIds: [] }),
      };
    },
    {
      name: STORE_KEYS.workouts,
      storage: jsonStorage(),
      partialize: (s) => ({
        workouts: s.workouts,
        customExercises: s.customExercises,
        prs: s.prs,
        activeId: s.activeId,
        favouriteExerciseIds: s.favouriteExerciseIds,
      }),
    },
  ),
);

function analyticsBucket(seconds: number): string {
  const m = seconds / 60;
  if (m < 30) return '<30';
  if (m < 60) return '30-60';
  return '60+';
}

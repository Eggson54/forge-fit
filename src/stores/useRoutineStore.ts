import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Experience, MuscleGroup, Workout } from '../domain/types';
import type { WorkoutGenResult } from '../services/ai/types';
import { uid } from '../lib/uid';
import { jsonStorage } from './persist';
import { useWorkoutStore } from './useWorkoutStore';

export interface RoutineExercise {
  exerciseId: string;
  name: string;
  primaryMuscle: MuscleGroup;
  sets: number;
  targetReps: number;
  restSeconds: number;
}

export interface Routine {
  id: string;
  name: string;
  focus: MuscleGroup[];
  exercises: RoutineExercise[];
  createdAt: string;
}

interface RoutineState {
  routines: Routine[];
  add: (r: Omit<Routine, 'id' | 'createdAt'>) => Routine;
  saveFromWorkout: (workout: Workout, name?: string) => Routine;
  remove: (id: string) => void;
  rename: (id: string, name: string) => void;
  start: (id: string, experience: Experience) => string | null;
  reset: () => void;
}

export const useRoutineStore = create<RoutineState>()(
  persist(
    (set, get) => ({
      routines: [],

      add: (r) => {
        const routine: Routine = { ...r, id: uid('rt_'), createdAt: new Date().toISOString() };
        set((s) => ({ routines: [routine, ...s.routines] }));
        return routine;
      },

      saveFromWorkout: (workout, name) => {
        const exercises: RoutineExercise[] = workout.exercises.map((ex) => ({
          exerciseId: ex.exerciseId,
          name: ex.name,
          primaryMuscle: ex.primaryMuscle,
          sets: Math.max(1, ex.sets.filter((s) => !s.isWarmup).length),
          targetReps: ex.targetReps ?? 8,
          restSeconds: ex.restSeconds,
        }));
        return get().add({ name: name ?? workout.name, focus: workout.focus, exercises });
      },

      remove: (id) => set((s) => ({ routines: s.routines.filter((r) => r.id !== id) })),
      rename: (id, name) => set((s) => ({ routines: s.routines.map((r) => (r.id === id ? { ...r, name } : r)) })),

      start: (id, experience) => {
        const routine = get().routines.find((r) => r.id === id);
        if (!routine) return null;
        const gen: WorkoutGenResult = {
          name: routine.name,
          focus: routine.focus,
          estimatedMinutes: routine.exercises.length * 8,
          exercises: routine.exercises.map((e) => ({
            exerciseId: e.exerciseId,
            name: e.name,
            primaryMuscle: e.primaryMuscle,
            sets: e.sets,
            reps: [Math.max(1, e.targetReps - 2), e.targetReps] as [number, number],
            restSeconds: e.restSeconds,
          })),
          note: 'Started from your saved routine.',
        };
        return useWorkoutStore.getState().startFromGenerated(gen, experience);
      },

      reset: () => set({ routines: [] }),
    }),
    { name: 'forgefit.routines', storage: jsonStorage() },
  ),
);

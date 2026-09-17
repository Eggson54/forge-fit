import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Experience, MuscleGroup, Workout } from '../domain/types';
import type { WorkoutGenResult } from '../services/ai/types';
import { uid } from '../lib/uid';
import { jsonStorage, STORE_KEYS } from './persist';
import { useWorkoutStore } from './useWorkoutStore';
import { isWarmupSet } from '../domain/sets';
import { nextCopyName } from '../domain/naming';

export interface RoutineExercise {
  exerciseId: string;
  name: string;
  primaryMuscle: MuscleGroup;
  sets: number;
  targetReps: number;
  restSeconds: number;
  /** Shared by adjacent exercises saved as a superset. */
  supersetGroup?: string;
}

export interface Routine {
  id: string;
  name: string;
  focus: MuscleGroup[];
  exercises: RoutineExercise[];
  createdAt: string;
}

/**
 * The routine being edited.
 *
 * The builder and the exercise picker are separate screens, so the draft cannot
 * live in the builder's own state: returning from the picker pushes a fresh
 * builder, which would start empty and silently drop everything added before it.
 */
export interface RoutineDraft {
  editingId: string | null;
  name: string;
  exercises: RoutineExercise[];
}

const emptyDraft = (): RoutineDraft => ({ editingId: null, name: '', exercises: [] });

interface RoutineState {
  routines: Routine[];
  draft: RoutineDraft;

  startDraft: (routine?: Routine) => void;
  setDraftName: (name: string) => void;
  setDraftExercises: (exercises: RoutineExercise[]) => void;
  addDraftExercise: (e: RoutineExercise) => void;
  commitDraft: () => Routine | null;
  add: (r: Omit<Routine, 'id' | 'createdAt'>) => Routine;
  saveFromWorkout: (workout: Workout, name?: string) => Routine;
  duplicate: (id: string) => Routine | null;
  remove: (id: string) => void;
  rename: (id: string, name: string) => void;
  update: (id: string, patch: Partial<Omit<Routine, 'id' | 'createdAt'>>) => void;
  start: (id: string, experience: Experience) => string | null;
  reset: () => void;
}

export const useRoutineStore = create<RoutineState>()(
  persist(
    (set, get) => ({
      routines: [],
      draft: emptyDraft(),

      startDraft: (routine) =>
        set({
          draft: routine
            ? { editingId: routine.id, name: routine.name, exercises: [...routine.exercises] }
            : emptyDraft(),
        }),

      setDraftName: (name) => set((s) => ({ draft: { ...s.draft, name } })),

      setDraftExercises: (exercises) => set((s) => ({ draft: { ...s.draft, exercises } })),

      addDraftExercise: (e) =>
        set((s) =>
          s.draft.exercises.some((x) => x.exerciseId === e.exerciseId)
            ? s
            : { draft: { ...s.draft, exercises: [...s.draft.exercises, e] } },
        ),

      commitDraft: () => {
        const { draft } = get();
        if (draft.exercises.length === 0) return null;
        const focus = [...new Set(draft.exercises.map((e) => e.primaryMuscle))];
        const name = draft.name.trim() || 'New routine';
        if (draft.editingId) {
          get().update(draft.editingId, { name, focus, exercises: draft.exercises });
          const updated = get().routines.find((r) => r.id === draft.editingId) ?? null;
          set({ draft: emptyDraft() });
          return updated;
        }
        const created = get().add({ name, focus, exercises: draft.exercises });
        set({ draft: emptyDraft() });
        return created;
      },

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
          sets: Math.max(1, ex.sets.filter((s) => !isWarmupSet(s)).length),
          targetReps: ex.targetReps ?? 8,
          restSeconds: ex.restSeconds,
          supersetGroup: ex.supersetGroup,
        }));
        return get().add({ name: name ?? workout.name, focus: workout.focus, exercises });
      },

      // Copying a routine and editing the copy is how most people build a
      // variant — B day off A day, a travel version with the barbell work
      // swapped out — and the alternative was rebuilding it exercise by
      // exercise. The copy lands directly above the original.
      duplicate: (id) => {
        const source = get().routines.find((r) => r.id === id);
        if (!source) return null;
        const copy: Routine = {
          ...source,
          id: uid('rt_'),
          name: nextCopyName(source.name, get().routines.map((r) => r.name)),
          exercises: source.exercises.map((e) => ({ ...e })),
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ routines: [copy, ...s.routines] }));
        return copy;
      },

      remove: (id) => set((s) => ({ routines: s.routines.filter((r) => r.id !== id) })),
      rename: (id, name) => set((s) => ({ routines: s.routines.map((r) => (r.id === id ? { ...r, name } : r)) })),

      update: (id, patch) => set((s) => ({ routines: s.routines.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),

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
            supersetGroup: e.supersetGroup,
          })),
          note: 'Started from your saved routine.',
        };
        return useWorkoutStore.getState().startFromGenerated(gen, experience);
      },

      reset: () => set({ routines: [], draft: emptyDraft() }),
    }),
    {
      name: STORE_KEYS.routines,
      storage: jsonStorage(),
      // The draft is scratch state for one editing session; persisting it would
      // reopen a half-built routine days later with no way to tell why.
      partialize: (s) => ({ routines: s.routines }),
    },
  ),
);

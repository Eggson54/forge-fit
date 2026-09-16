import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { todayISO } from '../domain/date';
import { programPosition, weekMultiplier, type ProgramEnrolment, type ProgramPosition } from '../domain/program';
import { programById } from '../data/programs';
import type { Experience } from '../domain/types';
import type { WorkoutGenResult } from '../services/ai/types';
import { useWorkoutStore } from './useWorkoutStore';
import { jsonStorage, STORE_KEYS } from './persist';

interface ProgramState {
  enrolment: ProgramEnrolment | null;

  enrol: (programId: string) => void;
  leave: () => void;
  /** Restart the same plan from week one, keeping nothing. */
  restart: () => void;
  position: () => ProgramPosition | null;
  /** Start today's session and return the workout id, or null if not enrolled. */
  startNextSession: (experience: Experience) => string | null;
  /** Record that the current session was done, advancing the plan. */
  markSessionDone: (date?: string) => void;
  reset: () => void;
}

export const useProgramStore = create<ProgramState>()(
  persist(
    (set, get) => ({
      enrolment: null,

      enrol: (programId) =>
        set({ enrolment: { programId, startedOn: todayISO(), completedDates: [], completedDayIndices: [] } }),

      leave: () => set({ enrolment: null }),

      restart: () => {
        const current = get().enrolment;
        if (!current) return;
        set({ enrolment: { programId: current.programId, startedOn: todayISO(), completedDates: [], completedDayIndices: [] } });
      },

      position: () => {
        const enrolment = get().enrolment;
        const program = enrolment && programById(enrolment.programId);
        return program && enrolment ? programPosition(program, enrolment) : null;
      },

      startNextSession: (experience) => {
        const enrolment = get().enrolment;
        const program = enrolment && programById(enrolment.programId);
        if (!program || !enrolment) return null;
        const position = programPosition(program, enrolment);
        if (!position.day) return null;

        // Progression is a suggestion on the rep target, not a weight the app
        // invents: the logger fills weights from the athlete's own history.
        const gen: WorkoutGenResult = {
          name: `${program.name} · W${position.week} · ${position.day.name}`,
          focus: position.day.focus,
          estimatedMinutes: position.day.exercises.length * 9,
          exercises: position.day.exercises.map((e) => ({
            exerciseId: e.exerciseId,
            name: e.name,
            primaryMuscle: e.primaryMuscle,
            sets: e.sets,
            reps: [Math.max(1, e.targetReps - 2), e.targetReps] as [number, number],
            restSeconds: e.restSeconds,
            supersetGroup: e.supersetGroup,
          })),
          note: `Week ${position.week} of ${program.weeks}. Suggested load ×${weekMultiplier(program, position.week)}.`,
        };
        return useWorkoutStore.getState().startFromGenerated(gen, experience);
      },

      markSessionDone: (date = todayISO()) =>
        set((s) => {
          const enrolment = s.enrolment;
          const program = enrolment && programById(enrolment.programId);
          if (!program || !enrolment) return s;
          const position = programPosition(program, enrolment);
          if (!position.day) return s;
          return {
            enrolment: {
              ...enrolment,
              completedDates: [...enrolment.completedDates, date],
              completedDayIndices: [...enrolment.completedDayIndices, position.day.index],
            },
          };
        }),

      reset: () => set({ enrolment: null }),
    }),
    { name: STORE_KEYS.programs, storage: jsonStorage() },
  ),
);

import type { Equipment, Exercise, MuscleGroup } from './types';

/**
 * The exercises a generated workout may use.
 *
 * Sent to the AI server with every workout request, and turned into an enum
 * in the response schema there. Without it the model invented ids — it has
 * never seen this library — and an invented id reaches the active workout,
 * finds nothing in `exerciseById`, and loses its tracking type and history.
 * With it, every id that comes back is one this app has.
 *
 * The same equipment rule the on-device generator uses, so both pick from
 * the same set.
 */
export interface ExerciseCandidate {
  id: string;
  name: string;
  primaryMuscle: MuscleGroup;
}

export function exerciseCandidates(equipment: readonly Equipment[], library: readonly Exercise[]): ExerciseCandidate[] {
  const have = new Set(equipment);
  return library
    .filter((e) => !e.isCustom)
    .filter((e) => have.has(e.equipment) || have.has('full_gym') || e.equipment === 'bodyweight')
    .map((e) => ({ id: e.id, name: e.name, primaryMuscle: e.primaryMuscle }));
}

import type { Exercise, ExerciseTracking, SetEntry } from './types';

export const DEFAULT_TRACKING: ExerciseTracking = 'load';

export function trackingFor(exercise: Pick<Exercise, 'tracking'> | undefined | null): ExerciseTracking {
  return exercise?.tracking ?? DEFAULT_TRACKING;
}

/**
 * Effective load of a set, in kg.
 *
 * A pull-up logged at 0 kg contributed zero volume, so a session of forty
 * hard pull-ups registered as no work at all — the athlete's own mass is the
 * load, and `weightKg` on a bodyweight movement is what was *added* (or, when
 * negative, taken off by an assist machine or band).
 */
export function effectiveLoadKg(set: SetEntry, tracking: ExerciseTracking, bodyweightKg: number | null): number {
  if (tracking !== 'bodyweight') return set.weightKg ?? 0;
  const added = set.weightKg ?? 0;
  return Math.max(0, (bodyweightKg ?? 0) + added);
}

/**
 * Volume contribution of one set.
 *
 * A duration hold has no reps to multiply, so its volume is zero rather than a
 * fabricated number: a 60-second plank and a 100 kg squat are not commensurable
 * and pretending otherwise would corrupt every volume chart in the app.
 */
export function setVolumeKg(set: SetEntry, tracking: ExerciseTracking, bodyweightKg: number | null): number {
  if (tracking === 'duration') return 0;
  return effectiveLoadKg(set, tracking, bodyweightKg) * (set.reps ?? 0);
}

/** Whether this set counts as work done, for set counts and streaks. */
export function isSetLogged(set: SetEntry, tracking: ExerciseTracking): boolean {
  if (!set.completed) return false;
  if (tracking === 'duration') return (set.seconds ?? 0) > 0;
  return (set.reps ?? 0) > 0;
}

/** "1:30" for a held set, "8" for a counted one. */
export function formatSetAmount(set: SetEntry, tracking: ExerciseTracking): string {
  if (tracking !== 'duration') return String(set.reps ?? 0);
  const total = Math.max(0, Math.round(set.seconds ?? 0));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`;
}

/** Column header for the amount field, by tracking mode. */
export function amountLabel(tracking: ExerciseTracking): string {
  return tracking === 'duration' ? 'TIME' : 'REPS';
}

/** Column header for the load field. Null when the exercise carries no load. */
export function loadLabel(tracking: ExerciseTracking, unitLabel: string): string | null {
  if (tracking === 'duration') return null;
  // "+LB" says the number is added to bodyweight, not the whole load.
  return tracking === 'bodyweight' ? `+${unitLabel}` : unitLabel;
}

/**
 * Alternatives to an exercise, best match first.
 *
 * Ranked on what actually makes a swap usable mid-session: the same primary
 * muscle first, then kit the athlete has to hand — being offered a cable fly
 * when the cable station is occupied is the situation they are trying to
 * escape.
 */
export function substitutesFor(
  exercise: Exercise,
  library: Exercise[],
  availableEquipment: readonly string[] = [],
  limit = 8,
): Exercise[] {
  const wanted = new Set(availableEquipment);

  // Training the same muscle is a requirement, not a weight. Scored instead, a
  // candidate could clear the bar on equipment and category alone and be
  // offered as a swap for a lift it has nothing to do with.
  const trainsIt = (c: Exercise) =>
    c.primaryMuscle === exercise.primaryMuscle || c.secondaryMuscles.includes(exercise.primaryMuscle);

  const score = (candidate: Exercise): number => {
    let points = candidate.primaryMuscle === exercise.primaryMuscle ? 100 : 40;
    // Bodyweight is always available, whatever the athlete listed.
    if (candidate.equipment === 'bodyweight' || wanted.size === 0 || wanted.has(candidate.equipment)) points += 25;
    if (candidate.category === exercise.category) points += 10;
    if (candidate.difficulty === exercise.difficulty) points += 5;
    return points;
  };

  return library
    .filter((c) => c.id !== exercise.id && trainsIt(c))
    .map((c) => ({ c, score: score(c) }))
    .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name))
    .slice(0, limit)
    .map((x) => x.c);
}

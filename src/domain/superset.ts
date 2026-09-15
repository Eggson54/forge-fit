/** Anything that can be paired: a logged exercise or a routine's plan for one. */
export interface Supersettable {
  supersetGroup?: string;
}

/**
 * Rest between the exercises *inside* a superset. The point of pairing is to
 * move straight from one to the next, so the full working rest only belongs
 * after the last exercise in the group.
 */
export const SUPERSET_TRANSITION_SECONDS = 20;

export interface ExerciseGroup<T extends Supersettable = Supersettable> {
  /** null for a normal, ungrouped exercise. */
  supersetId: string | null;
  items: T[];
}

/**
 * Chunk a workout's exercises into supersets.
 *
 * Only *adjacent* exercises group together: the order of the list is the order
 * you train in, so two exercises tagged with the same id but separated by a
 * third are not a superset — they'd be a pair you can't actually alternate
 * between. Reordering an exercise out of a group therefore splits it without
 * needing to rewrite any ids.
 */
export function groupExercises<T extends Supersettable>(exercises: T[]): ExerciseGroup<T>[] {
  const groups: ExerciseGroup<T>[] = [];
  for (const ex of exercises) {
    const last = groups[groups.length - 1];
    if (ex.supersetGroup && last && last.supersetId === ex.supersetGroup) {
      last.items.push(ex);
    } else {
      groups.push({ supersetId: ex.supersetGroup ?? null, items: [ex] });
    }
  }
  // A group of one is not a superset, whatever its tag says — it happens when
  // the partner is removed or moved away.
  return groups.map((g) => (g.items.length > 1 ? g : { supersetId: null, items: g.items }));
}

/** A, B, C… for an exercise's position within its superset. */
export function supersetLabel(index: number): string {
  return String.fromCharCode(65 + index);
}

/**
 * Rest to run after completing a set. Inside a superset you move to the next
 * exercise; only the last one in the group earns the full rest.
 */
export function restAfterSet(group: ExerciseGroup<Supersettable>, indexInGroup: number, restSeconds: number): number {
  const isSuperset = group.items.length > 1;
  if (!isSuperset || indexInGroup === group.items.length - 1) return restSeconds;
  return Math.min(SUPERSET_TRANSITION_SECONDS, restSeconds);
}

/**
 * Link the exercise at `index` with the one below it, or break that link.
 *
 * Linking extends whatever groups the two sides already belong to, so pressing
 * the button down a list builds one giant set rather than a chain of pairs.
 * Unlinking splits at that seam only: the exercises below keep training
 * together under a tag of their own, and either side left alone loses its tag.
 */
export function toggleSupersetAt<T extends Supersettable>(exercises: T[], index: number): T[] {
  const current = exercises[index];
  const next = exercises[index + 1];
  if (!current || !next) return exercises;

  const inGroupAbove = !!current.supersetGroup && current.supersetGroup === exercises[index - 1]?.supersetGroup;
  const linked = !!current.supersetGroup && current.supersetGroup === next.supersetGroup;

  if (linked) {
    const tag = current.supersetGroup;
    const tail = exercises.filter((e, i) => i > index && e.supersetGroup === tag);
    // One exercise is not a superset, so don't leave it holding a tag.
    const tailTag = tail.length > 1 ? newGroupId(exercises) : undefined;
    return exercises.map((e, i) => {
      if (i === index) return inGroupAbove ? e : { ...e, supersetGroup: undefined };
      if (i <= index || e.supersetGroup !== tag) return e;
      return { ...e, supersetGroup: tailTag };
    });
  }

  // Absorb the group below too, rather than tearing `next` out of it.
  const tag = inGroupAbove ? current.supersetGroup! : newGroupId(exercises);
  const below = next.supersetGroup;
  return exercises.map((e, i) => {
    if (i === index || i === index + 1) return { ...e, supersetGroup: tag };
    if (i > index + 1 && below && e.supersetGroup === below) return { ...e, supersetGroup: tag };
    return e;
  });
}

/** A tag no other exercise in this workout is using. */
function newGroupId(exercises: Supersettable[]): string {
  const taken = new Set(exercises.map((e) => e.supersetGroup).filter(Boolean));
  let n = 1;
  while (taken.has(`ss${n}`)) n += 1;
  return `ss${n}`;
}

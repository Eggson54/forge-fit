import type { Sex } from './types';

/**
 * Relative-strength reference bands.
 *
 * These are ratios of estimated one-rep max to bodyweight, and they are a
 * rough consensus of the tables that circulate in strength training — not a
 * standard published by any governing body. They are deliberately presented as
 * bands with fuzzy edges: a 1.49× bench is not meaningfully weaker than a 1.51×
 * bench, and nothing about the number says whether someone is training well.
 *
 * Two things the UI must keep saying, because they are the honest caveats:
 *  - the input is an *estimate* of a 1RM from a working set, not a tested max;
 *  - the bands are referenced to a sex, because relative strength distributions
 *    differ, and the user picks which column to be compared against rather than
 *    the app assigning one from a profile field.
 */

export type StrengthLevel = 'untrained' | 'novice' | 'intermediate' | 'advanced' | 'elite';

export const STRENGTH_LEVELS: StrengthLevel[] = ['untrained', 'novice', 'intermediate', 'advanced', 'elite'];

export const LEVEL_LABEL: Record<StrengthLevel, string> = {
  untrained: 'Untrained',
  novice: 'Novice',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  elite: 'Elite',
};

/** Abbreviations that are still words. Slicing the labels gave "Untra". */
export const LEVEL_SHORT: Record<StrengthLevel, string> = {
  untrained: 'Untr',
  novice: 'Nov',
  intermediate: 'Int',
  advanced: 'Adv',
  elite: 'Elite',
};

export const LEVEL_BLURB: Record<StrengthLevel, string> = {
  untrained: 'Where almost everyone starts.',
  novice: 'A few months of consistent lifting.',
  intermediate: 'A couple of years of real training.',
  advanced: 'Years of it, and it shows.',
  elite: 'Competitive territory.',
};

export const LEVEL_TINT: Record<StrengthLevel, string> = {
  untrained: '#A9ADBF',
  novice: '#7FB2FF',
  intermediate: '#39E6C3',
  advanced: '#C6F135',
  elite: '#FFB020',
};

/** Which reference column to compare against. Chosen by the user, not inferred. */
export type StandardsColumn = 'male' | 'female';

export interface LiftStandard {
  exerciseId: string;
  name: string;
  /** Bodyweight multiples at the floor of each level, per column. */
  thresholds: Record<StandardsColumn, Record<StrengthLevel, number>>;
  /**
   * Whether the lift is loaded with the body as well as the bar. A pull-up at
   * "0 kg added" is still moving a bodyweight, so the ratio has to include it
   * or a strong athlete reads as untrained.
   */
  includesBodyweight?: boolean;
}

export const LIFT_STANDARDS: LiftStandard[] = [
  {
    exerciseId: 'barbell_squat',
    name: 'Back Squat',
    thresholds: {
      male: { untrained: 0.75, novice: 1.25, intermediate: 1.75, advanced: 2.5, elite: 3.0 },
      female: { untrained: 0.5, novice: 0.9, intermediate: 1.35, advanced: 1.9, elite: 2.4 },
    },
  },
  {
    exerciseId: 'barbell_bench_press',
    name: 'Bench Press',
    thresholds: {
      male: { untrained: 0.5, novice: 0.85, intermediate: 1.25, advanced: 1.75, elite: 2.15 },
      female: { untrained: 0.3, novice: 0.55, intermediate: 0.8, advanced: 1.15, elite: 1.5 },
    },
  },
  {
    exerciseId: 'deadlift',
    name: 'Deadlift',
    thresholds: {
      male: { untrained: 1.0, novice: 1.5, intermediate: 2.1, advanced: 2.85, elite: 3.5 },
      female: { untrained: 0.6, novice: 1.1, intermediate: 1.6, advanced: 2.2, elite: 2.8 },
    },
  },
  {
    exerciseId: 'overhead_press',
    name: 'Overhead Press',
    thresholds: {
      male: { untrained: 0.35, novice: 0.55, intermediate: 0.8, advanced: 1.1, elite: 1.4 },
      female: { untrained: 0.2, novice: 0.35, intermediate: 0.5, advanced: 0.75, elite: 1.0 },
    },
  },
  {
    exerciseId: 'barbell_row',
    name: 'Barbell Row',
    thresholds: {
      male: { untrained: 0.5, novice: 0.8, intermediate: 1.1, advanced: 1.5, elite: 1.85 },
      female: { untrained: 0.3, novice: 0.5, intermediate: 0.75, advanced: 1.05, elite: 1.35 },
    },
  },
  {
    exerciseId: 'pull_up',
    name: 'Pull-Up',
    includesBodyweight: true,
    thresholds: {
      // Expressed as total load moved ÷ bodyweight, so 1.0 is a clean bodyweight
      // rep and 1.5 is a rep with half a bodyweight hanging off you.
      male: { untrained: 0.6, novice: 1.0, intermediate: 1.25, advanced: 1.6, elite: 2.0 },
      female: { untrained: 0.5, novice: 0.95, intermediate: 1.15, advanced: 1.45, elite: 1.8 },
    },
  },
];

export interface StandardResult {
  lift: LiftStandard;
  /** Best estimated 1RM found, in kg, including bodyweight where the lift does. */
  e1RMKg: number;
  bodyweightKg: number;
  /** e1RM ÷ bodyweight, rounded to two places. */
  ratio: number;
  level: StrengthLevel;
  /** The band above, or null at the top. */
  nextLevel: StrengthLevel | null;
  /** 0–1 through the current band; 1 at the top level. */
  progress: number;
  /** Extra kilos needed to reach the next band, or null at the top. */
  toNextKg: number | null;
}

/**
 * Where a lift sits against the bands.
 *
 * Returns null rather than guessing when there is nothing to measure — no
 * bodyweight on file, or no logged set for that lift. A ratio computed against
 * a default bodyweight would be a number that looks like data and is not.
 */
export function gradeLift(
  lift: LiftStandard,
  e1RMKg: number,
  bodyweightKg: number | null,
  column: StandardsColumn,
): StandardResult | null {
  if (!bodyweightKg || bodyweightKg <= 0) return null;
  if (!Number.isFinite(e1RMKg) || e1RMKg <= 0) return null;

  const total = lift.includesBodyweight ? e1RMKg + bodyweightKg : e1RMKg;
  const ratio = Math.round((total / bodyweightKg) * 100) / 100;
  const bands = lift.thresholds[column];

  let level: StrengthLevel = 'untrained';
  for (const l of STRENGTH_LEVELS) {
    if (ratio >= bands[l]) level = l;
  }

  const index = STRENGTH_LEVELS.indexOf(level);
  const nextLevel = STRENGTH_LEVELS[index + 1] ?? null;

  // Below the untrained floor the band still reads "untrained"; progress is
  // measured from zero rather than from a floor the lifter has not reached.
  const floor = ratio < bands.untrained ? 0 : bands[level];
  const ceiling = nextLevel ? bands[nextLevel] : null;
  const progress = ceiling && ceiling > floor ? Math.min(1, Math.max(0, (ratio - floor) / (ceiling - floor))) : 1;
  const toNextKg = ceiling ? Math.max(0, Math.round((ceiling * bodyweightKg - total) * 10) / 10) : null;

  return { lift, e1RMKg, bodyweightKg, ratio, level, nextLevel, progress, toNextKg };
}

export interface StandardsSummary {
  results: StandardResult[];
  /** Lifts with no logged set yet, so the screen can say what is missing. */
  missing: LiftStandard[];
  /**
   * The level most of the graded lifts sit at — the median rather than the
   * mean, so one very strong deadlift does not promote everything else.
   * Null until at least two lifts are graded, because one lift is not a level.
   */
  overall: StrengthLevel | null;
}

export function summariseStandards(
  best: (exerciseId: string) => number,
  bodyweightKg: number | null,
  column: StandardsColumn,
): StandardsSummary {
  const results: StandardResult[] = [];
  const missing: LiftStandard[] = [];

  for (const lift of LIFT_STANDARDS) {
    const graded = gradeLift(lift, best(lift.exerciseId), bodyweightKg, column);
    if (graded) results.push(graded);
    else missing.push(lift);
  }

  let overall: StrengthLevel | null = null;
  if (results.length >= 2) {
    const indices = results.map((r) => STRENGTH_LEVELS.indexOf(r.level)).sort((a, b) => a - b);
    // Lower of the two middle values on an even count: claiming the higher one
    // would round a lifter up into a level half their lifts have not reached.
    const median = indices[Math.floor((indices.length - 1) / 2)]!;
    overall = STRENGTH_LEVELS[median]!;
  }

  return { results, missing, overall };
}

/** The column to preselect from a stored profile, without ever locking it. */
export function defaultColumn(sex: Sex): StandardsColumn {
  return sex === 'female' ? 'female' : 'male';
}

export const STANDARDS_CAVEAT =
  'Bands are ratios of estimated 1RM to bodyweight, gathered from the tables that circulate in strength training rather than from any governing body. Your number here comes from a working set, not a tested max. Treat it as a rough position, not a grade.';

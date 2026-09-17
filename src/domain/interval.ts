/**
 * Interval timer: work/rest cycles for conditioning, EMOM, Tabata and circuits.
 *
 * The schedule is computed up front as a flat list of phases rather than
 * decided tick by tick. Two reasons: the whole thing can be checked without a
 * clock, and — the one that matters on a phone — the current phase is a pure
 * function of elapsed wall-clock seconds. A timer that counts ticks loses time
 * the moment the screen sleeps, which on a conditioning set is most of it.
 */

export type PhaseKind = 'prepare' | 'work' | 'rest' | 'round_rest' | 'done';

export interface IntervalPlan {
  /** Exercises (or stations) per round. 1 is a plain work/rest interval. */
  stations: number;
  /** Times through the whole set of stations. */
  rounds: number;
  workSeconds: number;
  restSeconds: number;
  /** Extra rest after finishing all stations in a round. */
  roundRestSeconds: number;
  /** Countdown before the first work phase. */
  prepareSeconds: number;
}

export interface Phase {
  kind: PhaseKind;
  seconds: number;
  /** 1-based; 0 for prepare and done. */
  round: number;
  station: number;
  /** Seconds from the start of the session to the start of this phase. */
  startsAt: number;
  label: string;
}

export const DEFAULT_PLAN: IntervalPlan = {
  stations: 1,
  rounds: 8,
  workSeconds: 40,
  restSeconds: 20,
  roundRestSeconds: 0,
  prepareSeconds: 10,
};

export interface IntervalPreset {
  key: string;
  name: string;
  blurb: string;
  plan: IntervalPlan;
}

/**
 * Named starting points. These are common timing structures, not prescriptions
 * — nothing here says how hard to go or whether a given protocol suits anyone.
 */
export const INTERVAL_PRESETS: IntervalPreset[] = [
  {
    key: 'tabata',
    name: 'Tabata',
    blurb: '8 × 20s on, 10s off',
    plan: { stations: 1, rounds: 8, workSeconds: 20, restSeconds: 10, roundRestSeconds: 0, prepareSeconds: 10 },
  },
  {
    key: 'emom',
    name: 'EMOM',
    blurb: '10 × 1 minute',
    plan: { stations: 1, rounds: 10, workSeconds: 60, restSeconds: 0, roundRestSeconds: 0, prepareSeconds: 10 },
  },
  {
    key: 'circuit',
    name: 'Circuit',
    blurb: '4 stations × 3 rounds',
    plan: { stations: 4, rounds: 3, workSeconds: 45, restSeconds: 15, roundRestSeconds: 60, prepareSeconds: 15 },
  },
  {
    key: 'intervals',
    name: 'Intervals',
    blurb: '6 × 60s on, 90s off',
    plan: { stations: 1, rounds: 6, workSeconds: 60, restSeconds: 90, roundRestSeconds: 0, prepareSeconds: 15 },
  },
];

const clampInt = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Math.round(Number.isFinite(n) ? n : lo)));

/** Keeps a plan inside the range the UI can represent and the maths can hold. */
export function normalisePlan(plan: IntervalPlan): IntervalPlan {
  return {
    stations: clampInt(plan.stations, 1, 12),
    rounds: clampInt(plan.rounds, 1, 60),
    workSeconds: clampInt(plan.workSeconds, 5, 1800),
    restSeconds: clampInt(plan.restSeconds, 0, 1800),
    roundRestSeconds: clampInt(plan.roundRestSeconds, 0, 1800),
    prepareSeconds: clampInt(plan.prepareSeconds, 0, 120),
  };
}

/**
 * The full session as a list of phases.
 *
 * Two edges worth stating: a zero-length rest is omitted entirely rather than
 * emitted as a phase of no duration, and the rest after the very last station
 * of the very last round is dropped — resting at the end of a finished session
 * is just standing there watching a clock.
 */
export function buildSchedule(input: IntervalPlan): Phase[] {
  const plan = normalisePlan(input);
  const phases: Phase[] = [];
  let at = 0;

  const push = (kind: PhaseKind, seconds: number, round: number, station: number, label: string) => {
    if (seconds <= 0) return;
    phases.push({ kind, seconds, round, station, startsAt: at, label });
    at += seconds;
  };

  push('prepare', plan.prepareSeconds, 0, 0, 'Get ready');

  for (let round = 1; round <= plan.rounds; round += 1) {
    for (let station = 1; station <= plan.stations; station += 1) {
      const lastStation = station === plan.stations;
      const lastRound = round === plan.rounds;
      push(
        'work',
        plan.workSeconds,
        round,
        station,
        plan.stations > 1 ? `Station ${station}` : 'Work',
      );
      if (lastStation && lastRound) continue;
      // With a single station there is no "between stations" to distinguish a
      // round break from, so every gap is just rest. Calling it a round rest
      // would be a label with nothing to contrast against.
      if (lastStation && plan.stations > 1) {
        push('round_rest', plan.roundRestSeconds || plan.restSeconds, round, station, 'Round rest');
      } else {
        push('rest', plan.restSeconds, round, station, 'Rest');
      }
    }
  }

  phases.push({ kind: 'done', seconds: 0, round: plan.rounds, station: plan.stations, startsAt: at, label: 'Done' });
  return phases;
}

export function totalSeconds(plan: IntervalPlan): number {
  const schedule = buildSchedule(plan);
  return schedule[schedule.length - 1]?.startsAt ?? 0;
}

export interface IntervalPosition {
  phase: Phase;
  index: number;
  /** Seconds left in the current phase, counting down. */
  remaining: number;
  /** 0–1 through the current phase. */
  phaseProgress: number;
  /** 0–1 through the whole session. */
  sessionProgress: number;
  next: Phase | null;
  finished: boolean;
}

/**
 * Where the session is at a given elapsed time. Pure, so the screen can ask
 * "where are we now?" from a wall-clock reading and never accumulate drift.
 */
export function positionAt(schedule: Phase[], elapsed: number): IntervalPosition {
  const total = schedule[schedule.length - 1]?.startsAt ?? 0;
  const t = Math.max(0, elapsed);

  if (schedule.length === 0) {
    const done: Phase = { kind: 'done', seconds: 0, round: 0, station: 0, startsAt: 0, label: 'Done' };
    return { phase: done, index: 0, remaining: 0, phaseProgress: 1, sessionProgress: 1, next: null, finished: true };
  }

  if (t >= total) {
    const last = schedule[schedule.length - 1];
    return { phase: last, index: schedule.length - 1, remaining: 0, phaseProgress: 1, sessionProgress: 1, next: null, finished: true };
  }

  // Linear scan: a session is a few hundred phases at most, and a binary search
  // here would be harder to read for no measurable gain.
  let index = 0;
  for (let i = 0; i < schedule.length; i += 1) {
    if (t >= schedule[i].startsAt) index = i;
    else break;
  }

  const phase = schedule[index];
  const into = t - phase.startsAt;
  const remaining = Math.max(0, phase.seconds - into);
  return {
    phase,
    index,
    remaining,
    phaseProgress: phase.seconds > 0 ? Math.min(1, into / phase.seconds) : 1,
    sessionProgress: total > 0 ? Math.min(1, t / total) : 1,
    next: schedule[index + 1] ?? null,
    finished: false,
  };
}

/** mm:ss, and h:mm:ss once a session runs past an hour. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return h > 0 ? `${h}:${mm}:${String(sec).padStart(2, '0')}` : `${mm}:${String(sec).padStart(2, '0')}`;
}

/** A one-line description of the plan, for the preset cards and the header. */
export function describePlan(plan: IntervalPlan): string {
  const p = normalisePlan(plan);
  const work = `${p.workSeconds}s`;
  const rest = p.restSeconds > 0 ? ` / ${p.restSeconds}s` : '';
  const stations = p.stations > 1 ? `${p.stations} stations · ` : '';
  return `${stations}${p.rounds} × ${work}${rest}`;
}

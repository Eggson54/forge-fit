import { planPlates, type Unit } from './plates';

/**
 * Warm-up ramp for a working set.
 *
 * A general ramp — not a prescription. Percentages follow the common practice of
 * rising intensity with falling volume; the app states plainly that it is a
 * starting point the lifter adjusts, and it never tells anyone how heavy to go.
 */
export interface WarmupStep {
  /** Percentage of the working weight this step targets. */
  pct: number;
  reps: number;
  /** Target weight before rounding to loadable plates. */
  targetWeight: number;
  /** What can actually be loaded on the bar, when the lift uses one. */
  loadedWeight: number;
  label: string;
}

const RAMP: { pct: number; reps: number; label: string }[] = [
  { pct: 0.4, reps: 8, label: 'Groove the pattern' },
  { pct: 0.6, reps: 5, label: 'Build speed' },
  { pct: 0.75, reps: 3, label: 'Feel the load' },
  { pct: 0.9, reps: 1, label: 'Primer single' },
];

export interface WarmupOptions {
  workingWeight: number;
  bar: number;
  unit: Unit;
  /** Bodyweight and machine work has no bar to round to. */
  barbell?: boolean;
}

export function warmupPlan({ workingWeight, bar, unit, barbell = true }: WarmupOptions): WarmupStep[] {
  if (!Number.isFinite(workingWeight) || workingWeight <= 0) return [];

  const steps: WarmupStep[] = [];

  // An empty bar first, but only when there is a bar and the work set is well
  // above it — ramping to 95 lb from a 45 lb bar does not need five stages.
  if (barbell && bar > 0 && workingWeight >= bar * 2) {
    steps.push({ pct: 0, reps: 10, targetWeight: bar, loadedWeight: bar, label: 'Empty bar' });
  }

  for (const r of RAMP) {
    const target = Math.round(workingWeight * r.pct * 100) / 100;
    if (barbell && bar > 0 && target <= bar) continue;
    const loaded = barbell && bar > 0 ? planPlates(target, bar, unit).achievable : target;
    // A stage whose target needs less than the smallest plate rounds back down
    // to the empty bar, which is not a warm-up stage — drop it rather than
    // listing the bar twice under different percentages.
    if (barbell && bar > 0 && loaded <= bar) continue;
    // Likewise a stage that rounds onto the same load as the one before it.
    if (steps.length && loaded <= steps[steps.length - 1]!.loadedWeight) continue;
    steps.push({ pct: r.pct, reps: r.reps, targetWeight: target, loadedWeight: loaded, label: r.label });
  }

  return steps;
}

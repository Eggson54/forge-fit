/**
 * Barbell plate maths.
 *
 * Given a target load, work out what to put on each side of the bar. The result
 * is intentionally honest about being unreachable: gym plates are discrete, so a
 * target that cannot be loaded returns the closest achievable weight and the
 * difference, rather than silently rounding.
 */

export type Unit = 'imperial' | 'metric';

/** Plate denominations, heaviest first, in the unit the user enters. */
export const PLATES: Record<Unit, number[]> = {
  imperial: [45, 35, 25, 10, 5, 2.5],
  metric: [25, 20, 15, 10, 5, 2.5, 1.25],
};

export const BAR_OPTIONS: Record<Unit, number[]> = {
  imperial: [45, 35, 15, 0],
  metric: [20, 15, 10, 7, 0],
};

export interface PlatePlan {
  /** Plates for ONE side, heaviest first. */
  perSide: { weight: number; count: number }[];
  /** What the bar plus these plates actually weighs. */
  achievable: number;
  /** achievable - target; negative when the closest load is under the target. */
  delta: number;
  /** True when the target is below the bar itself. */
  belowBar: boolean;
}

/**
 * Loads heaviest-first, which is both how a bar is actually loaded and — for
 * these two denomination sets — exact: a test walks the whole reachable range
 * in each unit and checks the greedy pass never strands a remainder that the
 * smaller plates could have covered.
 */
export function planPlates(target: number, bar: number, unit: Unit): PlatePlan {
  const available = PLATES[unit]!;
  if (!Number.isFinite(target) || target <= bar) {
    return { perSide: [], achievable: bar, delta: bar - Math.max(0, target || 0), belowBar: true };
  }

  let perSideRemaining = (target - bar) / 2;
  const perSide: { weight: number; count: number }[] = [];

  for (const plate of available) {
    const count = Math.floor((perSideRemaining + 1e-9) / plate);
    if (count > 0) {
      perSide.push({ weight: plate, count });
      perSideRemaining -= count * plate;
    }
  }

  const loaded = perSide.reduce((a, p) => a + p.weight * p.count, 0) * 2;
  const achievable = Math.round((bar + loaded) * 100) / 100;
  return {
    perSide,
    achievable,
    delta: Math.round((achievable - target) * 100) / 100,
    belowBar: false,
  };
}

/** Total plate count across both sides, for a quick sanity read. */
export function totalPlates(plan: PlatePlan): number {
  return plan.perSide.reduce((a, p) => a + p.count, 0) * 2;
}

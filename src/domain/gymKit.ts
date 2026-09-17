import { PLATES, BAR_OPTIONS, availablePlates, type Unit } from './plates';

/**
 * What a particular gym actually has.
 *
 * The plate calculator has always read one inventory from the profile, which
 * is right only if you train in one place. The moment the Iron Map exists, the
 * app knows you train in several — and the gym with no 2.5s and a 15 kg bar is
 * exactly the one where the maths matters most.
 */
export interface GymKit {
  /** Plate denominations present, in the gym's own unit. Empty means "standard". */
  plates: number[];
  /** Bar weights available. Empty means "standard". */
  bars: number[];
  /** The unit the equipment is marked in, which need not match the app's. */
  unit: Unit;
  notes?: string;
}

export function emptyKit(unit: Unit): GymKit {
  return { plates: [], bars: [], unit };
}

/** True when nothing has been customised, so the UI can say "standard". */
export function isStandardKit(kit: GymKit | undefined): boolean {
  return !kit || (kit.plates.length === 0 && kit.bars.length === 0);
}

/**
 * The plates to load from at a given gym.
 *
 * Falls through in order: the gym's own inventory, then the athlete's default
 * inventory, then the standard set for the unit. A gym recorded as having
 * nothing is treated as unrecorded rather than as a gym with no plates —
 * "I have not filled this in" and "this gym has no equipment" look identical
 * in an empty array, and only one of them is ever true.
 */
export function platesAt(unit: Unit, kit: GymKit | undefined, profileDefault?: number[]): number[] {
  if (kit && kit.plates.length > 0) return availablePlates(unit, kit.plates);
  return availablePlates(unit, profileDefault);
}

/** Bar options at a gym, same fallback order. */
export function barsAt(unit: Unit, kit: GymKit | undefined): number[] {
  const usable = (kit?.bars ?? []).filter((b) => b >= 0);
  if (usable.length === 0) return BAR_OPTIONS[unit]!;
  return [...new Set(usable)].sort((a, b) => b - a);
}

/**
 * The smallest weight increase the bar can make at this gym, which is twice the
 * lightest plate. The number that decides whether "add 2.5 kg next time" is
 * advice or a fantasy.
 */
export function smallestJump(unit: Unit, kit: GymKit | undefined, profileDefault?: number[]): number {
  const plates = platesAt(unit, kit, profileDefault);
  const lightest = plates[plates.length - 1];
  return lightest ? Math.round(lightest * 2 * 100) / 100 : 0;
}

/** A one-line summary for the gym card: "45 · 25 · 10 · 5 lb · 45 lb bar". */
export function describeKit(kit: GymKit | undefined, unit: Unit): string {
  if (isStandardKit(kit)) return 'Standard plates and bars';
  const unitLabel = (kit?.unit ?? unit) === 'imperial' ? 'lb' : 'kg';
  const plates = kit!.plates.length
    ? `${[...kit!.plates].sort((a, b) => b - a).join(' · ')} ${unitLabel}`
    : 'standard plates';
  const bars = kit!.bars.length ? `${[...kit!.bars].sort((a, b) => b - a).join('/')} ${unitLabel} bar` : null;
  return bars ? `${plates} · ${bars}` : plates;
}

/** Every denomination a gym could plausibly have, for the picker. */
export function plateChoices(unit: Unit): number[] {
  return unit === 'imperial'
    ? [100, 55, 45, 35, 25, 10, 5, 2.5, 1.25]
    : [25, 20, 15, 10, 5, 2.5, 1.25, 0.5];
}

export function barChoices(unit: Unit): number[] {
  return unit === 'imperial' ? [45, 35, 33, 15, 0] : [20, 15, 10, 7, 0];
}

export { PLATES, BAR_OPTIONS };

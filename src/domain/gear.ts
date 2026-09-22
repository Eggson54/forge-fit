import type { ISODate, UUID } from './types';
import { daysBetweenDates, todayISO } from './date';

/**
 * Shoes, bikes and the mileage on them.
 *
 * The one piece of equipment tracking that earns its place: running shoes
 * have a working life, and the injury that comes from running eight hundred
 * miles in a pair is both common and entirely avoidable by knowing the
 * number. Nobody remembers when they bought the shoes.
 *
 * The retirement figure is deliberately a *default the user can change*
 * rather than a rule. The 300–500 mile range is a manufacturer's estimate
 * that varies enormously with weight, gait, surface and construction; foam
 * does not know what mile it is on. The app shows the number and says where
 * it came from.
 */

export type GearKind = 'shoes' | 'bike' | 'other';

export const GEAR_LABEL: Record<GearKind, string> = {
  shoes: 'Shoes',
  bike: 'Bike',
  other: 'Other',
};

/** Defaults in kilometres, and stated as estimates wherever they are shown. */
export const DEFAULT_LIFE_KM: Record<GearKind, number | null> = {
  shoes: 650,
  // A bike does not wear out; its consumables do, on their own schedules.
  bike: null,
  other: null,
};

export interface Gear {
  id: UUID;
  kind: GearKind;
  name: string;
  /** Which activity types this is used for. */
  types: string[];
  addedOn: ISODate;
  /** Distance already on it when it was added, in metres. */
  startingM: number;
  /** Null means the app does not nag about this one. */
  retireAtM: number | null;
  retiredOn?: ISODate | null;
  /** The one picked automatically for a matching activity. */
  isDefault?: boolean;
}

export interface GearUse {
  gearId: UUID;
  activityId: UUID;
  date: ISODate;
  distanceM: number;
}

export interface GearTotals {
  gear: Gear;
  /** Starting distance plus everything logged against it. */
  totalM: number;
  activities: number;
  /** 0–1 towards the retirement figure. Null when there is not one. */
  wear: number | null;
  lastUsed: ISODate | null;
  note: string;
}

export function totalsFor(gear: Gear, uses: GearUse[], today: ISODate = todayISO()): GearTotals {
  const mine = uses.filter((u) => u.gearId === gear.id);
  const totalM = gear.startingM + mine.reduce((a, u) => a + u.distanceM, 0);
  const lastUsed = mine.length ? mine.map((u) => u.date).sort().slice(-1)[0]! : null;
  const wear = gear.retireAtM && gear.retireAtM > 0 ? totalM / gear.retireAtM : null;

  return {
    gear,
    totalM,
    activities: mine.length,
    wear,
    lastUsed,
    note: describe(gear, totalM, wear, lastUsed, today),
  };
}

function describe(gear: Gear, totalM: number, wear: number | null, lastUsed: ISODate | null, today: ISODate): string {
  if (gear.retiredOn) return `Retired on ${gear.retiredOn}.`;

  const idle = lastUsed ? daysBetweenDates(lastUsed, today) : null;
  const idleNote =
    idle == null ? 'Nothing logged against these yet.'
    : idle > 90 ? `Not used in ${Math.round(idle / 30)} months.`
    : '';

  if (wear == null) return idleNote || 'No retirement figure set, so nothing here will nag you.';
  if (wear >= 1) {
    return `Past the ${Math.round((gear.retireAtM ?? 0) / 1000)} km you set. That figure is an estimate, not an expiry date — but if something has started aching, this is worth ruling out. ${idleNote}`.trim();
  }
  if (wear >= 0.85) {
    return `Approaching the figure you set. Worth starting to break in the next pair alongside these rather than switching over in one day. ${idleNote}`.trim();
  }
  return idleNote || 'Plenty left.';
}

export type WearBand = 'fresh' | 'worn' | 'due' | 'past';

export function wearBand(wear: number | null): WearBand {
  if (wear == null) return 'fresh';
  if (wear >= 1) return 'past';
  if (wear >= 0.85) return 'due';
  if (wear >= 0.5) return 'worn';
  return 'fresh';
}

export const WEAR_LABEL: Record<WearBand, string> = {
  fresh: 'Fresh',
  worn: 'Broken in',
  due: 'Due soon',
  past: 'Past its figure',
};

/**
 * Which gear an activity of this type should be logged against.
 *
 * The default for the type if there is one, otherwise the only candidate,
 * otherwise nothing — guessing between two pairs of shoes would silently
 * attribute mileage to the wrong one, and mileage on the wrong shoe is worse
 * than no mileage at all.
 */
export function defaultFor(type: string, gear: Gear[]): Gear | null {
  const candidates = gear.filter((g) => !g.retiredOn && g.types.includes(type));
  if (candidates.length === 0) return null;
  return candidates.find((g) => g.isDefault) ?? (candidates.length === 1 ? candidates[0]! : null);
}

/** Gear in the order a list should show it: in use first, retired last. */
export function orderGear(gear: Gear[], uses: GearUse[], today: ISODate = todayISO()): GearTotals[] {
  return gear
    .map((g) => totalsFor(g, uses, today))
    .sort((a, b) => {
      if (!!a.gear.retiredOn !== !!b.gear.retiredOn) return a.gear.retiredOn ? 1 : -1;
      const da = a.lastUsed ?? '';
      const db = b.lastUsed ?? '';
      if (da !== db) return da < db ? 1 : -1;
      return a.gear.name.localeCompare(b.gear.name);
    });
}

export const GEAR_NOTE =
  'The retirement figure is a default you can change, not a rule. Manufacturers quote 300–500 miles and it varies enormously with weight, gait and surface — foam does not know what mile it is on. The number is worth having because nobody remembers when they bought the shoes.';

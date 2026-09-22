import type { TrackPoint } from './track';

/**
 * Heart-rate, pace and power zones, and what a session spent in each.
 *
 * Zones are where a lot of training apps quietly start inventing. A default
 * maximum heart rate of 220 minus your age is wrong for most individuals by
 * ten beats or more in either direction, and every zone built on it inherits
 * that error. So: the app will use it, because it is better than nothing, but
 * it says so every time, and anything derived from a *measured* maximum is
 * labelled differently from anything derived from the formula.
 */

export type ZoneBasis = 'measured' | 'estimated';

export interface Zone {
  index: number;
  label: string;
  /** Lower bound as a fraction of maximum. */
  from: number;
  to: number;
  description: string;
  color: string;
}

/**
 * Five zones, as a fraction of maximum heart rate.
 *
 * The five-zone split is a convention rather than a discovery — the
 * boundaries between three and four are the ones people argue about — but it
 * is the convention almost every other app and coach uses, and a private
 * scheme that disagrees with a coaching plan is worse than a conventional one
 * that is roughly right.
 */
export const HR_ZONES: Zone[] = [
  { index: 1, label: 'Recovery', from: 0.5, to: 0.6, description: 'Easy enough to hold a conversation without noticing you are.', color: '#7FB2FF' },
  { index: 2, label: 'Endurance', from: 0.6, to: 0.7, description: 'Conversational. Where most of the week should live.', color: '#39E6C3' },
  { index: 3, label: 'Tempo', from: 0.7, to: 0.8, description: 'Comfortably hard. Sentences, not paragraphs.', color: '#C6F135' },
  { index: 4, label: 'Threshold', from: 0.8, to: 0.9, description: 'Hard. A few words at a time, and it stops being sustainable within the hour.', color: '#FFB020' },
  { index: 5, label: 'Maximum', from: 0.9, to: 1.01, description: 'All of it. Minutes, then done.', color: '#FF4D5E' },
];

/** The old formula. Kept, and labelled as a guess wherever it is used. */
export function estimatedMaxHr(age: number): number {
  return Math.round(220 - Math.max(10, Math.min(100, age)));
}

export interface ZoneSetup {
  maxHr: number;
  basis: ZoneBasis;
}

/**
 * Which zone setup to use: a measured maximum if the athlete has entered one,
 * otherwise the formula, flagged.
 */
export function zoneSetup(opts: { measuredMaxHr?: number | null; age?: number | null }): ZoneSetup | null {
  if (typeof opts.measuredMaxHr === 'number' && opts.measuredMaxHr > 100) {
    return { maxHr: Math.round(opts.measuredMaxHr), basis: 'measured' };
  }
  if (typeof opts.age === 'number' && opts.age > 0) {
    return { maxHr: estimatedMaxHr(opts.age), basis: 'estimated' };
  }
  return null;
}

export function zoneFor(bpm: number, setup: ZoneSetup): Zone | null {
  if (!Number.isFinite(bpm) || bpm <= 0 || setup.maxHr <= 0) return null;
  const fraction = bpm / setup.maxHr;
  return HR_ZONES.find((z) => fraction >= z.from && fraction < z.to) ?? (fraction >= 1 ? HR_ZONES[4]! : null);
}

export interface ZoneTime {
  zone: Zone;
  seconds: number;
  /** Share of the session's timed heart-rate samples, 0–1. */
  share: number;
}

/**
 * Seconds spent in each zone.
 *
 * Time is attributed to the zone of the *interval*, using the heart rate at
 * its end, rather than counting samples. Counting samples silently assumes an
 * even sample rate, and a receiver that drops out for two minutes then returns
 * would otherwise contribute one sample's worth of a two-minute climb.
 */
export function timeInZones(points: TrackPoint[], setup: ZoneSetup): ZoneTime[] {
  const withHr = points.filter((p) => typeof p.hr === 'number' && p.hr > 0).sort((a, b) => a.t - b.t);
  const seconds = new Map<number, number>();
  let total = 0;

  for (let i = 1; i < withHr.length; i++) {
    const dt = (withHr[i]!.t - withHr[i - 1]!.t) / 1000;
    // A gap longer than a minute is a dropout, not a minute of that zone.
    if (dt <= 0 || dt > 60) continue;
    const z = zoneFor(withHr[i]!.hr!, setup);
    if (!z) continue;
    seconds.set(z.index, (seconds.get(z.index) ?? 0) + dt);
    total += dt;
  }

  return HR_ZONES.map((zone) => {
    const s = seconds.get(zone.index) ?? 0;
    return { zone, seconds: Math.round(s), share: total > 0 ? s / total : 0 };
  });
}

// --------------------------------------------------- relative effort ----

/**
 * One number for how hard a session was on *this* athlete.
 *
 * Time in each zone, weighted so that the weights climb faster than the zones
 * do: ten minutes at threshold is not twice ten minutes in endurance, it is
 * several times it. That non-linearity is the only reason a single number is
 * worth having at all — a linear one just re-reports duration.
 *
 * Returns null without heart rate. An effort score built from duration and a
 * guess is duration with a costume on.
 */
const ZONE_WEIGHT: Record<number, number> = { 1: 0.4, 2: 1, 3: 1.9, 4: 3.3, 5: 5.2 };

export interface RelativeEffort {
  score: number;
  minutes: number;
  /** Which zone took the most time. */
  dominant: Zone;
  basis: ZoneBasis;
  note: string;
}

export function relativeEffort(zoneTimes: ZoneTime[], basis: ZoneBasis): RelativeEffort | null {
  const totalSeconds = zoneTimes.reduce((a, z) => a + z.seconds, 0);
  if (totalSeconds < 120) return null;

  const score = Math.round(
    zoneTimes.reduce((a, z) => a + (z.seconds / 60) * (ZONE_WEIGHT[z.zone.index] ?? 1), 0),
  );
  const dominant = [...zoneTimes].sort((a, b) => b.seconds - a.seconds)[0]!.zone;

  return {
    score,
    minutes: Math.round(totalSeconds / 60),
    dominant,
    basis,
    note:
      basis === 'estimated'
        ? `Mostly ${dominant.label.toLowerCase()}. Your zones come from the 220-minus-age formula, which is wrong for most people by ten beats either way — enter a measured maximum and this number changes.`
        : `Mostly ${dominant.label.toLowerCase()}, against the maximum you measured.`,
  };
}

// ---------------------------------------------------------- pace zones ----

export interface PaceZone {
  label: string;
  /** Multiplier on threshold pace. Larger is slower. */
  from: number;
  to: number;
  description: string;
}

/**
 * Pace zones as multiples of threshold pace — the pace you could hold for
 * about an hour.
 *
 * Expressed as multipliers rather than fixed times because a threshold pace is
 * the only anchor that means the same thing to a 3-hour and a 5-hour
 * marathoner. The app asks for one rather than guessing it.
 */
export const PACE_ZONES: PaceZone[] = [
  { label: 'Recovery', from: 1.29, to: 2.0, description: 'Slower than feels worthwhile. That is the point of it.' },
  { label: 'Easy', from: 1.14, to: 1.29, description: 'The bulk of the week.' },
  { label: 'Steady', from: 1.06, to: 1.14, description: 'Honest aerobic work.' },
  { label: 'Threshold', from: 0.97, to: 1.06, description: 'About an hour, at most.' },
  { label: 'Interval', from: 0.9, to: 0.97, description: 'Repeats, with rest.' },
  { label: 'Repetition', from: 0.0, to: 0.9, description: 'Short, fast, fully recovered between.' },
];

export function paceZoneFor(paceSecPerKm: number, thresholdSecPerKm: number): PaceZone | null {
  if (!(paceSecPerKm > 0) || !(thresholdSecPerKm > 0)) return null;
  const ratio = paceSecPerKm / thresholdSecPerKm;
  return PACE_ZONES.find((z) => ratio >= z.from && ratio < z.to) ?? PACE_ZONES[PACE_ZONES.length - 1]!;
}

export const ZONES_CAVEAT =
  'Zones are only as good as the maximum they are built on. 220 minus your age is a population average that fits very few individuals; if you have ever seen your real maximum on a watch during a hard finish, entering it makes every number on this screen mean something.';

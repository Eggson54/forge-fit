import type { ISODate, ISODateTime, UUID } from './types';
import { distanceMeters, type LatLon } from './geo';

/**
 * A recorded GPS track, and everything that can be read off it.
 *
 * Written so the app can record and analyse its own outdoor activity rather
 * than importing someone else's. That decision is what this whole file is
 * for, and it has one consequence worth stating up front: **a phone's GPS is
 * noisy**. Consumer receivers wander five to ten metres while standing still,
 * and barometric altitude drifts with the weather. Every number below is
 * computed with that in mind — a raw sum of point-to-point distances over an
 * unfiltered trace will confidently tell someone they ran 400 metres while
 * queuing for coffee.
 *
 * So: points are filtered before they are measured, elevation is smoothed
 * before it is summed, and anything that cannot survive the noise is not
 * offered at all.
 */

export interface TrackPoint {
  lat: number;
  lon: number;
  /** Milliseconds since epoch. */
  t: number;
  /** Metres above sea level, when the device reported one. */
  ele?: number;
  /** The receiver's own horizontal accuracy estimate, in metres. */
  acc?: number;
  /** Beats per minute from a paired monitor, when there is one. */
  hr?: number;
  /** Watts, for anyone riding with a meter. */
  power?: number;
  /** Revolutions or steps per minute. */
  cadence?: number;
}

export interface Track {
  id: UUID;
  points: TrackPoint[];
}

// ------------------------------------------------------------ cleaning ----

/**
 * How far off a fix can be before it is thrown away.
 *
 * Thirty metres is generous — a good phone reports three to five outdoors —
 * but the alternative is discarding the first minute of every activity while
 * the receiver settles, which loses a real start line to save a little noise.
 */
export const MAX_ACCURACY_M = 30;

/**
 * The speed above which a fix is assumed to be a jump rather than a human.
 *
 * 30 m/s is 108 km/h: faster than any cyclist and most cars. A GPS that
 * briefly relocates you across town produces exactly this, and without the
 * guard it adds a kilometre to the total in one sample.
 */
const MAX_SPEED_MS = 30;

/**
 * Drop the fixes that would lie.
 *
 * Three filters, in order: fixes the receiver itself flagged as poor, fixes
 * that imply impossible speed, and fixes that did not move far enough to be
 * distinguishable from noise. The last one is why standing still does not
 * accumulate distance.
 */
export function cleanTrack(points: TrackPoint[], maxAccuracy = MAX_ACCURACY_M): TrackPoint[] {
  const byTime = [...points].sort((a, b) => a.t - b.t);
  const out: TrackPoint[] = [];

  for (const p of byTime) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    if (Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) continue;
    if (typeof p.acc === 'number' && p.acc > maxAccuracy) continue;

    const prev = out[out.length - 1];
    if (!prev) {
      out.push(p);
      continue;
    }

    const dt = (p.t - prev.t) / 1000;
    if (dt <= 0) continue;

    const d = distanceMeters(prev, p);
    if (d / dt > MAX_SPEED_MS) continue;

    // Below the receiver's own noise floor, a "move" is the antenna
    // breathing. Keep the point's clock — a pause is still time — but do not
    // let it add distance by admitting it to the line.
    const floor = Math.max(2, Math.min(prev.acc ?? 0, p.acc ?? 0) * 0.5);
    if (d < floor) continue;

    out.push(p);
  }

  return out;
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

// ------------------------------------------------------------ measures ----

export interface TrackStats {
  /** Metres along the ground, after cleaning. */
  distanceM: number;
  /** Seconds from first fix to last, pauses included. */
  elapsedS: number;
  /** Seconds actually spent moving. The number a pace should be built on. */
  movingS: number;
  /** Metres climbed, after smoothing. */
  ascentM: number;
  descentM: number;
  /** Null when no fix carried an altitude. */
  maxEleM: number | null;
  minEleM: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgPower: number | null;
  avgCadence: number | null;
  points: number;
}

/**
 * The speed below which someone is not considered to be moving.
 *
 * 0.5 m/s is a very slow walk. Anything under it is a traffic light, a gate,
 * or a receiver wobbling in place, and counting it as running time is what
 * makes an honest 5k read as a 45-minute one.
 */
const MOVING_THRESHOLD_MS = 0.5;

export function trackStats(points: TrackPoint[]): TrackStats {
  const pts = cleanTrack(points);
  const empty: TrackStats = {
    distanceM: 0, elapsedS: 0, movingS: 0, ascentM: 0, descentM: 0,
    maxEleM: null, minEleM: null, avgHr: null, maxHr: null,
    avgPower: null, avgCadence: null, points: pts.length,
  };
  if (pts.length < 2) return empty;

  let distanceM = 0;
  let movingS = 0;

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const d = distanceMeters(a, b);
    const dt = (b.t - a.t) / 1000;
    distanceM += d;
    if (dt > 0 && d / dt >= MOVING_THRESHOLD_MS) movingS += dt;
  }

  const { ascentM, descentM } = elevationChange(pts);
  const eles = pts.map((p) => p.ele).filter((e): e is number => typeof e === 'number');
  const hrs = pts.map((p) => p.hr).filter((h): h is number => typeof h === 'number' && h > 0);
  const powers = pts.map((p) => p.power).filter((w): w is number => typeof w === 'number' && w >= 0);
  const cadences = pts.map((p) => p.cadence).filter((c): c is number => typeof c === 'number' && c > 0);

  return {
    distanceM,
    elapsedS: (pts[pts.length - 1]!.t - pts[0]!.t) / 1000,
    movingS,
    ascentM,
    descentM,
    maxEleM: eles.length ? Math.max(...eles) : null,
    minEleM: eles.length ? Math.min(...eles) : null,
    avgHr: hrs.length ? Math.round(mean(hrs)) : null,
    maxHr: hrs.length ? Math.max(...hrs) : null,
    avgPower: powers.length ? Math.round(mean(powers)) : null,
    avgCadence: cadences.length ? Math.round(mean(cadences)) : null,
    points: pts.length,
  };
}

/**
 * Metres up and metres down.
 *
 * The threshold is the whole trick. A barometric or GPS altitude wobbles by a
 * couple of metres every sample; summing every upward wobble over an hour
 * invents several hundred metres of climbing on a flat towpath. Only rises
 * that exceed the noise band are counted, and they are counted from the last
 * *confirmed* level rather than from the previous point, so a long steady
 * climb still accumulates properly.
 */
export const ELEVATION_NOISE_M = 3;

export function elevationChange(points: TrackPoint[], threshold = ELEVATION_NOISE_M): { ascentM: number; descentM: number } {
  const eles = points.map((p) => p.ele).filter((e): e is number => typeof e === 'number');
  if (eles.length < 2) return { ascentM: 0, descentM: 0 };

  let ascentM = 0;
  let descentM = 0;
  let anchor = eles[0]!;

  for (const e of eles) {
    const delta = e - anchor;
    if (delta >= threshold) {
      ascentM += delta;
      anchor = e;
    } else if (delta <= -threshold) {
      descentM += -delta;
      anchor = e;
    }
  }

  return { ascentM: Math.round(ascentM), descentM: Math.round(descentM) };
}

// -------------------------------------------------------------- splits ----

export interface Split {
  /** 1-based. */
  index: number;
  /** Metres in this split — the last one is usually short. */
  distanceM: number;
  seconds: number;
  /** Seconds per kilometre or per mile, depending on the split length. */
  paceSecPerUnit: number;
  ascentM: number;
  avgHr: number | null;
}

export const KM = 1000;
export const MILE = 1609.344;

/**
 * Per-kilometre or per-mile splits.
 *
 * Boundaries are interpolated rather than snapped to the nearest fix: at a
 * one-second sample rate a runner covers three or four metres between points,
 * and snapping puts the kilometre marker anywhere in that gap. Over ten
 * splits the error compounds into a difference you can see.
 */
export function splits(points: TrackPoint[], unitM: number = KM): Split[] {
  const pts = cleanTrack(points);
  if (pts.length < 2 || unitM <= 0) return [];

  const out: Split[] = [];
  let covered = 0;
  let splitStartT = pts[0]!.t;
  let target = unitM;
  let hrSum = 0;
  let hrCount = 0;
  let ascent = 0;
  let eleAnchor = pts[0]!.ele;

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const d = distanceMeters(a, b);
    if (typeof b.hr === 'number' && b.hr > 0) {
      hrSum += b.hr;
      hrCount += 1;
    }
    if (typeof b.ele === 'number' && typeof eleAnchor === 'number') {
      const delta = b.ele - eleAnchor;
      if (delta >= ELEVATION_NOISE_M) {
        ascent += delta;
        eleAnchor = b.ele;
      } else if (delta <= -ELEVATION_NOISE_M) {
        eleAnchor = b.ele;
      }
    } else if (typeof b.ele === 'number') {
      eleAnchor = b.ele;
    }

    // A single leg can cross more than one boundary if the sample rate is low.
    while (covered + d >= target && d > 0) {
      const fraction = (target - covered) / d;
      const boundaryT = a.t + (b.t - a.t) * fraction;
      const seconds = (boundaryT - splitStartT) / 1000;
      out.push({
        index: out.length + 1,
        distanceM: unitM,
        seconds,
        paceSecPerUnit: seconds,
        ascentM: Math.round(ascent),
        avgHr: hrCount ? Math.round(hrSum / hrCount) : null,
      });
      splitStartT = boundaryT;
        target += unitM;
      hrSum = 0;
      hrCount = 0;
      ascent = 0;
    }

    covered += d;
  }

  // The remainder, only when it is long enough to mean anything. A 20-metre
  // tail with a pace extrapolated from four seconds is noise wearing a number.
  const leftover = covered - (target - unitM);
  if (leftover >= unitM * 0.1) {
    const seconds = (pts[pts.length - 1]!.t - splitStartT) / 1000;
    out.push({
      index: out.length + 1,
      distanceM: leftover,
      seconds,
      paceSecPerUnit: (seconds / leftover) * unitM,
      ascentM: Math.round(ascent),
      avgHr: hrCount ? Math.round(hrSum / hrCount) : null,
    });
  }

  return out;
}

// ----------------------------------------------------- grade adjustment ----

/**
 * Pace adjusted for the hill it was run on.
 *
 * Running uphill costs more per metre than running flat, and downhill costs
 * *less* only up to a point — past roughly −15% the braking costs more again.
 * The multiplier below is a quadratic fitted to that shape: it rises steeply
 * with gradient, dips to its minimum around −12%, and turns back up.
 *
 * It is an approximation of a published relationship, not a measurement of
 * this athlete, and it applies to running. Cycling does not work this way at
 * all — a bike coasts — so the callers only use it for foot sports.
 */
export function gradeFactor(gradient: number): number {
  const g = Math.max(-0.35, Math.min(0.35, gradient));
  const f = 1 + 3.35 * g + 12.8 * g * g;
  return Math.max(0.5, f);
}

/**
 * Grade-adjusted pace, in seconds per kilometre.
 *
 * Answers "what flat pace would have cost the same effort". Returns null
 * without altitude, because an adjustment computed from no gradient is just
 * the pace with a more impressive name.
 */
export function gradeAdjustedPace(points: TrackPoint[]): number | null {
  const pts = cleanTrack(points);
  if (pts.length < 2) return null;
  if (!pts.some((p) => typeof p.ele === 'number')) return null;

  let equivalentM = 0;
  let seconds = 0;

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const d = distanceMeters(a, b);
    const dt = (b.t - a.t) / 1000;
    if (d <= 0 || dt <= 0 || d / dt < MOVING_THRESHOLD_MS) continue;

    const rise = typeof a.ele === 'number' && typeof b.ele === 'number' ? b.ele - a.ele : 0;
    equivalentM += d * gradeFactor(rise / d);
    seconds += dt;
  }

  if (equivalentM <= 0 || seconds <= 0) return null;
  return (seconds / equivalentM) * KM;
}

// --------------------------------------------------------- simplifying ----

/**
 * Thin a trace for drawing, keeping its shape.
 *
 * Ramer–Douglas–Peucker. An hour's run is three thousand points and an SVG
 * path of three thousand points is a scroll-janking path; at a tolerance of a
 * few metres the drawn line is indistinguishable and a tenth the size.
 */
export function simplify(points: TrackPoint[], toleranceM = 5): TrackPoint[] {
  if (points.length <= 2) return [...points];

  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = perpendicularDistance(points[i]!, points[first]!, points[last]!);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (index !== -1 && maxDist > toleranceM) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }

  return points.filter((_, i) => keep[i]);
}

/** Distance from p to the segment ab, in metres. Flat-earth over these spans. */
function perpendicularDistance(p: LatLon, a: LatLon, b: LatLon): number {
  // One degree of latitude is ~111.32 km; longitude shrinks by cos(lat). Over
  // the tens of metres this is called on, that is exact enough and far cheaper
  // than a great-circle cross-track.
  const scale = Math.cos((a.lat * Math.PI) / 180);
  const ax = a.lon * scale;
  const ay = a.lat;
  const bx = b.lon * scale;
  const by = b.lat;
  const px = p.lon * scale;
  const py = p.lat;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy) * 111_320;
}

// ------------------------------------------------------------ formatting ----

/** "42:07" or "1:12:33". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** "4:52 /km". Seconds are rounded, then carried, so 4:60 never appears. */
export function formatPaceSec(secPerUnit: number, unit: 'km' | 'mi'): string {
  if (!Number.isFinite(secPerUnit) || secPerUnit <= 0) return '—';
  const total = Math.round(secPerUnit);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')} /${unit}`;
}

/** Seconds per kilometre or mile, from moving time. Null without distance. */
export function paceFrom(stats: TrackStats, units: 'imperial' | 'metric'): number | null {
  if (stats.distanceM <= 0) return null;
  const seconds = stats.movingS > 0 ? stats.movingS : stats.elapsedS;
  if (seconds <= 0) return null;
  return (seconds / stats.distanceM) * (units === 'imperial' ? MILE : KM);
}

/**
 * The elevation profile, sampled against distance.
 *
 * Stored separately from the trace, and that separation is the point.
 * `simplify` thins the trace by its *shape on the ground*, so a dead-straight
 * climb collapses to two points — correct for drawing the route, and it takes
 * the entire climb profile with it. Sampling altitude against distance here
 * keeps the profile whatever the line does.
 *
 * Against distance rather than against sample index, too: samples bunch up
 * where you slow down, so an index-based profile stretches every climb and
 * flattens every descent, which is the exact opposite of what it is for.
 */
export interface ElevationSample {
  distanceM: number;
  ele: number;
}

export function elevationProfile(points: TrackPoint[], stepM = 25, maxSamples = 300): ElevationSample[] {
  const pts = cleanTrack(points).filter((p) => typeof p.ele === 'number');
  if (pts.length < 2) return [];

  let total = 0;
  const cumulative: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    total += distanceMeters(pts[i - 1]!, pts[i]!);
    cumulative.push(total);
  }
  if (total <= 0) return [];

  const step = Math.max(stepM, total / maxSamples);
  const out: ElevationSample[] = [];
  let next = 0;
  for (let i = 0; i < pts.length; i++) {
    if (cumulative[i]! >= next || i === pts.length - 1) {
      out.push({ distanceM: Math.round(cumulative[i]!), ele: Math.round(pts[i]!.ele! * 10) / 10 });
      next = cumulative[i]! + step;
    }
  }
  return out;
}

export interface RecordedActivity {
  id: UUID;
  date: ISODate;
  startedAt: ISODateTime;
  /** Matches the CardioType the rest of the app already knows. */
  type: string;
  name: string;
  points: TrackPoint[];
  notes?: string;
  /** 1-5, the same scale as a lifting session. */
  effort?: number;
}

export const TRACK_CAVEAT =
  'A phone measures where it is to within a few metres and how high it is to within rather more. Distance is filtered before it is summed and climbing is only counted past a three-metre threshold, which is why these numbers can sit slightly under a watch that counts every wobble.';

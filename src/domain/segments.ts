import { cleanTrack, formatDuration, type TrackPoint } from './track';
import { bearingDegrees, distanceMeters, distanceToPathMeters, type LatLon } from './geo';
import type { ISODate, ISODateTime, UUID } from './types';

/**
 * Segments: a stretch of road or trail you care about, and every time you have
 * covered it.
 *
 * The honest version of an idea that usually depends on a service with
 * millions of users. There is no global leaderboard here and there is not
 * going to be one — a leaderboard needs other people, and inventing rivals
 * would be a lie dressed as a feature. What a single athlete's data genuinely
 * supports is the part that actually changes training: *your* times on *your*
 * hill, ranked against each other, with the trend over a year.
 *
 * So a segment is created from a piece of your own trace, and every later
 * activity that passes through it is matched automatically.
 */

export interface Segment {
  id: UUID;
  name: string;
  /** The shape, thinned for storage and matching. */
  path: LatLon[];
  distanceM: number;
  ascentM: number;
  /** The activity it was carved out of. */
  createdFromActivityId: UUID;
  createdAt: ISODateTime;
  /** Foot, wheel — a run and a ride down the same road are not comparable. */
  discipline: 'foot' | 'wheel';
  /** Hidden segments stay matched but drop off the list. */
  hidden?: boolean;
}

export interface SegmentEffort {
  segmentId: UUID;
  activityId: UUID;
  activityName: string;
  date: ISODate;
  seconds: number;
  /** Index range within the cleaned activity trace. */
  startIndex: number;
  endIndex: number;
  avgHr: number | null;
}

// ------------------------------------------------------------ matching ----

/**
 * How close a fix has to pass to a segment's end to count as having hit it.
 *
 * Twenty-five metres is roughly a wide road. Tighter and a legitimate effort
 * on the far side of the carriageway is missed; looser and a parallel street
 * starts matching. This is the single number that decides whether the feature
 * feels reliable or maddening, which is why it is named rather than inlined.
 */
export const GATE_RADIUS_M = 25;

/**
 * How far the middle of a candidate may stray from the segment's own shape.
 *
 * Checked because hitting both gates is not enough on its own: a loop that
 * starts and finishes at the same junction would otherwise match a segment
 * running straight between them.
 */
export const CORRIDOR_M = 40;

/** Degrees of heading difference tolerated at the start gate. */
const HEADING_TOLERANCE = 75;

/**
 * Every time this activity covered this segment.
 *
 * The shape of the problem: find a fix near the start heading the right way,
 * then the next fix near the end, then check the middle stayed on the line.
 * Laps are supported — someone doing hill repeats gets one effort per repeat,
 * which is the whole point of hill repeats.
 */
export function matchSegment(segment: Segment, points: TrackPoint[]): { seconds: number; startIndex: number; endIndex: number; avgHr: number | null }[] {
  const pts = cleanTrack(points);
  if (pts.length < 2 || segment.path.length < 2) return [];

  const gateStart = segment.path[0]!;
  const gateEnd = segment.path[segment.path.length - 1]!;
  const segmentHeading = bearingDegrees(segment.path[0]!, segment.path[1]!);

  const efforts: { seconds: number; startIndex: number; endIndex: number; avgHr: number | null }[] = [];
  let i = 0;

  while (i < pts.length - 1) {
    // A candidate start: near the gate and pointed the same way.
    if (distanceMeters(pts[i]!, gateStart) > GATE_RADIUS_M) {
      i += 1;
      continue;
    }
    const heading = bearingDegrees(pts[i]!, pts[i + 1]!);
    if (angleBetween(heading, segmentHeading) > HEADING_TOLERANCE) {
      i += 1;
      continue;
    }
    // Use the closest approach to the gate, not the first fix that happened
    // to fall inside it. See `closestApproach` for why that matters.
    i = closestApproach(pts, i, gateStart);

    // Walk forward to the first fix inside the finish gate. Give up once the
    // effort has run far past what the segment could plausibly take —
    // otherwise a segment entered but abandoned swallows the rest of the ride.
    let j = i + 1;
    let travelled = 0;
    let end = -1;
    const budget = segment.distanceM * 3 + 200;

    while (j < pts.length && travelled < budget) {
      travelled += distanceMeters(pts[j - 1]!, pts[j]!);
      if (distanceMeters(pts[j]!, gateEnd) <= GATE_RADIUS_M && travelled >= segment.distanceM * 0.7) {
        end = closestApproach(pts, j, gateEnd);
        break;
      }
      j += 1;
    }

    if (end === -1) {
      i += 1;
      continue;
    }

    if (!staysInCorridor(pts.slice(i, end + 1), segment.path)) {
      i += 1;
      continue;
    }

    const hrs = pts.slice(i, end + 1).map((p) => p.hr).filter((h): h is number => typeof h === 'number' && h > 0);
    efforts.push({
      seconds: (pts[end]!.t - pts[i]!.t) / 1000,
      startIndex: i,
      endIndex: end,
      avgHr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
    });

    // Resume after this effort so laps are found but the same effort is not
    // counted twice from a later fix still inside the start gate.
    i = end + 1;
  }

  return efforts;
}


/**
 * The fix that actually passes nearest a gate.
 *
 * A gate is a circle twenty-five metres across, and at a one-second sample
 * rate a cyclist crosses it in two or three fixes. Taking the *first* one
 * inside makes the recorded time depend on where the sampling clock happened
 * to land, which adds a second or two of noise in either direction — on a
 * segment ridden fifty times, that is enough to shuffle the order and make
 * the board look arbitrary. Walking on to the closest approach removes the
 * dependence on sample phase entirely.
 */
function closestApproach(pts: TrackPoint[], from: number, gate: LatLon): number {
  let best = from;
  let bestDistance = distanceMeters(pts[from]!, gate);
  for (let k = from + 1; k < pts.length; k++) {
    const d = distanceMeters(pts[k]!, gate);
    if (d >= bestDistance) break;
    bestDistance = d;
    best = k;
  }
  return best;
}

/** Smallest angle between two bearings, 0–180. */
function angleBetween(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return d > 180 ? 360 - d : d;
}

/**
 * Whether a candidate stayed on the segment's line.
 *
 * Samples the candidate at even intervals and checks each sample is within the
 * corridor of the segment. Sampling rather than checking every fix keeps this
 * cheap enough to run against a whole library of segments each time an
 * activity is saved.
 *
 * The distance is to the segment's *line*, not to its nearest stored vertex.
 * Stored paths are thinned — a straight two-kilometre stretch can be two
 * points — so measuring to vertices puts the middle of a candidate that is
 * exactly on the route a kilometre away from it, and nothing ever matches.
 */
function staysInCorridor(candidate: LatLon[], path: LatLon[], samples = 12): boolean {
  if (candidate.length < 2) return false;
  for (let s = 1; s < samples; s++) {
    const idx = Math.floor((candidate.length - 1) * (s / samples));
    if (distanceToPathMeters(candidate[idx]!, path, CORRIDOR_M) > CORRIDOR_M) return false;
  }
  return true;
}

// ------------------------------------------------------------ creation ----

/**
 * Carve a segment out of a stretch of one of your activities.
 *
 * Refuses under 200 metres. Below that the gates overlap, matching becomes
 * unreliable, and the resulting "segment" is a place rather than a stretch.
 */
export const MIN_SEGMENT_M = 200;

export function segmentFromTrace(
  points: TrackPoint[],
  startIndex: number,
  endIndex: number,
  opts: { id: UUID; name: string; activityId: UUID; discipline: 'foot' | 'wheel'; createdAt: ISODateTime },
): Segment | null {
  const pts = cleanTrack(points);
  const from = Math.max(0, Math.min(startIndex, endIndex));
  const to = Math.min(pts.length - 1, Math.max(startIndex, endIndex));
  // Two points is enough, because the corridor test measures against the
  // *line* rather than the vertices. A straight kilometre thins to exactly
  // two points, and demanding three made it impossible to turn a straight
  // road into a segment at all.
  if (to - from < 1) return null;

  const slice = pts.slice(from, to + 1);
  let distanceM = 0;
  for (let i = 1; i < slice.length; i++) distanceM += distanceMeters(slice[i - 1]!, slice[i]!);
  if (distanceM < MIN_SEGMENT_M) return null;

  let ascentM = 0;
  let anchor = slice.find((p) => typeof p.ele === 'number')?.ele;
  for (const p of slice) {
    if (typeof p.ele !== 'number' || typeof anchor !== 'number') continue;
    const delta = p.ele - anchor;
    if (delta >= 3) {
      ascentM += delta;
      anchor = p.ele;
    } else if (delta <= -3) {
      anchor = p.ele;
    }
  }

  return {
    id: opts.id,
    name: opts.name.trim() || 'Unnamed segment',
    path: slice.map((p) => ({ lat: p.lat, lon: p.lon })),
    distanceM: Math.round(distanceM),
    ascentM: Math.round(ascentM),
    createdFromActivityId: opts.activityId,
    createdAt: opts.createdAt,
    discipline: opts.discipline,
  };
}

/** Average gradient as a percentage. Flat segments read 0, not null. */
export function gradientPct(segment: Segment): number {
  if (segment.distanceM <= 0) return 0;
  return Math.round(((segment.ascentM / segment.distanceM) * 100) * 10) / 10;
}

/**
 * The cycling convention for how hard a climb is.
 *
 * Categories come from the product of length and gradient. Stated as the
 * borrowed convention it is — it says nothing about how *you* will find it,
 * which depends on what you weigh and what you have already ridden today.
 */
export type ClimbCategory = '4' | '3' | '2' | '1' | 'HC' | null;

export function climbCategory(segment: Segment): ClimbCategory {
  // The convention is length in metres times gradient in percent. Work that
  // through and the length cancels — it is ascent times one hundred — so this
  // is really a table of climbing, and a short wall can out-rank a long drag.
  // Left as the convention rather than "improved", because a category that
  // does not agree with every other cycling app is worse than useless.
  const score = segment.ascentM * 100;
  if (segment.ascentM < 30) return null;
  if (score >= 80_000) return 'HC';
  if (score >= 64_000) return '1';
  if (score >= 32_000) return '2';
  if (score >= 16_000) return '3';
  if (score >= 8_000) return '4';
  return null;
}

// --------------------------------------------------------- leaderboard ----

export interface SegmentBoard {
  efforts: SegmentEffort[];
  best: SegmentEffort | null;
  latest: SegmentEffort | null;
  /** Where the most recent effort sits. Null with fewer than two efforts. */
  latestRank: number | null;
  /** Seconds the latest effort was off the best. Negative means a new best. */
  latestVsBest: number | null;
  note: string;
}

/**
 * Your own board for one segment.
 *
 * Deliberately called your board and nothing else. There is no KOM here
 * because there is nobody to take it from.
 */
export function boardFor(segmentId: UUID, efforts: SegmentEffort[]): SegmentBoard {
  const mine = efforts.filter((e) => e.segmentId === segmentId);
  if (mine.length === 0) {
    return { efforts: [], best: null, latest: null, latestRank: null, latestVsBest: null, note: 'No efforts on this one yet.' };
  }

  const byTime = [...mine].sort((a, b) => a.seconds - b.seconds);
  const byDate = [...mine].sort((a, b) => (a.date < b.date ? 1 : -1));
  const best = byTime[0]!;
  const latest = byDate[0]!;
  const rank = mine.length > 1 ? byTime.findIndex((e) => e === latest) + 1 : null;
  const vsBest = mine.length > 1 ? latest.seconds - best.seconds : null;

  return {
    efforts: byTime,
    best,
    latest,
    latestRank: rank,
    latestVsBest: vsBest,
    note: describeBoard(mine.length, rank, vsBest, latest.seconds, best.seconds),
  };
}

function describeBoard(
  count: number,
  rank: number | null,
  vsBest: number | null,
  latestSeconds: number,
  bestSeconds: number,
): string {
  if (count === 1) return `One effort, in ${formatDuration(latestSeconds)}. The second one is what makes this interesting.`;
  if (rank === 1) return `Your fastest, out of ${count}. Previous best was ${formatDuration(bestSeconds)}.`;
  if (vSmall(vsBest)) return `${formatDuration(latestSeconds)} — within a few seconds of your best out of ${count} goes.`;
  return `${rank} of ${count}, ${formatDuration(vsBest ?? 0)} off your best of ${formatDuration(bestSeconds)}.`;
}

const vSmall = (v: number | null): boolean => v != null && v > 0 && v <= 5;

/**
 * Segments ordered for the list: most recently ridden first, hidden ones out.
 *
 * Recency rather than name, because the segment somebody wants is almost
 * always the one they were just on.
 */
export function orderSegments(segments: Segment[], efforts: SegmentEffort[]): Segment[] {
  const lastSeen = new Map<UUID, ISODate>();
  for (const e of efforts) {
    const held = lastSeen.get(e.segmentId);
    if (!held || e.date > held) lastSeen.set(e.segmentId, e.date);
  }
  return segments
    .filter((s) => !s.hidden)
    .sort((a, b) => {
      const da = lastSeen.get(a.id) ?? '';
      const db = lastSeen.get(b.id) ?? '';
      if (da === db) return a.name.localeCompare(b.name);
      return da < db ? 1 : -1;
    });
}

/** Which discipline an activity type belongs to, for segment eligibility. */
export function disciplineOf(cardioType: string): 'foot' | 'wheel' | null {
  if (['run', 'walk', 'hike'].includes(cardioType)) return 'foot';
  if (cardioType === 'ride') return 'wheel';
  return null;
}

export const SEGMENTS_NOTE =
  'Segments here are yours. You carve one out of a stretch you have already covered, and every later activity that goes through it is timed automatically. There is no global leaderboard, because a leaderboard needs other people — what this ranks is your own attempts against each other.';

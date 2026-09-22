import { distanceMeters, type LatLon } from './geo';
import type { TrackPoint } from './track';
import type { UUID } from './types';

/**
 * Privacy zones: places whose routes should not show where you live.
 *
 * The threat this defends against is specific and well documented. A running
 * app that draws every route from the front door publishes the front door —
 * and does it repeatedly, from every direction, which means even a blurred or
 * offset start is recoverable by drawing enough of them. People have been
 * located this way.
 *
 * So the approach here is to *remove* points rather than to hide them:
 *
 *  - the trimmed points are gone from what is drawn and from what is shared,
 *    not merely skipped by the renderer;
 *  - the cut is made where the route crosses the radius, and the rest of the
 *    route is left exactly as it was — no offsetting, no jitter. A fake start
 *    point is worse than an honest gap, because it looks like data;
 *  - distance, time and climbing are measured from the *full* trace before
 *    trimming, so a privacy zone never costs you a kilometre.
 *
 * The last point is the one that makes people actually turn it on.
 */

export interface PrivacyZone {
  id: UUID;
  label: string;
  center: LatLon;
  /** Metres. Bigger is safer and eats more of the route. */
  radiusM: number;
}

export const ZONE_RADII = [200, 400, 800, 1600];

export const DEFAULT_RADIUS_M = 400;

/** Whether a coordinate falls inside any zone. */
export function insideAnyZone(p: LatLon, zones: PrivacyZone[]): boolean {
  return zones.some((z) => distanceMeters(p, z.center) <= z.radiusM);
}

/**
 * Cut the parts of a route that fall inside a zone.
 *
 * Returns the *segments* that survive rather than one filtered list, because
 * a route that enters and leaves a zone in the middle — a loop past home —
 * must be drawn as two separate lines. Filtering to one array would join the
 * two ends with a straight line straight through the thing being hidden,
 * which is the single most common way this feature is got wrong.
 */
export function trimToZones<T extends LatLon>(points: T[], zones: PrivacyZone[]): T[][] {
  if (zones.length === 0) return points.length ? [points] : [];

  const out: T[][] = [];
  let run: T[] = [];

  for (const p of points) {
    if (insideAnyZone(p, zones)) {
      if (run.length > 1) out.push(run);
      run = [];
    } else {
      run.push(p);
    }
  }
  if (run.length > 1) out.push(run);

  return out;
}

/** The flat version, for anything that only needs "what may be shown". */
export function visiblePoints<T extends LatLon>(points: T[], zones: PrivacyZone[]): T[] {
  return trimToZones(points, zones).flat();
}

export interface ZoneEffect {
  /** How many points were removed. */
  hidden: number;
  /** How many separate lines the route is now drawn as. */
  pieces: number;
  /** True when the whole route is inside a zone. */
  fullyHidden: boolean;
  note: string;
}

/**
 * What a zone actually does to a route, so someone can see it before trusting
 * it rather than after.
 */
export function describeEffect(points: LatLon[], zones: PrivacyZone[]): ZoneEffect {
  const pieces = trimToZones(points, zones);
  const kept = pieces.reduce((a, p) => a + p.length, 0);
  const hidden = points.length - kept;

  if (points.length === 0) {
    return { hidden: 0, pieces: 0, fullyHidden: false, note: 'Nothing to hide.' };
  }
  if (kept === 0) {
    return {
      hidden,
      pieces: 0,
      fullyHidden: true,
      note: 'This whole route is inside a privacy zone, so no map is shown at all. The distance, time and climbing are still yours and still counted.',
    };
  }
  if (hidden === 0) {
    return { hidden: 0, pieces: pieces.length, fullyHidden: false, note: 'None of this route falls in a privacy zone.' };
  }
  return {
    hidden,
    pieces: pieces.length,
    fullyHidden: false,
    note:
      pieces.length > 1
        ? `${hidden} points hidden, and the route is drawn as ${pieces.length} separate lines so nothing is joined across the zone.`
        : `${hidden} points hidden from the start and finish. Your distance, time and climbing are unchanged — they were measured before this was applied.`,
  };
}

/**
 * Whether a track's own start is protected.
 *
 * The single most useful check there is: somebody who has set up a zone
 * around the office and not the house is not protected, and has no way to
 * notice except by looking at a map of their own runs.
 */
export function startIsProtected(points: TrackPoint[], zones: PrivacyZone[]): boolean {
  const first = points[0];
  return first ? insideAnyZone(first, zones) : false;
}

export const PRIVACY_NOTE =
  'A privacy zone removes part of a route rather than hiding it. The points inside are dropped from what is drawn and from anything you share — they are not merely skipped on screen. Your distance, time and climbing are measured before the zone is applied, so turning one on never costs you a kilometre.';

export const PRIVACY_WHY =
  'Routes drawn from a front door publish the front door, and they do it from every direction over months. An offset or blurred start is recoverable from enough of them; a removed one is not.';

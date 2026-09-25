import { distanceMeters, type LatLon } from './geo';

/**
 * Planning a route before you run it.
 *
 * **What this is not: road snapping.** A proper route builder asks a routing
 * service to follow the actual streets between the points you tap, and every
 * such service either wants an API key and a billing account or is blocked
 * from this environment. So legs here are straight lines between waypoints,
 * and the screen says so plainly rather than drawing a straight line through
 * a housing estate and calling it a route.
 *
 * That sounds like a bad trade and mostly is not, for the thing people
 * actually use a planner for: "how far is it round the park and back". Tap
 * the corners, get a distance that is right to within the wiggle of the path,
 * and export it to the watch. Where it is genuinely wrong is a twisting
 * route, and `wiggleWarning` says when enough legs are long enough that the
 * estimate is probably under-reading.
 *
 * Elevation is deliberately absent rather than guessed. There is no terrain
 * source here, and a planner that invented a climb profile would be inventing
 * the one number people most want it for.
 */

export interface RoutePlan {
  waypoints: LatLon[];
  /** Straight-line total through every waypoint in order, in metres. */
  distanceM: number;
  /** True once the last point is back at the first. */
  closed: boolean;
}

export const EMPTY_PLAN: RoutePlan = { waypoints: [], distanceM: 0, closed: false };

/** How close two points must be to count as the same place, in metres. */
export const CLOSE_TOLERANCE_M = 25;

export function planDistance(points: LatLon[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distanceMeters(points[i - 1]!, points[i]!);
  return total;
}

function isClosed(points: LatLon[]): boolean {
  if (points.length < 3) return false;
  return distanceMeters(points[0]!, points[points.length - 1]!) <= CLOSE_TOLERANCE_M;
}

export function planFrom(waypoints: LatLon[]): RoutePlan {
  return { waypoints, distanceM: Math.round(planDistance(waypoints)), closed: isClosed(waypoints) };
}

export function addWaypoint(plan: RoutePlan, point: LatLon): RoutePlan {
  // A coordinate that is not a number poisons every leg through it: the
  // distance reads "NaN", the line stops drawing, and nothing says why. One
  // dropped tap is the better failure, and this is the last place that can
  // still tell the difference.
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return plan;

  // A double-tap on the same spot adds a zero-length leg and an undo step
  // that appears to do nothing. Dropped.
  const last = plan.waypoints[plan.waypoints.length - 1];
  if (last && distanceMeters(last, point) < 1) return plan;
  return planFrom([...plan.waypoints, point]);
}

export function removeLast(plan: RoutePlan): RoutePlan {
  return planFrom(plan.waypoints.slice(0, -1));
}

export function clearPlan(): RoutePlan {
  return EMPTY_PLAN;
}

/**
 * Close the loop by returning to the start.
 *
 * Refuses when it is already closed, rather than stacking a second copy of
 * the first point on the end — which reads as a no-op and then breaks the
 * out-and-back below.
 */
export function closeLoop(plan: RoutePlan): RoutePlan {
  if (plan.waypoints.length < 3 || plan.closed) return plan;
  return planFrom([...plan.waypoints, plan.waypoints[0]!]);
}

/**
 * Turn the plan into an out-and-back by retracing it.
 *
 * The turnaround point is not repeated: a route that goes A→B→C comes back
 * C→B→A, not C→C→B→A, which would put a zero-length leg at the far end and
 * an extra waypoint on the watch.
 */
export function outAndBack(plan: RoutePlan): RoutePlan {
  if (plan.waypoints.length < 2) return plan;
  const back = [...plan.waypoints].reverse().slice(1);
  return planFrom([...plan.waypoints, ...back]);
}

// ------------------------------------------------------------ honesty ------

export interface PlanQuality {
  /** Legs long enough that a straight line probably is not the real path. */
  longLegs: number;
  longestLegM: number;
  /** True when the distance is likely to under-read by enough to matter. */
  wiggleWarning: boolean;
}

/**
 * A leg beyond this is long enough that real roads between its ends probably
 * are not straight, so the straight-line distance under-reads.
 */
export const LONG_LEG_M = 400;

export function planQuality(plan: RoutePlan): PlanQuality {
  const legs: number[] = [];
  for (let i = 1; i < plan.waypoints.length; i += 1) {
    legs.push(distanceMeters(plan.waypoints[i - 1]!, plan.waypoints[i]!));
  }
  const longLegs = legs.filter((l) => l > LONG_LEG_M).length;
  return {
    longLegs,
    longestLegM: legs.length ? Math.round(Math.max(...legs)) : 0,
    // One long leg on an otherwise detailed route is usually a straight road.
    // Several means the route was sketched rather than traced.
    wiggleWarning: longLegs >= 2,
  };
}

// ------------------------------------------------------------- timing ------

/**
 * How long the route will take at a given pace.
 *
 * Takes seconds per kilometre because that is what the rest of the app deals
 * in, and returns null for a nonsense pace rather than Infinity — an
 * Infinity here renders as "Infinity:NaN" on the screen.
 */
export function estimateSeconds(distanceM: number, secondsPerKm: number): number | null {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return null;
  if (!Number.isFinite(distanceM) || distanceM <= 0) return 0;
  return Math.round((distanceM / 1000) * secondsPerKm);
}

// -------------------------------------------------------------- export -----

export interface SavedRoute {
  id: string;
  name: string;
  waypoints: LatLon[];
  distanceM: number;
  closed: boolean;
  createdAt: string;
}

/**
 * GPX for a planned route.
 *
 * Written as a `<rte>` rather than a `<trk>`, which is the distinction the
 * format actually makes: a track is somewhere you went, a route is somewhere
 * you intend to go. Watches import them differently, and handing a watch a
 * track it thinks is a completed activity is the wrong outcome.
 */
export function planToGpx(route: SavedRoute): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const points = route.waypoints
    .map((p) => `      <rtept lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}" />`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ForgeFit" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${esc(route.name)}</name>
    <time>${route.createdAt}</time>
  </metadata>
  <rte>
    <name>${esc(route.name)}</name>
${points}
  </rte>
</gpx>
`;
}

export const ROUTE_PLAN_NOTE =
  'Legs are straight lines between the points you tap, not roads. Every road-snapping service wants an API key and a billing account, so rather than pretend, this measures exactly what it draws — tap the corners and the distance is right to within the wiggle of the path.';

export const ROUTE_PLAN_WIGGLE =
  'Several long legs here, so the real distance on the ground is probably further than this. Tap a few more points along the way to tighten it up.';

// --------------------------------------------------------------- pace ------

export interface PaceSample {
  distanceM: number;
  /** Moving time where it exists, elapsed otherwise. */
  seconds: number;
}

/** A sample shorter than this is too noisy to say anything about pace. */
export const MIN_PACE_SAMPLE_M = 800;

/**
 * A pace to estimate with, taken from what the athlete has actually run.
 *
 * The median rather than the mean, because one walk to the shops logged as a
 * run drags a mean by a minute a kilometre and the estimate stops being
 * recognisable. Null when there is nothing to go on — the screen then asks
 * rather than inventing a pace and presenting it as the athlete's own.
 */
export function typicalPaceSecPerKm(samples: PaceSample[]): number | null {
  const paces = samples
    .filter((s) => s.distanceM >= MIN_PACE_SAMPLE_M && s.seconds > 0)
    .map((s) => (s.seconds / s.distanceM) * 1000)
    .sort((a, b) => a - b);
  if (paces.length === 0) return null;
  const mid = Math.floor(paces.length / 2);
  const median = paces.length % 2 === 1 ? paces[mid]! : (paces[mid - 1]! + paces[mid]!) / 2;
  return Math.round(median);
}

/** Metres in a mile, for turning a displayed pace into the one used here. */
export const METRES_PER_MILE = 1609.344;

/**
 * Pace conversions, because the estimate works in seconds per kilometre and
 * half the people reading it think in seconds per mile.
 *
 * Kept as a pair rather than one function with a flag so a call site cannot
 * quietly convert the wrong way: `4:00 /mi` read as `4:00 /km` turns a
 * ten-mile long run into an hour, which looks plausible and is not.
 */
export function paceToSecPerKm(secPerUnit: number, units: 'imperial' | 'metric'): number {
  return units === 'imperial' ? (secPerUnit * 1000) / METRES_PER_MILE : secPerUnit;
}

export function paceFromSecPerKm(secPerKm: number, units: 'imperial' | 'metric'): number {
  return units === 'imperial' ? (secPerKm * METRES_PER_MILE) / 1000 : secPerKm;
}

/**
 * Round-number paces to offer when there is no history to take one from.
 *
 * In the unit the reader thinks in, not converted from the other one: an
 * imperial list built by converting 5:00/km gives 8:03, 8:51, 9:39, which
 * reads as somebody else's numbers translated rather than a list of paces.
 */
export const FALLBACK_PACES: Record<'imperial' | 'metric', number[]> = {
  metric: [300, 330, 360, 420, 480],
  imperial: [420, 480, 540, 600, 720],
};

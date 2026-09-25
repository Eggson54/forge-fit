/**
 * Geographic primitives for the gym map: distance, bearing, and the Web
 * Mercator projection used to lay real coordinates onto an SVG canvas.
 *
 * Kept free of any React Native import so the projection can be tested on its
 * own — a map that plots the wrong pin in the wrong place is a bug you want a
 * test to catch, not a screenshot.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in metres. */
export function distanceMeters(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b, in degrees clockwise from north (0–360). */
export function bearingDegrees(a: LatLon, b: LatLon): number {
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);
  const dLon = rad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** N, NE, E… for a bearing. Eight points is as precise as a phone deserves. */
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function compassPoint(bearing: number): string {
  return COMPASS[Math.round(((bearing % 360) + 360) % 360 / 45) % 8];
}

/**
 * Web Mercator, normalised to the unit square. Latitude is clamped to the
 * projection's usable band: tan() runs away at the poles and would put a pin at
 * infinity rather than off-screen.
 */
export const MERCATOR_MAX_LAT = 85.05112878;

export function projectUnit({ lat, lon }: LatLon): Point {
  const clamped = Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, lat));
  const x = (lon + 180) / 360;
  const s = Math.sin(rad(clamped));
  const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  // At the clamp latitude the arithmetic lands a few parts in 1e12 outside the
  // unit square. Harmless on screen, but a guarantee that is only nearly true
  // is not a guarantee, and callers do clamp against these bounds.
  return { x, y: Math.max(0, Math.min(1, y)) };
}

export function unprojectUnit({ x, y }: Point): LatLon {
  const lon = x * 360 - 180;
  const n = Math.PI * (1 - 2 * y);
  const lat = deg(Math.atan(Math.sinh(n)));
  return { lat, lon };
}

/** Smallest box containing every point, or null for an empty list. */
export function boundsOf(points: LatLon[]): Bounds | null {
  if (points.length === 0) return null;
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;
  for (const p of points) {
    north = Math.max(north, p.lat);
    south = Math.min(south, p.lat);
    east = Math.max(east, p.lon);
    west = Math.min(west, p.lon);
  }
  return { north, south, east, west };
}

/** Grows a box by a fraction of its own size, so pins are not flush to the edge. */
export function padBounds(b: Bounds, fraction: number): Bounds {
  // A single point has zero extent, and scaling zero by anything stays zero —
  // which would divide by zero in the viewport fit. Give it a floor.
  const latSpan = Math.max(b.north - b.south, 0.0025);
  const lonSpan = Math.max(b.east - b.west, 0.0025);
  const latPad = latSpan * fraction;
  const lonPad = lonSpan * fraction;
  const midLat = (b.north + b.south) / 2;
  const midLon = (b.east + b.west) / 2;
  return {
    north: Math.min(MERCATOR_MAX_LAT, midLat + latSpan / 2 + latPad),
    south: Math.max(-MERCATOR_MAX_LAT, midLat - latSpan / 2 - latPad),
    east: midLon + lonSpan / 2 + lonPad,
    west: midLon - lonSpan / 2 - lonPad,
  };
}

export interface Viewport {
  width: number;
  height: number;
  project: (p: LatLon) => Point;
  /** Metres per horizontal pixel at the viewport's centre latitude. */
  metersPerPixel: number;
}

/**
 * Fits a box into a width×height canvas, preserving aspect ratio so the map is
 * never stretched. Whichever axis is looser gets centred within the canvas.
 */
export function fitViewport(bounds: Bounds, width: number, height: number): Viewport {
  const nw = projectUnit({ lat: bounds.north, lon: bounds.west });
  const se = projectUnit({ lat: bounds.south, lon: bounds.east });
  const unitW = Math.max(1e-12, se.x - nw.x);
  const unitH = Math.max(1e-12, se.y - nw.y);

  const scale = Math.min(width / unitW, height / unitH);
  const offsetX = (width - unitW * scale) / 2;
  const offsetY = (height - unitH * scale) / 2;

  const project = (p: LatLon): Point => {
    const u = projectUnit(p);
    return { x: (u.x - nw.x) * scale + offsetX, y: (u.y - nw.y) * scale + offsetY };
  };

  // World circumference at the equator, shrunk by the projection's latitude
  // stretch, divided by how many pixels one unit spans.
  const midLat = (bounds.north + bounds.south) / 2;
  const metersPerPixel = (40_075_016.686 * Math.cos(rad(midLat))) / scale;

  return { width, height, project, metersPerPixel };
}

/** Human distance: metres under a kilometre, then one decimal. */
/**
 * Climbing, which is not distance and must not be formatted as it.
 *
 * `formatDistance` promotes anything over a kilometre, so two thousand
 * metres of ascent renders as "2.0 km" — a number nobody quotes a climb in
 * and which reads as a horizontal measurement. Climb stays in metres, or in
 * feet for an athlete whose other distances are in miles.
 */
export function formatElevation(meters: number, units: 'imperial' | 'metric'): string {
  const value = units === 'imperial' ? meters * 3.280839895 : meters;
  return `${Math.round(value).toLocaleString()} ${units === 'imperial' ? 'ft' : 'm'}`;
}

export function formatDistance(meters: number, units: 'imperial' | 'metric'): string {
  if (units === 'imperial') {
    const feet = meters * 3.280839895;
    if (feet < 1000) return `${Math.round(feet / 10) * 10} ft`;
    const miles = meters / 1609.344;
    return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
  }
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/**
 * A lat/lon offset that is `meters` away in a given compass direction. Used to
 * draw the distance rings, where a circle in metres is an ellipse in Mercator.
 */
export function offsetBy(origin: LatLon, meters: number, bearing: number): LatLon {
  const d = meters / EARTH_RADIUS_M;
  const b = rad(bearing);
  const lat1 = rad(origin.lat);
  const lon1 = rad(origin.lon);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lon2 =
    lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: deg(lat2), lon: ((deg(lon2) + 540) % 360) - 180 };
}

/**
 * Distance from a point to a line segment, in metres.
 *
 * Flat-earth: over the tens or hundreds of metres this is used for, the error
 * is far below the GPS noise it is being compared against, and a great-circle
 * cross-track costs several trigonometric calls per candidate point.
 */
export function distanceToSegmentMeters(p: LatLon, a: LatLon, b: LatLon): number {
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
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * 111_320;
}

/**
 * Distance from a point to the nearest part of a polyline, in metres.
 *
 * To the nearest *line*, not the nearest vertex. That distinction is the whole
 * reason this exists: stored routes are thinned, so a straight two-kilometre
 * stretch may be two points. Measuring to vertices puts the middle of that
 * stretch a kilometre from the route it is sitting exactly on top of.
 */
export function distanceToPathMeters(p: LatLon, path: LatLon[], giveUpAt = Infinity): number {
  if (path.length === 0) return Infinity;
  if (path.length === 1) return distanceMeters(p, path[0]!);

  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const d = distanceToSegmentMeters(p, path[i - 1]!, path[i]!);
    if (d < best) best = d;
    if (best <= giveUpAt) break;
  }
  return best;
}

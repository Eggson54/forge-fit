import { project, unproject, type TilePoint } from './tiles';
import { distanceMeters, type LatLon } from './geo';

/**
 * Your own heatmap: everywhere you have been, weighted by how often.
 *
 * The version of this that needs a global service needs it because it is
 * aggregating millions of people. Aggregating one person is a different and
 * much smaller problem, and the answer is genuinely useful: it shows the
 * three streets you always take, the park loop you claim to vary, and the
 * whole half of the city you have never once run in.
 *
 * Built by binning into fixed cells at a chosen zoom rather than by drawing
 * every line with transparency. Overlapping translucent strokes look like a
 * heatmap and are not one — a single run that doubles back reads as hot as a
 * route taken fifty times, because what accumulates is overdraw rather than
 * visits.
 */

export interface HeatCell {
  /** Integer cell coordinates at `zoom`. */
  x: number;
  y: number;
  /** Distinct activities that touched this cell. */
  visits: number;
  /** 0–1 against the busiest cell. */
  intensity: number;
}

export interface HeatmapOptions {
  /**
   * The zoom the grid is binned at. Higher is finer: at 16 a cell is a few
   * metres, at 12 it is a neighbourhood.
   */
  zoom?: number;
  /** Subdivisions per tile. 256 makes a cell one pixel at `zoom`. */
  resolution?: number;
}

export interface Heatmap {
  cells: HeatCell[];
  zoom: number;
  resolution: number;
  maxVisits: number;
  activities: number;
}

/**
 * Bin a set of routes into a visit grid.
 *
 * Counted **once per activity per cell**. Without that, standing at a
 * crossing for two minutes lights a cell brighter than a road run every week,
 * because it is sample count being measured rather than visits.
 */
export function buildHeatmap(routes: LatLon[][], opts: HeatmapOptions = {}): Heatmap {
  const zoom = opts.zoom ?? 15;
  const resolution = opts.resolution ?? 64;
  const counts = new Map<string, number>();
  let activities = 0;

  // Roughly how wide a cell is on the ground, used to decide how finely to
  // walk each leg. Taken at the first route's latitude: Mercator cells shrink
  // towards the poles, and using the equator's width would under-sample
  // everywhere that is not the equator.
  const referenceLat = routes.find((r) => r.length)?.[0]?.lat ?? 0;
  const cellM = (40_075_016.686 * Math.cos((referenceLat * Math.PI) / 180)) / (Math.pow(2, zoom) * resolution);
  const stepM = Math.max(1, cellM / 2);

  for (const route of routes) {
    if (route.length < 2) continue;
    activities += 1;
    const seen = new Set<string>();

    const mark = (p: LatLon) => {
      const t = project(p, zoom);
      seen.add(`${Math.floor(t.x * resolution)},${Math.floor(t.y * resolution)}`);
    };

    mark(route[0]!);
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1]!;
      const b = route[i]!;
      // Walk the leg rather than marking only its ends. Stored traces are
      // thinned, so a straight road can be two points a kilometre apart —
      // binning the vertices alone turns a heatmap into a scatter of dots at
      // the corners, which is exactly what it must not be.
      const steps = Math.min(400, Math.ceil(distanceMeters(a, b) / stepM));
      for (let k = 1; k <= steps; k++) {
        const f = k / steps;
        mark({ lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f });
      }
    }

    for (const key of seen) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const maxVisits = counts.size ? Math.max(...counts.values()) : 0;

  const cells: HeatCell[] = [...counts.entries()].map(([key, visits]) => {
    const [x, y] = key.split(',').map(Number) as [number, number];
    return { x, y, visits, intensity: intensityOf(visits, maxVisits) };
  });

  return { cells, zoom, resolution, maxVisits, activities };
}

/**
 * How hot a cell reads.
 *
 * Logarithmic, because visit counts are wildly skewed: the road outside the
 * house is on every run and everything else is on one or two. Scaled
 * linearly, the whole map is the faintest colour with one bright line through
 * it, which hides exactly the pattern the map is for.
 */
function intensityOf(visits: number, max: number): number {
  if (max <= 1) return 1;
  return Math.log(visits + 1) / Math.log(max + 1);
}

/** A cell's north-west corner, for drawing it. */
export function cellCorner(cell: { x: number; y: number }, heatmap: Heatmap): LatLon {
  return unproject({ x: cell.x / heatmap.resolution, y: cell.y / heatmap.resolution } as TilePoint, heatmap.zoom);
}

/** The bounds containing every cell, for framing the map. */
export function heatmapBounds(heatmap: Heatmap): { north: number; south: number; east: number; west: number } | null {
  if (heatmap.cells.length === 0) return null;
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;
  for (const cell of heatmap.cells) {
    const nw = cellCorner(cell, heatmap);
    const se = cellCorner({ x: cell.x + 1, y: cell.y + 1 }, heatmap);
    north = Math.max(north, nw.lat);
    south = Math.min(south, se.lat);
    west = Math.min(west, nw.lon);
    east = Math.max(east, se.lon);
  }
  return { north, south, east, west };
}

export interface HeatmapReading {
  cells: number;
  activities: number;
  /** How concentrated the routes are: 0 is everywhere, 1 is one street. */
  concentration: number;
  headline: string;
  detail: string;
}

/**
 * What the map says, in words.
 *
 * Concentration is the share of cells visited more than once. Somebody who
 * runs one loop has almost all of them repeated; somebody exploring has
 * almost none.
 */
export function readHeatmap(heatmap: Heatmap): HeatmapReading | null {
  if (heatmap.activities < 3) return null;

  const repeated = heatmap.cells.filter((c) => c.visits > 1).length;
  const concentration = heatmap.cells.length ? repeated / heatmap.cells.length : 0;

  const headline =
    concentration > 0.6
      ? 'You run one route'
      : concentration > 0.3
        ? 'A few regular routes, with variations'
        : 'You rarely run the same ground twice';

  const detail =
    concentration > 0.6
      ? `${Math.round(concentration * 100)}% of the ground you have covered, you have covered more than once. Nothing wrong with that — the surface, the camber and the turns are the same every time, which is worth knowing if something keeps hurting.`
      : concentration > 0.3
        ? `${Math.round(concentration * 100)}% of your ground is repeated. A mix of regular routes and new ones.`
        : `Only ${Math.round(concentration * 100)}% of your ground is repeated, across ${heatmap.activities} activities. Hard to compare efforts when no two are on the same course — that is what segments are for.`;

  return { cells: heatmap.cells.length, activities: heatmap.activities, concentration, headline, detail };
}

export const HEATMAP_NOTE =
  'Counted once per activity per patch of ground, not once per GPS fix. Counting fixes would make standing at a crossing look like a route you take every week.';

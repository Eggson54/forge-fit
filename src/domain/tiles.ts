import type { Bounds, LatLon } from './geo';

/**
 * Slippy-map tile arithmetic: which square images cover a view, and where
 * each one sits on screen.
 *
 * This is the whole of a raster basemap. Everything else — panning, zooming,
 * drawing a route on top — is expressed in terms of the two functions at the
 * top, so a bug here is a map that is subtly in the wrong place everywhere,
 * which is exactly the kind of thing that looks fine in a screenshot and is
 * wrong by a street. Hence the unusually heavy tests.
 *
 * On tile sources: Google's tiles require an API key and a billing account,
 * and their terms do not allow pulling the raster endpoint directly. The
 * default here is OpenStreetMap, which needs neither, and the source is
 * pluggable so a key-bearing provider can be dropped in without touching
 * anything that draws.
 */

export const TILE_SIZE = 256;

export interface TileSource {
  id: string;
  label: string;
  /** Where the tiles come from. `{z}`, `{x}`, `{y}` are substituted. */
  template: string;
  /** Shown on the map, because every one of these requires it. */
  attribution: string;
  maxZoom: number;
  /** True when the source needs a key the app does not ship with. */
  needsKey?: boolean;
  /** Dark tiles want a lighter route colour over them, and vice versa. */
  dark: boolean;
}

/**
 * The sources the app knows about.
 *
 * Only the first works out of the box. The rest are listed so the choice is
 * visible rather than buried in a config file — and so nobody wires up a
 * provider without noticing it wants a credit card.
 */
export const TILE_SOURCES: TileSource[] = [
  {
    id: 'osm',
    label: 'OpenStreetMap',
    template: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
    dark: false,
  },
  {
    id: 'carto-dark',
    label: 'Carto Dark',
    template: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors © CARTO',
    maxZoom: 19,
    dark: true,
  },
  {
    id: 'opentopo',
    label: 'OpenTopoMap',
    template: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors, SRTM · © OpenTopoMap (CC-BY-SA)',
    maxZoom: 17,
    dark: false,
  },
];

export const DEFAULT_SOURCE = TILE_SOURCES[0]!;

export function sourceById(id: string | undefined): TileSource {
  return TILE_SOURCES.find((s) => s.id === id) ?? DEFAULT_SOURCE;
}

export function tileUrl(source: TileSource, x: number, y: number, z: number): string {
  return source.template
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

// -------------------------------------------------------- projection ----

/**
 * The maximum latitude Web Mercator can express.
 *
 * The projection stretches towards the poles without bound, so every slippy
 * map cuts it off at the latitude that makes the world square — about 85.05°.
 * Clamping here rather than at each call site is what stops a stray
 * coordinate producing an infinite tile index.
 */
export const MAX_LATITUDE = 85.0511287798066;

/** Fractional tile coordinates: the integer part is the tile, the rest is within it. */
export interface TilePoint {
  x: number;
  y: number;
}

export function project(p: LatLon, zoom: number): TilePoint {
  const scale = Math.pow(2, zoom);
  const lat = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, p.lat));
  const rad = (lat * Math.PI) / 180;
  return {
    x: ((p.lon + 180) / 360) * scale,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * scale,
  };
}

export function unproject(t: TilePoint, zoom: number): LatLon {
  const scale = Math.pow(2, zoom);
  const n = Math.PI - 2 * Math.PI * (t.y / scale);
  return {
    lon: (t.x / scale) * 360 - 180,
    lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))),
  };
}

/**
 * Metres per pixel at a latitude and zoom.
 *
 * Mercator's scale factor is 1/cos(latitude), which is why a kilometre in
 * Reykjavík draws twice as long as a kilometre in Nairobi. Any scale bar that
 * ignores this is wrong everywhere except the equator.
 */
export function metersPerPixel(lat: number, zoom: number): number {
  const EQUATOR_M = 40_075_016.686;
  return (EQUATOR_M * Math.cos((lat * Math.PI) / 180)) / (TILE_SIZE * Math.pow(2, zoom));
}

// ------------------------------------------------------------ viewport ----

export interface MapView {
  center: LatLon;
  zoom: number;
  width: number;
  height: number;
}

/** Where a coordinate lands in the view, in pixels from its top-left corner. */
export function toScreen(p: LatLon, view: MapView): { x: number; y: number } {
  const c = project(view.center, view.zoom);
  const t = project(p, view.zoom);
  return {
    x: (t.x - c.x) * TILE_SIZE + view.width / 2,
    y: (t.y - c.y) * TILE_SIZE + view.height / 2,
  };
}

/** The inverse: what a tap at a screen pixel is pointing at. */
export function fromScreen(px: { x: number; y: number }, view: MapView): LatLon {
  const c = project(view.center, view.zoom);
  return unproject(
    {
      x: c.x + (px.x - view.width / 2) / TILE_SIZE,
      y: c.y + (px.y - view.height / 2) / TILE_SIZE,
    },
    view.zoom,
  );
}

export interface PlacedTile {
  x: number;
  y: number;
  z: number;
  /** Top-left position in the view, in pixels. */
  left: number;
  top: number;
  key: string;
}

/**
 * Every tile needed to cover the view, with where to put it.
 *
 * Wraps in x, because the world repeats east-west and panning past the
 * antimeridian should keep drawing map rather than blank space. Does *not*
 * wrap in y: there is nothing above the north pole, and a tile index outside
 * the range would 404 forever.
 */
export function tilesFor(view: MapView, overscan = 1): PlacedTile[] {
  const z = Math.round(view.zoom);
  const scale = Math.pow(2, z);
  const c = project(view.center, z);

  // Where the view's top-left corner sits, in fractional tiles.
  const originX = c.x - view.width / 2 / TILE_SIZE;
  const originY = c.y - view.height / 2 / TILE_SIZE;

  const firstX = Math.floor(originX) - overscan;
  const lastX = Math.floor(originX + view.width / TILE_SIZE) + overscan;
  const firstY = Math.max(0, Math.floor(originY) - overscan);
  const lastY = Math.min(scale - 1, Math.floor(originY + view.height / TILE_SIZE) + overscan);

  const out: PlacedTile[] = [];
  for (let ty = firstY; ty <= lastY; ty++) {
    for (let tx = firstX; tx <= lastX; tx++) {
      const wrapped = ((tx % scale) + scale) % scale;
      out.push({
        x: wrapped,
        y: ty,
        z,
        left: Math.round((tx - originX) * TILE_SIZE),
        top: Math.round((ty - originY) * TILE_SIZE),
        // The key uses the *unwrapped* x, so two copies of the same tile
        // either side of the antimeridian are distinct elements rather than
        // one that React reconciles into a single, flickering image.
        key: `${z}/${tx}/${ty}`,
      });
    }
  }
  return out;
}

/**
 * The view that frames a set of coordinates.
 *
 * Zoom is chosen as the largest whole level that still fits the bounds with
 * the requested padding. Fractional zoom would fit more tightly and would
 * also mean resampling every tile, which on a phone looks like a smeared map.
 */
export function fitBounds(
  bounds: Bounds,
  width: number,
  height: number,
  opts: { padding?: number; maxZoom?: number } = {},
): MapView {
  const padding = opts.padding ?? 24;
  const maxZoom = opts.maxZoom ?? 17;
  const center: LatLon = {
    lat: (bounds.north + bounds.south) / 2,
    lon: (bounds.east + bounds.west) / 2,
  };

  const usableW = Math.max(1, width - padding * 2);
  const usableH = Math.max(1, height - padding * 2);

  let zoom = 0;
  for (let z = maxZoom; z >= 0; z--) {
    const nw = project({ lat: bounds.north, lon: bounds.west }, z);
    const se = project({ lat: bounds.south, lon: bounds.east }, z);
    const w = Math.abs(se.x - nw.x) * TILE_SIZE;
    const h = Math.abs(se.y - nw.y) * TILE_SIZE;
    if (w <= usableW && h <= usableH) {
      zoom = z;
      break;
    }
  }

  return { center, zoom, width, height };
}

/** Move the view by a screen-pixel drag. */
export function panBy(view: MapView, dx: number, dy: number): MapView {
  const c = project(view.center, view.zoom);
  return {
    ...view,
    center: unproject({ x: c.x - dx / TILE_SIZE, y: c.y - dy / TILE_SIZE }, view.zoom),
  };
}

/**
 * Zoom, keeping whatever is under a screen point fixed.
 *
 * Zooming about the centre is the easy version and feels wrong the moment
 * anybody pinches on something specific: the thing they were looking at
 * slides away under their fingers.
 */
export function zoomAbout(view: MapView, delta: number, anchor: { x: number; y: number }, maxZoom = 18): MapView {
  const zoom = Math.max(1, Math.min(maxZoom, view.zoom + delta));
  if (zoom === view.zoom) return view;
  const target = fromScreen(anchor, view);
  const zoomed = { ...view, zoom };
  const after = toScreen(target, zoomed);
  return panBy(zoomed, anchor.x - after.x, anchor.y - after.y);
}

/** A scale bar's length and label: the roundest distance under `maxPx`. */
export function scaleBar(
  view: MapView,
  units: 'imperial' | 'metric',
  maxPx = 90,
): { pixels: number; label: string } {
  const mpp = metersPerPixel(view.center.lat, view.zoom);
  const maxDistance = mpp * maxPx;

  const metric = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000];
  const imperialFt = [10, 20, 50, 100, 200, 500, 1000, 2000];
  const imperialMi = [0.5, 1, 2, 5, 10, 20, 50];

  if (units === 'imperial') {
    const maxFt = maxDistance * 3.280839895;
    // Feet only below a mile. Checking feet first and taking any that fit
    // meant a zoomed-out map offered "2000 ft" when thirty miles would have
    // fitted — technically true, and useless as a scale.
    if (maxFt < 5280) {
      const ft = [...imperialFt].reverse().find((v) => v <= maxFt) ?? imperialFt[0]!;
      return { pixels: Math.round(ft / 3.280839895 / mpp), label: `${ft} ft` };
    }
    const maxMi = maxDistance / 1609.344;
    const mi = [...imperialMi].reverse().find((v) => v <= maxMi) ?? imperialMi[0]!;
    return { pixels: Math.round((mi * 1609.344) / mpp), label: `${mi} mi` };
  }

  const m = [...metric].reverse().find((v) => v <= maxDistance) ?? metric[0]!;
  return { pixels: Math.round(m / mpp), label: m >= 1000 ? `${m / 1000} km` : `${m} m` };
}

export const TILES_NOTE =
  'Map tiles come from OpenStreetMap, which needs no account and no key. Google and Mapbox both want an API key and a billing account, and Google’s terms do not permit pulling their tiles directly — if you have a key, the source is a one-line change and everything drawn on top stays the same.';

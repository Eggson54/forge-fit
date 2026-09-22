import {
  DEFAULT_SOURCE,
  MAX_LATITUDE,
  TILE_SIZE,
  TILE_SOURCES,
  fitBounds,
  fromScreen,
  metersPerPixel,
  panBy,
  project,
  scaleBar,
  sourceById,
  tileUrl,
  tilesFor,
  toScreen,
  unproject,
  zoomAbout,
  type MapView,
} from '../domain/tiles';

/**
 * The reference values below are the published slippy-map coordinates for
 * well-known places, not numbers produced by running this code. A projection
 * test that checks the implementation against itself catches nothing.
 */
const LONDON = { lat: 51.5007, lon: -0.1246 };   // Big Ben
const NULL_ISLAND = { lat: 0, lon: 0 };

describe('project', () => {
  it('puts null island at the exact middle of the world', () => {
    const t = project(NULL_ISLAND, 1);
    expect(t.x).toBeCloseTo(1, 10);
    expect(t.y).toBeCloseTo(1, 10);
  });

  it('puts the north-west corner of the world at 0,0', () => {
    const t = project({ lat: MAX_LATITUDE, lon: -180 }, 5);
    expect(t.x).toBeCloseTo(0, 6);
    expect(t.y).toBeCloseTo(0, 6);
  });

  it('puts the prime meridian and the equator on exact tile boundaries', () => {
    // Anchors that can be checked without trusting this code: longitude 0 is
    // exactly halfway across the world, as is latitude 0, so both land on the
    // boundary at 2^(z-1) for every zoom.
    for (const z of [1, 4, 10, 16]) {
      expect(project({ lat: 51.5, lon: 0 }, z).x).toBeCloseTo(2 ** (z - 1), 9);
      expect(project({ lat: 0, lon: -0.12 }, z).y).toBeCloseTo(2 ** (z - 1), 9);
    }
  });

  it('puts New York in the tile a world map says it is in', () => {
    // At zoom 2 the world is a 4x4 grid: column 1 spans -90° to 0° and row 1
    // spans 66.5°N to 0°. New York (40.7°N, 74°W) is in both.
    const t = project({ lat: 40.7128, lon: -74.006 }, 2);
    expect(Math.floor(t.x)).toBe(1);
    expect(Math.floor(t.y)).toBe(1);
  });

  it('puts Sydney in the eastern, southern quadrant', () => {
    const t = project({ lat: -33.8688, lon: 151.2093 }, 2);
    expect(Math.floor(t.x)).toBe(3);
    expect(Math.floor(t.y)).toBe(2);
  });

  it('doubles the tile index for each zoom level', () => {
    const a = project(LONDON, 10);
    const b = project(LONDON, 11);
    expect(b.x).toBeCloseTo(a.x * 2, 6);
    expect(b.y).toBeCloseTo(a.y * 2, 6);
  });

  it('clamps beyond the latitude Mercator can express', () => {
    // Without the clamp, tan() runs away and the tile index is infinite.
    const pole = project({ lat: 89.9, lon: 0 }, 4);
    expect(Number.isFinite(pole.y)).toBe(true);
    expect(pole.y).toBeCloseTo(project({ lat: MAX_LATITUDE, lon: 0 }, 4).y, 6);
  });

  it('round-trips through unproject', () => {
    for (const p of [LONDON, NULL_ISLAND, { lat: -33.86, lon: 151.21 }, { lat: 64.13, lon: -21.9 }]) {
      for (const z of [3, 9, 16]) {
        const back = unproject(project(p, z), z);
        expect(back.lat).toBeCloseTo(p.lat, 9);
        expect(back.lon).toBeCloseTo(p.lon, 9);
      }
    }
  });
});

describe('metersPerPixel', () => {
  it('is about 2.4 m at the equator at zoom 16', () => {
    // 40,075,016 / (256 * 65536) = 2.3887
    expect(metersPerPixel(0, 16)).toBeCloseTo(2.3887, 3);
  });

  it('shrinks with latitude, because Mercator stretches', () => {
    expect(metersPerPixel(60, 16)).toBeCloseTo(metersPerPixel(0, 16) / 2, 3);
  });

  it('halves with each zoom level', () => {
    expect(metersPerPixel(51.5, 15)).toBeCloseTo(metersPerPixel(51.5, 14) / 2, 6);
  });
});

describe('toScreen and fromScreen', () => {
  const view: MapView = { center: LONDON, zoom: 14, width: 360, height: 300 };

  it('puts the centre in the middle of the view', () => {
    const p = toScreen(LONDON, view);
    expect(p.x).toBeCloseTo(180, 6);
    expect(p.y).toBeCloseTo(150, 6);
  });

  it('puts east to the right and north above', () => {
    const east = toScreen({ lat: LONDON.lat, lon: LONDON.lon + 0.01 }, view);
    const north = toScreen({ lat: LONDON.lat + 0.01, lon: LONDON.lon }, view);
    expect(east.x).toBeGreaterThan(180);
    expect(north.y).toBeLessThan(150);
  });

  it('round-trips a screen point', () => {
    for (const px of [{ x: 0, y: 0 }, { x: 360, y: 300 }, { x: 137, y: 42 }]) {
      const back = toScreen(fromScreen(px, view), view);
      expect(back.x).toBeCloseTo(px.x, 6);
      expect(back.y).toBeCloseTo(px.y, 6);
    }
  });
});

describe('tilesFor', () => {
  const view: MapView = { center: LONDON, zoom: 14, width: 512, height: 512 };

  it('covers the view', () => {
    const tiles = tilesFor(view, 0);
    // A 512x512 view is 2x2 tiles, plus whatever the fractional offset needs.
    expect(tiles.length).toBeGreaterThanOrEqual(4);
    expect(tiles.length).toBeLessThanOrEqual(12);
    for (const t of tiles) expect(t.z).toBe(14);
  });

  it('places tiles on a lattice one tile apart', () => {
    const tiles = tilesFor(view, 0);
    const lefts = [...new Set(tiles.map((t) => t.left))].sort((a, b) => a - b);
    for (let i = 1; i < lefts.length; i++) {
      expect(lefts[i]! - lefts[i - 1]!).toBe(TILE_SIZE);
    }
  });

  it('places the tile that contains the centre under the centre', () => {
    const tiles = tilesFor(view, 0);
    const t = project(LONDON, 14);
    const containing = tiles.find((x) => x.x === Math.floor(t.x) && x.y === Math.floor(t.y))!;
    expect(containing).toBeDefined();
    // The centre should land inside that tile's 256px box.
    const withinX = 256 - (t.x - Math.floor(t.x)) * 0 + containing.left;
    expect(view.width / 2).toBeGreaterThanOrEqual(containing.left);
    expect(view.width / 2).toBeLessThanOrEqual(containing.left + TILE_SIZE);
    void withinX;
  });

  it('asks for more tiles with overscan, at the same positions', () => {
    const none = tilesFor(view, 0);
    const some = tilesFor(view, 1);
    expect(some.length).toBeGreaterThan(none.length);
    for (const t of none) {
      expect(some.find((s) => s.key === t.key)!.left).toBe(t.left);
    }
  });

  it('wraps east-west rather than leaving a hole at the antimeridian', () => {
    const edge: MapView = { center: { lat: 0, lon: 179.98 }, zoom: 8, width: 512, height: 256 };
    const tiles = tilesFor(edge, 1);
    const scale = 2 ** 8;
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThan(scale);
    }
    // Both the last column of the world and the first must appear.
    expect(tiles.some((t) => t.x === scale - 1)).toBe(true);
    expect(tiles.some((t) => t.x === 0)).toBe(true);
  });

  it('gives wrapped copies distinct keys so React does not merge them', () => {
    const edge: MapView = { center: { lat: 0, lon: 180 }, zoom: 2, width: 1200, height: 256 };
    const tiles = tilesFor(edge, 0);
    expect(new Set(tiles.map((t) => t.key)).size).toBe(tiles.length);
  });

  it('never asks for a row above the north pole or below the south', () => {
    const top: MapView = { center: { lat: MAX_LATITUDE - 0.001, lon: 0 }, zoom: 3, width: 512, height: 512 };
    const scale = 2 ** 3;
    for (const t of tilesFor(top, 2)) {
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThan(scale);
    }
  });
});

describe('fitBounds', () => {
  it('centres on the middle of the bounds', () => {
    const view = fitBounds({ north: 52, south: 51, east: 0, west: -1 }, 360, 300);
    expect(view.center.lat).toBeCloseTo(51.5, 6);
    expect(view.center.lon).toBeCloseTo(-0.5, 6);
  });

  it('zooms in further for a smaller area', () => {
    const wide = fitBounds({ north: 52, south: 50, east: 1, west: -2 }, 360, 300);
    const tight = fitBounds({ north: 51.51, south: 51.5, east: -0.11, west: -0.13 }, 360, 300);
    expect(tight.zoom).toBeGreaterThan(wide.zoom);
  });

  it('actually fits, with the padding it was given', () => {
    const bounds = { north: 51.52, south: 51.49, east: -0.1, west: -0.15 };
    const view = fitBounds(bounds, 360, 300, { padding: 20 });
    const nw = toScreen({ lat: bounds.north, lon: bounds.west }, view);
    const se = toScreen({ lat: bounds.south, lon: bounds.east }, view);
    expect(nw.x).toBeGreaterThanOrEqual(20 - 1);
    expect(nw.y).toBeGreaterThanOrEqual(20 - 1);
    expect(se.x).toBeLessThanOrEqual(340 + 1);
    expect(se.y).toBeLessThanOrEqual(280 + 1);
  });

  it('honours the maximum zoom for a single point', () => {
    const view = fitBounds({ north: 51.5, south: 51.5, east: -0.12, west: -0.12 }, 360, 300, { maxZoom: 15 });
    expect(view.zoom).toBe(15);
  });

  it('returns a usable view for a zero-size canvas rather than NaN', () => {
    const view = fitBounds({ north: 52, south: 51, east: 0, west: -1 }, 0, 0);
    expect(Number.isFinite(view.zoom)).toBe(true);
    expect(Number.isFinite(view.center.lat)).toBe(true);
  });
});

describe('panBy', () => {
  const view: MapView = { center: LONDON, zoom: 14, width: 360, height: 300 };

  it('moves the map with the finger', () => {
    // Dragging right shows what was to the west: the centre moves west.
    expect(panBy(view, 100, 0).center.lon).toBeLessThan(view.center.lon);
    expect(panBy(view, 0, 100).center.lat).toBeGreaterThan(view.center.lat);
  });

  it('moves by exactly the pixels it was given', () => {
    const moved = panBy(view, 64, -32);
    const p = toScreen(view.center, moved);
    expect(p.x).toBeCloseTo(180 + 64, 4);
    expect(p.y).toBeCloseTo(150 - 32, 4);
  });

  it('is reversible', () => {
    const back = panBy(panBy(view, 137, -42), -137, 42);
    expect(back.center.lat).toBeCloseTo(view.center.lat, 9);
    expect(back.center.lon).toBeCloseTo(view.center.lon, 9);
  });
});

describe('zoomAbout', () => {
  const view: MapView = { center: LONDON, zoom: 14, width: 360, height: 300 };

  it('keeps whatever is under the anchor under the anchor', () => {
    const anchor = { x: 300, y: 60 };
    const target = fromScreen(anchor, view);
    const zoomed = zoomAbout(view, 1, anchor);
    const after = toScreen(target, zoomed);
    expect(after.x).toBeCloseTo(anchor.x, 3);
    expect(after.y).toBeCloseTo(anchor.y, 3);
  });

  it('leaves the centre alone when the anchor is the centre', () => {
    const zoomed = zoomAbout(view, 2, { x: 180, y: 150 });
    expect(zoomed.center.lat).toBeCloseTo(view.center.lat, 6);
    expect(zoomed.center.lon).toBeCloseTo(view.center.lon, 6);
    expect(zoomed.zoom).toBe(16);
  });

  it('clamps at both ends and returns the same view unchanged', () => {
    expect(zoomAbout(view, -99, { x: 0, y: 0 }).zoom).toBe(1);
    expect(zoomAbout(view, 99, { x: 0, y: 0 }, 18).zoom).toBe(18);
    const atMax = { ...view, zoom: 18 };
    expect(zoomAbout(atMax, 1, { x: 0, y: 0 }, 18)).toBe(atMax);
  });
});

describe('scaleBar', () => {
  it('picks a round number that fits', () => {
    const view: MapView = { center: LONDON, zoom: 16, width: 360, height: 300 };
    const bar = scaleBar(view, 'metric', 90);
    expect(bar.pixels).toBeLessThanOrEqual(90);
    expect(bar.label).toMatch(/^\d+(\.\d+)? (m|km)$/);
  });

  it('switches to kilometres and miles when zoomed out', () => {
    const wide: MapView = { center: LONDON, zoom: 8, width: 360, height: 300 };
    expect(scaleBar(wide, 'metric').label).toMatch(/km$/);
    expect(scaleBar(wide, 'imperial').label).toMatch(/mi$/);
  });

  it('uses feet up close', () => {
    const close: MapView = { center: LONDON, zoom: 18, width: 360, height: 300 };
    expect(scaleBar(close, 'imperial').label).toMatch(/ft$/);
  });

  it('accounts for latitude: the same zoom is a shorter bar further north', () => {
    const equator: MapView = { center: { lat: 0, lon: 0 }, zoom: 14, width: 360, height: 300 };
    const arctic: MapView = { center: { lat: 68, lon: 0 }, zoom: 14, width: 360, height: 300 };
    const a = scaleBar(equator, 'metric');
    const b = scaleBar(arctic, 'metric');
    // Same label would mean a wildly different real length; the bar must differ.
    expect(a.label === b.label ? a.pixels !== b.pixels : true).toBe(true);
  });
});

describe('sources', () => {
  it('defaults to one that needs no key', () => {
    expect(DEFAULT_SOURCE.needsKey).toBeFalsy();
  });

  it('gives every source an attribution, because every one requires it', () => {
    for (const s of TILE_SOURCES) expect(s.attribution.length).toBeGreaterThan(5);
  });

  it('falls back to the default for an unknown id', () => {
    expect(sourceById('nope').id).toBe(DEFAULT_SOURCE.id);
    expect(sourceById(undefined).id).toBe(DEFAULT_SOURCE.id);
  });

  it('substitutes every placeholder', () => {
    const url = tileUrl(DEFAULT_SOURCE, 32744, 21785, 16);
    expect(url).toBe('https://tile.openstreetmap.org/16/32744/21785.png');
    expect(url).not.toMatch(/[{}]/);
  });
});

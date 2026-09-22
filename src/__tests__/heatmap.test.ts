import { buildHeatmap, cellCorner, heatmapBounds, readHeatmap } from '../domain/heatmap';
import { offsetBy } from '../domain/geo';

const HOME = { lat: 51.5, lon: -0.12 };

function route(from: { lat: number; lon: number }, count: number, stepM = 40, bearing = 0) {
  const out = [from];
  for (let i = 1; i < count; i++) out.push(offsetBy(out[i - 1]!, stepM, bearing));
  return out;
}

describe('buildHeatmap', () => {
  it('counts a cell once per activity, not once per fix', () => {
    // The same short stretch sampled densely twice. If fixes were counted,
    // a hundred samples of standing still would read as a hundred visits.
    const dense = route(HOME, 100, 1);
    const heat = buildHeatmap([dense]);
    expect(heat.maxVisits).toBe(1);
    expect(heat.activities).toBe(1);
  });

  it('adds a visit when a second activity covers the same ground', () => {
    const r = route(HOME, 40);
    const heat = buildHeatmap([r, r, r]);
    expect(heat.maxVisits).toBe(3);
    expect(heat.activities).toBe(3);
  });

  it('keeps separate places separate', () => {
    const here = route(HOME, 30);
    const far = route(offsetBy(HOME, 20_000, 90), 30);
    const heat = buildHeatmap([here, far]);
    expect(heat.maxVisits).toBe(1);
    expect(heat.cells.length).toBeGreaterThan(10);
  });

  it('scales intensity logarithmically, so one hot line does not flatten the rest', () => {
    const main = route(HOME, 20);
    const side = route(offsetBy(HOME, 3000, 90), 20);
    // The main road on fifty runs, the side street on one.
    const heat = buildHeatmap([...Array(50).fill(main), side]);
    const sideCell = heat.cells.find((c) => c.visits === 1)!;
    expect(sideCell.intensity).toBeGreaterThan(0.1);
    expect(sideCell.intensity).toBeLessThan(0.3);
    expect(Math.max(...heat.cells.map((c) => c.intensity))).toBeCloseTo(1, 6);
  });

  it('gives a single activity full intensity rather than dividing by zero', () => {
    const heat = buildHeatmap([route(HOME, 20)]);
    expect(heat.cells.every((c) => c.intensity === 1)).toBe(true);
  });

  it('ignores routes too short to be routes', () => {
    const heat = buildHeatmap([[HOME], []]);
    expect(heat.activities).toBe(0);
    expect(heat.cells).toEqual([]);
  });

  it('is finer at a higher zoom', () => {
    const r = route(HOME, 60, 20);
    expect(buildHeatmap([r], { zoom: 16 }).cells.length).toBeGreaterThan(
      buildHeatmap([r], { zoom: 12 }).cells.length,
    );
  });

  it('is empty for no routes at all', () => {
    const heat = buildHeatmap([]);
    expect(heat.cells).toEqual([]);
    expect(heat.maxVisits).toBe(0);
  });
});

describe('cellCorner and heatmapBounds', () => {
  it('puts a cell back where the route was', () => {
    const heat = buildHeatmap([route(HOME, 20)]);
    const corner = cellCorner(heat.cells[0]!, heat);
    expect(Math.abs(corner.lat - HOME.lat)).toBeLessThan(0.05);
    expect(Math.abs(corner.lon - HOME.lon)).toBeLessThan(0.05);
  });

  it('bounds every cell, north above south and east of west', () => {
    const bounds = heatmapBounds(buildHeatmap([route(HOME, 40), route(offsetBy(HOME, 4000, 90), 40)]))!;
    expect(bounds.north).toBeGreaterThan(bounds.south);
    expect(bounds.east).toBeGreaterThan(bounds.west);
    expect(bounds.south).toBeLessThanOrEqual(HOME.lat);
    expect(bounds.north).toBeGreaterThanOrEqual(HOME.lat);
  });

  it('has no bounds for an empty map', () => {
    expect(heatmapBounds(buildHeatmap([]))).toBeNull();
  });
});

describe('readHeatmap', () => {
  it('refuses to characterise somebody from two runs', () => {
    expect(readHeatmap(buildHeatmap([route(HOME, 20), route(HOME, 20)]))).toBeNull();
  });

  it('calls out someone who runs the same loop', () => {
    const loop = route(HOME, 40);
    const reading = readHeatmap(buildHeatmap([loop, loop, loop, loop, loop]))!;
    expect(reading.concentration).toBeGreaterThan(0.6);
    expect(reading.headline).toMatch(/one route/i);
  });

  it('calls out someone who never repeats', () => {
    const routes = Array.from({ length: 6 }, (_, i) => route(offsetBy(HOME, 5000 * (i + 1), 90), 30));
    const reading = readHeatmap(buildHeatmap(routes))!;
    expect(reading.concentration).toBeLessThan(0.3);
    expect(reading.headline).toMatch(/rarely/i);
    expect(reading.detail).toMatch(/segments/i);
  });
});

describe('walking the line', () => {
  it('fills the gap between two distant points rather than marking only the ends', () => {
    // The production case: stored traces are thinned, so a straight kilometre
    // can be exactly two points. Binning the vertices alone gave a heatmap of
    // two dots with nothing between them.
    const sparse = [HOME, offsetBy(HOME, 1000, 0)];
    const heat = buildHeatmap([sparse], { zoom: 14, resolution: 48 });
    expect(heat.cells.length).toBeGreaterThan(20);
  });

  it('gives the same cells for a thinned line as for a dense one', () => {
    const dense = route(HOME, 200, 5);
    const sparse = [dense[0]!, dense[dense.length - 1]!];
    const a = buildHeatmap([dense], { zoom: 14, resolution: 48 });
    const b = buildHeatmap([sparse], { zoom: 14, resolution: 48 });
    // Not identical — a straight interpolation is not the original path — but
    // for a straight line they should agree closely.
    expect(Math.abs(a.cells.length - b.cells.length)).toBeLessThanOrEqual(2);
  });

  it('still counts a walked leg once per activity', () => {
    const heat = buildHeatmap([[HOME, offsetBy(HOME, 2000, 0)]], { zoom: 14, resolution: 48 });
    expect(heat.maxVisits).toBe(1);
  });

  it('does not hang on an absurdly long leg', () => {
    // Two points on opposite sides of the world: the step cap keeps this
    // bounded rather than trying to mark a million cells.
    const heat = buildHeatmap([[{ lat: 0, lon: -170 }, { lat: 0, lon: 170 }]], { zoom: 14, resolution: 48 });
    expect(heat.cells.length).toBeLessThanOrEqual(401);
  });
});

import {
  CORRIDOR_M,
  GATE_RADIUS_M,
  MIN_SEGMENT_M,
  boardFor,
  climbCategory,
  disciplineOf,
  gradientPct,
  matchSegment,
  orderSegments,
  segmentFromTrace,
  type Segment,
  type SegmentEffort,
} from '../domain/segments';
import { simplify, type TrackPoint } from '../domain/track';

const METERS_PER_DEG_LAT = 111_194.9;
const T0 = 1_700_000_000_000;

/** A trace due north, `meters` long, at an even speed. */
function northTrack(meters: number, seconds: number, points: number, opts: { t0?: number; lat0?: number; lon?: number; ele0?: number; ele1?: number } = {}): TrackPoint[] {
  const { t0 = T0, lat0 = 51, lon = -0.1, ele0, ele1 } = opts;
  const out: TrackPoint[] = [];
  for (let i = 0; i < points; i++) {
    const f = i / (points - 1);
    out.push({
      lat: lat0 + (meters * f) / METERS_PER_DEG_LAT,
      lon,
      t: t0 + seconds * f * 1000,
      acc: 5,
      ...(ele0 != null ? { ele: ele0 + ((ele1 ?? ele0) - ele0) * f } : null),
    });
  }
  return out;
}

const base = northTrack(1000, 300, 101);

const hill: Segment = segmentFromTrace(base, 0, 100, {
  id: 'seg1',
  name: 'The hill',
  activityId: 'act1',
  discipline: 'foot',
  createdAt: '2026-01-01T09:00:00.000Z',
})!;

describe('segmentFromTrace', () => {
  it('carves a segment out of a trace', () => {
    expect(hill).not.toBeNull();
    expect(hill.distanceM).toBeGreaterThan(950);
    expect(hill.distanceM).toBeLessThan(1050);
    expect(hill.path.length).toBeGreaterThan(50);
  });

  it('refuses anything shorter than the minimum', () => {
    const short = northTrack(120, 40, 20);
    expect(
      segmentFromTrace(short, 0, 19, { id: 's', name: 'x', activityId: 'a', discipline: 'foot', createdAt: '2026-01-01T00:00:00.000Z' }),
    ).toBeNull();
    expect(MIN_SEGMENT_M).toBe(200);
  });

  it('accepts the indices in either order', () => {
    const forward = segmentFromTrace(base, 0, 100, { id: 'a', name: 'n', activityId: 'x', discipline: 'foot', createdAt: '2026-01-01T00:00:00.000Z' })!;
    const backward = segmentFromTrace(base, 100, 0, { id: 'b', name: 'n', activityId: 'x', discipline: 'foot', createdAt: '2026-01-01T00:00:00.000Z' })!;
    expect(backward.distanceM).toBe(forward.distanceM);
  });

  it('falls back to a name rather than storing an empty one', () => {
    const s = segmentFromTrace(base, 0, 100, { id: 'a', name: '   ', activityId: 'x', discipline: 'foot', createdAt: '2026-01-01T00:00:00.000Z' })!;
    expect(s.name).toBe('Unnamed segment');
  });

  it('measures climbing past the noise threshold', () => {
    const climbTrace = northTrack(1000, 300, 101, { ele0: 100, ele1: 200 });
    const s = segmentFromTrace(climbTrace, 0, 100, { id: 'c', name: 'Climb', activityId: 'x', discipline: 'wheel', createdAt: '2026-01-01T00:00:00.000Z' })!;
    expect(s.ascentM).toBeGreaterThan(90);
  });
});

describe('matchSegment', () => {
  it('finds the effort when the same ground is covered again, faster', () => {
    const faster = northTrack(1000, 240, 101, { t0: T0 + 86_400_000 });
    const efforts = matchSegment(hill, faster);
    expect(efforts).toHaveLength(1);
    expect(efforts[0]!.seconds).toBeCloseTo(240, 0);
  });

  it('finds the segment inside a longer activity', () => {
    // 500 m of approach, the segment, then 500 m more.
    const approach = northTrack(500, 150, 51, { lat0: 51 - 500 / METERS_PER_DEG_LAT });
    const middle = northTrack(1000, 270, 101, { t0: T0 + 150_000 });
    const after = northTrack(500, 150, 51, { t0: T0 + 420_000, lat0: 51 + 1000 / METERS_PER_DEG_LAT });
    const efforts = matchSegment(hill, [...approach, ...middle, ...after]);
    expect(efforts).toHaveLength(1);
    expect(efforts[0]!.seconds).toBeCloseTo(270, 0);
  });

  it('finds one effort per lap of a repeat session', () => {
    const lap = (n: number) => northTrack(1000, 250, 101, { t0: T0 + n * 600_000 });
    const back = (n: number) =>
      northTrack(1000, 250, 101, { t0: T0 + n * 600_000 + 250_000 })
        .map((p, i, arr) => ({ ...p, lat: arr[arr.length - 1 - i]!.lat }));
    const efforts = matchSegment(hill, [...lap(0), ...back(0), ...lap(1), ...back(1), ...lap(2)]);
    expect(efforts).toHaveLength(3);
  });

  it('does not match the same ground covered the other way', () => {
    const reversed = northTrack(1000, 300, 101).map((p, i, arr) => ({ ...p, lat: arr[arr.length - 1 - i]!.lat }));
    expect(matchSegment(hill, reversed)).toHaveLength(0);
  });

  it('does not match an activity that never goes near it', () => {
    const elsewhere = northTrack(1000, 300, 101, { lat0: 52.5, lon: 1.2 });
    expect(matchSegment(hill, elsewhere)).toHaveLength(0);
  });

  it('does not match a loop that only touches both gates', () => {
    // Out east, north, and back west to the finish: both gates hit, nothing
    // in between on the line.
    const lonPerM = 1 / (METERS_PER_DEG_LAT * Math.cos((51 * Math.PI) / 180));
    const detour: TrackPoint[] = [];
    for (let i = 0; i <= 40; i++) detour.push({ lat: 51, lon: -0.1 + i * 8 * lonPerM, t: T0 + i * 8000, acc: 5 });
    for (let i = 1; i <= 40; i++) detour.push({ lat: 51 + (i * 25) / METERS_PER_DEG_LAT, lon: -0.1 + 320 * lonPerM, t: T0 + 320_000 + i * 8000, acc: 5 });
    for (let i = 1; i <= 40; i++) detour.push({ lat: 51 + 1000 / METERS_PER_DEG_LAT, lon: -0.1 + (320 - i * 8) * lonPerM, t: T0 + 640_000 + i * 8000, acc: 5 });
    expect(matchSegment(hill, detour)).toHaveLength(0);
  });

  it('matches through a gate-width offset, like the far side of a road', () => {
    const lonPerM = 1 / (METERS_PER_DEG_LAT * Math.cos((51 * Math.PI) / 180));
    const offset = northTrack(1000, 280, 101).map((p) => ({ ...p, lon: p.lon + 12 * lonPerM }));
    expect(matchSegment(hill, offset)).toHaveLength(1);
  });

  it('carries average heart rate through the effort', () => {
    const withHr = northTrack(1000, 260, 101).map((p) => ({ ...p, hr: 168 }));
    expect(matchSegment(hill, withHr)[0]!.avgHr).toBe(168);
  });

  it('matches against a thinned path, which is what actually gets stored', () => {
    // The regression this exists for: stored segment paths are simplified, so
    // a straight kilometre is two points. Checking the corridor against the
    // nearest *vertex* then puts the middle of a perfectly good effort five
    // hundred metres off the route, and nothing ever matched a second run.
    const thinned = simplify(base, 3);
    expect(thinned.length).toBeLessThan(5);

    const sparse = segmentFromTrace(thinned, 0, thinned.length - 1, {
      id: 'sparse', name: 'Straight', activityId: 'a', discipline: 'foot', createdAt: '2026-01-01T00:00:00.000Z',
    })!;
    expect(sparse.path.length).toBeLessThan(5);

    const secondRun = northTrack(1000, 265, 101, { t0: T0 + 86_400_000 });
    const efforts = matchSegment(sparse, secondRun);
    expect(efforts).toHaveLength(1);
    expect(efforts[0]!.seconds).toBeCloseTo(265, 0);
  });

  it('still rejects a parallel street when the path is thinned', () => {
    const lonPerM = 1 / (METERS_PER_DEG_LAT * Math.cos((51 * Math.PI) / 180));
    const sparse = segmentFromTrace(simplify(base, 3), 0, simplify(base, 3).length - 1, {
      id: 'sparse2', name: 'Straight', activityId: 'a', discipline: 'foot', createdAt: '2026-01-01T00:00:00.000Z',
    })!;
    // 120 m to the east for the whole length: hits neither gate, and would
    // fail the corridor even if it did.
    const parallel = northTrack(1000, 280, 101).map((p) => ({ ...p, lon: p.lon + 120 * lonPerM }));
    expect(matchSegment(sparse, parallel)).toHaveLength(0);
  });

  it('returns nothing for an empty trace', () => {
    expect(matchSegment(hill, [])).toEqual([]);
  });

  it('uses gate and corridor constants a human can reason about', () => {
    expect(GATE_RADIUS_M).toBe(25);
    expect(CORRIDOR_M).toBe(40);
  });
});

describe('gradientPct and climbCategory', () => {
  it('reports the average gradient', () => {
    expect(gradientPct({ ...hill, distanceM: 1000, ascentM: 85 })).toBeCloseTo(8.5, 1);
    expect(gradientPct({ ...hill, distanceM: 0, ascentM: 50 })).toBe(0);
  });

  it('leaves a flat stretch uncategorised', () => {
    expect(climbCategory({ ...hill, ascentM: 10 })).toBeNull();
  });

  it('categorises climbs, hardest first', () => {
    expect(climbCategory({ ...hill, ascentM: 90 })).toBe('4');
    expect(climbCategory({ ...hill, ascentM: 200 })).toBe('3');
    expect(climbCategory({ ...hill, ascentM: 400 })).toBe('2');
    expect(climbCategory({ ...hill, ascentM: 700 })).toBe('1');
    expect(climbCategory({ ...hill, ascentM: 1200 })).toBe('HC');
  });
});

describe('boardFor', () => {
  const effort = (date: string, seconds: number, id = 'seg1'): SegmentEffort => ({
    segmentId: id, activityId: `a-${date}`, activityName: 'Run', date, seconds,
    startIndex: 0, endIndex: 10, avgHr: null,
  });

  it('says something useful about a single effort', () => {
    const board = boardFor('seg1', [effort('2026-01-01', 300)]);
    expect(board.latestRank).toBeNull();
    expect(board.note).toMatch(/second one/i);
  });

  it('ranks the latest effort against the rest', () => {
    const board = boardFor('seg1', [effort('2026-01-01', 300), effort('2026-02-01', 280), effort('2026-03-01', 290)]);
    expect(board.best!.seconds).toBe(280);
    expect(board.latest!.date).toBe('2026-03-01');
    expect(board.latestRank).toBe(2);
    expect(board.latestVsBest).toBe(10);
  });

  it('calls out a new best', () => {
    const board = boardFor('seg1', [effort('2026-01-01', 300), effort('2026-02-01', 270)]);
    expect(board.latestRank).toBe(1);
    expect(board.note).toMatch(/fastest/i);
  });

  it('ignores efforts on other segments', () => {
    const board = boardFor('seg1', [effort('2026-01-01', 300), effort('2026-02-01', 100, 'seg2')]);
    expect(board.efforts).toHaveLength(1);
  });

  it('handles a segment with no efforts at all', () => {
    const board = boardFor('seg1', []);
    expect(board.best).toBeNull();
    expect(board.note).toMatch(/no efforts/i);
  });
});

describe('orderSegments', () => {
  const seg = (id: string, name: string, hidden = false): Segment => ({ ...hill, id, name, hidden });

  it('puts the most recently covered first', () => {
    const segments = [seg('a', 'Alpha'), seg('b', 'Bravo')];
    const efforts: SegmentEffort[] = [
      { segmentId: 'a', activityId: '1', activityName: 'r', date: '2026-01-01', seconds: 100, startIndex: 0, endIndex: 1, avgHr: null },
      { segmentId: 'b', activityId: '2', activityName: 'r', date: '2026-05-01', seconds: 100, startIndex: 0, endIndex: 1, avgHr: null },
    ];
    expect(orderSegments(segments, efforts).map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('drops hidden segments from the list', () => {
    expect(orderSegments([seg('a', 'Alpha'), seg('b', 'Bravo', true)], [])).toHaveLength(1);
  });

  it('falls back to name when nothing has been ridden', () => {
    expect(orderSegments([seg('b', 'Bravo'), seg('a', 'Alpha')], []).map((s) => s.name)).toEqual(['Alpha', 'Bravo']);
  });
});

describe('disciplineOf', () => {
  it('separates foot sports from wheels', () => {
    expect(disciplineOf('run')).toBe('foot');
    expect(disciplineOf('hike')).toBe('foot');
    expect(disciplineOf('ride')).toBe('wheel');
  });

  it('returns null for anything a segment cannot apply to', () => {
    expect(disciplineOf('swim')).toBeNull();
    expect(disciplineOf('elliptical')).toBeNull();
  });
});

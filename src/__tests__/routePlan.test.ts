import {
  CLOSE_TOLERANCE_M,
  FALLBACK_PACES,
  MIN_PACE_SAMPLE_M,
  EMPTY_PLAN,
  LONG_LEG_M,
  ROUTE_PLAN_NOTE,
  addWaypoint,
  clearPlan,
  closeLoop,
  estimateSeconds,
  outAndBack,
  paceFromSecPerKm,
  paceToSecPerKm,
  planDistance,
  planFrom,
  planQuality,
  planToGpx,
  removeLast,
  typicalPaceSecPerKm,
  type SavedRoute,
} from '../domain/routePlan';
import { formatDistance, formatElevation, type LatLon } from '../domain/geo';

// Greenwich, then points a known distance away. At this latitude 0.001° of
// latitude is about 111 m, which keeps the arithmetic in the tests legible.
const A: LatLon = { lat: 51.4778, lon: -0.0015 };
const north = (m: number): LatLon => ({ lat: A.lat + m / 111_320, lon: A.lon });
const east = (m: number): LatLon => ({
  lat: A.lat,
  lon: A.lon + m / (111_320 * Math.cos((A.lat * Math.PI) / 180)),
});

describe('planDistance and planFrom', () => {
  it('is zero for nothing and for a single point', () => {
    expect(planDistance([])).toBe(0);
    expect(planDistance([A])).toBe(0);
    expect(planFrom([]).distanceM).toBe(0);
  });

  it('sums the legs in order', () => {
    const plan = planFrom([A, north(200), north(500)]);
    expect(plan.distanceM).toBeGreaterThan(495);
    expect(plan.distanceM).toBeLessThan(505);
  });

  it('rounds the distance to whole metres', () => {
    expect(Number.isInteger(planFrom([A, north(123.456)]).distanceM)).toBe(true);
  });
});

describe('closed', () => {
  it('needs three points before it can be a loop', () => {
    // Out and straight back on two points is a there-and-back, not a loop,
    // and calling it closed would let closeLoop refuse a plan that still
    // wants closing.
    expect(planFrom([A, A]).closed).toBe(false);
  });

  it('counts a finish within the tolerance as closed', () => {
    const plan = planFrom([A, north(300), east(300), north(CLOSE_TOLERANCE_M - 5)]);
    expect(plan.closed).toBe(true);
  });

  it('does not count a finish beyond the tolerance', () => {
    const plan = planFrom([A, north(300), east(300), north(CLOSE_TOLERANCE_M + 50)]);
    expect(plan.closed).toBe(false);
  });
});

describe('addWaypoint', () => {
  it('appends and recomputes', () => {
    const plan = addWaypoint(addWaypoint(EMPTY_PLAN, A), north(400));
    expect(plan.waypoints).toHaveLength(2);
    expect(plan.distanceM).toBeGreaterThan(390);
  });

  it('drops a tap on the point already there', () => {
    // A double-tap otherwise adds a zero-length leg and an undo step that
    // appears to do nothing.
    const one = addWaypoint(EMPTY_PLAN, A);
    const again = addWaypoint(one, { lat: A.lat + 0.000002, lon: A.lon });
    expect(again.waypoints).toHaveLength(1);
    expect(again).toBe(one);
  });

  it('keeps a point that is only near, not on, the last one', () => {
    const plan = addWaypoint(addWaypoint(EMPTY_PLAN, A), north(5));
    expect(plan.waypoints).toHaveLength(2);
  });

  it('refuses a coordinate that is not a number', () => {
    // A NaN poisons every leg through it: the distance reads "NaN", the line
    // stops drawing, and nothing says why. One dropped tap is the better
    // failure.
    const one = addWaypoint(EMPTY_PLAN, A);
    expect(addWaypoint(one, { lat: Number.NaN, lon: A.lon })).toBe(one);
    expect(addWaypoint(one, { lat: A.lat, lon: Number.NaN })).toBe(one);
    expect(addWaypoint(one, { lat: Number.POSITIVE_INFINITY, lon: 0 })).toBe(one);
    expect(addWaypoint(EMPTY_PLAN, { lat: Number.NaN, lon: Number.NaN }).waypoints).toEqual([]);
  });

  it('only compares against the last point, not the whole plan', () => {
    // Returning to the start is a loop, not a duplicate.
    const plan = addWaypoint(addWaypoint(addWaypoint(EMPTY_PLAN, A), north(300)), A);
    expect(plan.waypoints).toHaveLength(3);
  });
});

describe('removeLast and clearPlan', () => {
  it('undoes one point at a time', () => {
    const plan = planFrom([A, north(300), east(300)]);
    const undone = removeLast(plan);
    expect(undone.waypoints).toHaveLength(2);
    expect(undone.distanceM).toBeLessThan(plan.distanceM);
  });

  it('survives an undo on an empty plan', () => {
    expect(removeLast(EMPTY_PLAN).waypoints).toEqual([]);
  });

  it('reopens a loop when the closing point is undone', () => {
    const loop = closeLoop(planFrom([A, north(300), east(300)]));
    expect(loop.closed).toBe(true);
    expect(removeLast(loop).closed).toBe(false);
  });

  it('clears to the empty plan', () => {
    expect(clearPlan()).toEqual(EMPTY_PLAN);
  });
});

describe('closeLoop', () => {
  it('returns to the start', () => {
    const plan = planFrom([A, north(300), east(300)]);
    const loop = closeLoop(plan);
    expect(loop.waypoints).toHaveLength(4);
    expect(loop.waypoints[3]).toEqual(A);
    expect(loop.closed).toBe(true);
  });

  it('refuses when it is already closed', () => {
    // Stacking a second copy of the first point reads as a no-op and then
    // breaks the out-and-back.
    const loop = closeLoop(planFrom([A, north(300), east(300)]));
    expect(closeLoop(loop)).toBe(loop);
  });

  it('refuses a plan too short to be a loop', () => {
    const two = planFrom([A, north(300)]);
    expect(closeLoop(two)).toBe(two);
    expect(closeLoop(EMPTY_PLAN)).toBe(EMPTY_PLAN);
  });
});

describe('outAndBack', () => {
  it('retraces without repeating the turnaround', () => {
    const plan = planFrom([A, north(300), north(600)]);
    const there = plan.distanceM;
    const back = outAndBack(plan);
    // A→B→C→B→A: five points, not six.
    expect(back.waypoints).toHaveLength(5);
    expect(back.waypoints[2]).toEqual(north(600));
    expect(back.waypoints[3]).toEqual(north(300));
    expect(back.distanceM).toBeCloseTo(there * 2, -1);
  });

  it('leaves no zero-length leg at the far end', () => {
    const back = outAndBack(planFrom([A, north(300), north(600)]));
    for (let i = 1; i < back.waypoints.length; i += 1) {
      expect(back.waypoints[i]).not.toEqual(back.waypoints[i - 1]);
    }
  });

  it('refuses a plan with nothing to retrace', () => {
    expect(outAndBack(EMPTY_PLAN)).toBe(EMPTY_PLAN);
    const one = planFrom([A]);
    expect(outAndBack(one)).toBe(one);
  });

  it('doubles a two-point plan back on itself', () => {
    const back = outAndBack(planFrom([A, north(400)]));
    expect(back.waypoints).toHaveLength(3);
    expect(back.waypoints[2]).toEqual(A);
    expect(back.closed).toBe(true);
  });
});

describe('planQuality', () => {
  it('says nothing about an empty plan', () => {
    expect(planQuality(EMPTY_PLAN)).toEqual({ longLegs: 0, longestLegM: 0, wiggleWarning: false });
  });

  it('holds its tongue for one long leg', () => {
    // A single long leg on an otherwise detailed route is usually a straight
    // road, and warning about it would train people to ignore the warning.
    const q = planQuality(planFrom([A, north(LONG_LEG_M + 200), north(LONG_LEG_M + 250)]));
    expect(q.longLegs).toBe(1);
    expect(q.wiggleWarning).toBe(false);
  });

  it('warns once the route is sketched rather than traced', () => {
    const q = planQuality(planFrom([A, north(1200), east(1200), north(2000)]));
    expect(q.longLegs).toBeGreaterThanOrEqual(2);
    expect(q.wiggleWarning).toBe(true);
  });

  it('reports the longest leg for the reader to judge', () => {
    const q = planQuality(planFrom([A, north(100), north(1100)]));
    expect(q.longestLegM).toBeGreaterThan(990);
    expect(q.longestLegM).toBeLessThan(1010);
  });

  it('says so in the note rather than hiding the compromise', () => {
    expect(ROUTE_PLAN_NOTE).toMatch(/straight lines/i);
    expect(ROUTE_PLAN_NOTE).toMatch(/not roads/i);
  });
});

describe('estimateSeconds', () => {
  it('multiplies pace by distance', () => {
    expect(estimateSeconds(5000, 300)).toBe(1500);
  });

  it('returns null rather than Infinity for a nonsense pace', () => {
    // Infinity here renders as "Infinity:NaN" on the screen.
    expect(estimateSeconds(5000, 0)).toBeNull();
    expect(estimateSeconds(5000, -60)).toBeNull();
    expect(estimateSeconds(5000, Number.NaN)).toBeNull();
    expect(estimateSeconds(5000, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('is zero, not null, for a route with no distance yet', () => {
    // Nobody has set a bad pace here; there is simply nothing to cover.
    expect(estimateSeconds(0, 300)).toBe(0);
  });

  it('rounds to whole seconds', () => {
    expect(Number.isInteger(estimateSeconds(1234, 317)!)).toBe(true);
  });
});

describe('planToGpx', () => {
  const route: SavedRoute = {
    id: 'r1',
    name: 'Round the park',
    waypoints: [A, north(300), east(300)],
    distanceM: 900,
    closed: false,
    createdAt: '2026-09-24T07:00:00.000Z',
  };

  it('writes a route, not a track', () => {
    // A track is somewhere you went; a route is somewhere you intend to go.
    // Handing a watch a track it reads as a completed activity is wrong.
    const gpx = planToGpx(route);
    expect(gpx).toContain('<rte>');
    expect(gpx).toContain('<rtept');
    expect(gpx).not.toContain('<trk>');
    expect(gpx).not.toContain('<trkpt');
  });

  it('emits one point per waypoint in order', () => {
    const gpx = planToGpx(route);
    expect(gpx.match(/<rtept/g)).toHaveLength(3);
    expect(gpx.indexOf(A.lat.toFixed(6))).toBeLessThan(gpx.indexOf(north(300).lat.toFixed(6)));
  });

  it('escapes a name that would otherwise break the XML', () => {
    const gpx = planToGpx({ ...route, name: 'Tom & Jerry <fast> "loop"' });
    expect(gpx).toContain('Tom &amp; Jerry &lt;fast&gt; &quot;loop&quot;');
    expect(gpx).not.toMatch(/<fast>/);
  });

  it('declares its encoding, because names are not always ASCII', () => {
    expect(planToGpx(route)).toMatch(/encoding="UTF-8"/);
  });

  it('carries the creation time as metadata', () => {
    expect(planToGpx(route)).toContain('2026-09-24T07:00:00.000Z');
  });
});

describe('typicalPaceSecPerKm', () => {
  const s = (distanceM: number, seconds: number) => ({ distanceM, seconds });

  it('is null when there is nothing to go on', () => {
    // The screen then asks, rather than inventing a pace and presenting it
    // back as the athlete's own.
    expect(typicalPaceSecPerKm([])).toBeNull();
  });

  it('takes the median, not the mean', () => {
    // One walk to the shops logged as a run drags a mean by a minute a
    // kilometre and the estimate stops being recognisable.
    const runs = [s(5000, 1500), s(5000, 1530), s(5000, 1560), s(5000, 4500)];
    const pace = typicalPaceSecPerKm(runs)!;
    expect(pace).toBeGreaterThan(300);
    expect(pace).toBeLessThan(320);
  });

  it('averages the middle pair for an even count', () => {
    expect(typicalPaceSecPerKm([s(1000, 300), s(1000, 320)])).toBe(310);
  });

  it('ignores a sample too short to say anything', () => {
    expect(typicalPaceSecPerKm([s(MIN_PACE_SAMPLE_M - 100, 600)])).toBeNull();
    // 1000 m in 300 s survives; the 200 m sprint is dropped rather than
    // averaged in, so the answer is the long sample's own pace.
    expect(typicalPaceSecPerKm([s(1000, 300), s(200, 60)])).toBe(300);
  });

  it('ignores a sample with no time on it', () => {
    expect(typicalPaceSecPerKm([s(5000, 0), s(5000, 1500)])).toBe(300);
  });

  it('rounds to whole seconds', () => {
    expect(Number.isInteger(typicalPaceSecPerKm([s(1000, 301), s(1000, 302)])!)).toBe(true);
  });
});

describe('pace units', () => {
  it('round-trips a pace through both units', () => {
    for (const units of ['metric', 'imperial'] as const) {
      const there = paceToSecPerKm(300, units);
      expect(paceFromSecPerKm(there, units)).toBeCloseTo(300, 6);
    }
  });

  it('leaves a metric pace alone', () => {
    expect(paceToSecPerKm(300, 'metric')).toBe(300);
    expect(paceFromSecPerKm(300, 'metric')).toBe(300);
  });

  it('makes a mile pace the slower-looking number', () => {
    // A mile takes longer than a kilometre, so the same runner's per-mile
    // figure is the bigger one. Getting this backwards turns a ten-mile long
    // run into an hour, which looks plausible and is not.
    expect(paceFromSecPerKm(300, 'imperial')).toBeGreaterThan(300);
    expect(paceToSecPerKm(480, 'imperial')).toBeLessThan(480);
  });

  it('converts 8:00 a mile to very nearly 5:00 a kilometre', () => {
    expect(paceToSecPerKm(480, 'imperial')).toBeCloseTo(298.3, 1);
  });

  it('offers round numbers in the unit the reader thinks in', () => {
    // Not converted from the other list: 8:03, 8:51, 9:39 reads as somebody
    // else's numbers translated rather than a list of paces.
    for (const p of FALLBACK_PACES.metric) expect(p % 30).toBe(0);
    for (const p of FALLBACK_PACES.imperial) expect(p % 60).toBe(0);
  });

  it('offers the same number of choices either way', () => {
    expect(FALLBACK_PACES.imperial).toHaveLength(FALLBACK_PACES.metric.length);
  });
});

describe('formatElevation', () => {
  it('stays in metres rather than being promoted to kilometres', () => {
    // formatDistance would render this as "2.0 km", which is not a unit
    // anybody quotes a climb in and reads as a horizontal measurement.
    expect(formatElevation(2000, 'metric')).toBe('2,000 m');
    expect(formatDistance(2000, 'metric')).toBe('2.0 km');
  });

  it('uses feet for an athlete whose distances are in miles', () => {
    expect(formatElevation(1000, 'imperial')).toBe('3,281 ft');
  });

  it('rounds to a whole unit', () => {
    expect(formatElevation(46.4, 'metric')).toBe('46 m');
    expect(formatElevation(0, 'metric')).toBe('0 m');
  });
});

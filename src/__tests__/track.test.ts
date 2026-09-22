import {
  ELEVATION_NOISE_M,
  cleanTrack,
  elevationChange,
  elevationProfile,
  formatDuration,
  formatPaceSec,
  gradeAdjustedPace,
  gradeFactor,
  paceFrom,
  simplify,
  splits,
  trackStats,
  KM,
  MILE,
  type TrackPoint,
} from '../domain/track';

/**
 * A synthetic trace due north from a start point, at a constant speed.
 *
 * Latitude is used rather than longitude because a degree of latitude is very
 * nearly constant everywhere, which makes the expected distances checkable by
 * hand rather than by running the code being tested.
 */
const METERS_PER_DEG_LAT = 111_194.9;

function straightTrack(opts: {
  meters: number;
  seconds: number;
  points: number;
  startEle?: number;
  endEle?: number;
  hr?: number;
  t0?: number;
}): TrackPoint[] {
  const { meters, seconds, points, startEle, endEle, hr, t0 = 1_700_000_000_000 } = opts;
  const out: TrackPoint[] = [];
  for (let i = 0; i < points; i++) {
    const f = i / (points - 1);
    out.push({
      lat: 51 + (meters * f) / METERS_PER_DEG_LAT,
      lon: -0.1,
      t: t0 + seconds * f * 1000,
      ...(startEle != null ? { ele: startEle + ((endEle ?? startEle) - startEle) * f } : null),
      ...(hr != null ? { hr } : null),
      acc: 5,
    });
  }
  return out;
}

describe('cleanTrack', () => {
  it('sorts by time and keeps a clean trace intact', () => {
    const t = straightTrack({ meters: 1000, seconds: 300, points: 61 });
    const shuffled = [t[5]!, t[0]!, t[2]!, t[1]!, ...t.slice(6)];
    const cleaned = cleanTrack(shuffled);
    expect(cleaned[0]!.t).toBeLessThan(cleaned[1]!.t);
    expect(cleaned.length).toBeGreaterThan(50);
  });

  it('drops fixes the receiver flagged as inaccurate', () => {
    const t = straightTrack({ meters: 1000, seconds: 300, points: 11 });
    t[5] = { ...t[5]!, acc: 120 };
    expect(cleanTrack(t)).toHaveLength(10);
  });

  it('drops a fix that implies a teleport', () => {
    const t = straightTrack({ meters: 1000, seconds: 300, points: 11 });
    // Jump 5 km sideways for one sample.
    t[5] = { ...t[5]!, lat: t[5]!.lat + 0.05 };
    const cleaned = cleanTrack(t);
    expect(cleaned.some((p) => p.lat === t[5]!.lat)).toBe(false);
  });

  it('does not accumulate distance while standing still', () => {
    // Twenty fixes at one spot, jittered by a metre or so — a phone on a bench.
    const stationary: TrackPoint[] = [];
    for (let i = 0; i < 20; i++) {
      stationary.push({
        lat: 51 + (Math.sin(i) * 1.2) / METERS_PER_DEG_LAT,
        lon: -0.1,
        t: 1_700_000_000_000 + i * 1000,
        acc: 5,
      });
    }
    expect(trackStats(stationary).distanceM).toBeLessThan(5);
  });

  it('handles an empty and a single-point trace', () => {
    expect(cleanTrack([])).toEqual([]);
    expect(trackStats([]).distanceM).toBe(0);
    expect(trackStats([{ lat: 51, lon: -0.1, t: 0 }]).points).toBe(1);
  });
});

describe('trackStats', () => {
  it('measures distance and elapsed time', () => {
    const t = straightTrack({ meters: 5000, seconds: 1500, points: 501 });
    const s = trackStats(t);
    expect(s.distanceM).toBeGreaterThan(4900);
    expect(s.distanceM).toBeLessThan(5100);
    expect(s.elapsedS).toBeCloseTo(1500, 0);
  });

  it('separates moving time from elapsed time', () => {
    const before = straightTrack({ meters: 1000, seconds: 300, points: 31, t0: 0 });
    // A ten-minute stop, then carry on.
    const after = straightTrack({ meters: 1000, seconds: 300, points: 31, t0: 900_000 }).map((p) => ({
      ...p,
      lat: p.lat + 1000 / METERS_PER_DEG_LAT,
    }));
    const s = trackStats([...before, ...after]);
    expect(s.elapsedS).toBeCloseTo(1200, 0);
    // The stop is not moving time; ~600s of running plus the one bridging leg.
    expect(s.movingS).toBeLessThan(900);
    expect(s.movingS).toBeGreaterThan(550);
  });

  it('averages heart rate and reports the maximum', () => {
    const t = straightTrack({ meters: 1000, seconds: 300, points: 11, hr: 150 });
    t[5] = { ...t[5]!, hr: 180 };
    const s = trackStats(t);
    expect(s.maxHr).toBe(180);
    expect(s.avgHr).toBeGreaterThan(150);
    expect(s.avgHr).toBeLessThan(160);
  });

  it('reports null for signals nothing carried', () => {
    const s = trackStats(straightTrack({ meters: 1000, seconds: 300, points: 11 }));
    expect(s.avgHr).toBeNull();
    expect(s.avgPower).toBeNull();
    expect(s.maxEleM).toBeNull();
  });
});

describe('elevationChange', () => {
  it('counts a steady climb', () => {
    const t = straightTrack({ meters: 2000, seconds: 900, points: 101, startEle: 100, endEle: 300 });
    const { ascentM, descentM } = elevationChange(t);
    expect(ascentM).toBeGreaterThan(180);
    expect(ascentM).toBeLessThanOrEqual(200);
    expect(descentM).toBe(0);
  });

  it('ignores altitude noise on flat ground', () => {
    // A flat hour with the altimeter wobbling ±2 m every sample. Summing every
    // rise here would invent hundreds of metres of climbing.
    const t: TrackPoint[] = [];
    for (let i = 0; i < 600; i++) {
      t.push({ lat: 51 + i / METERS_PER_DEG_LAT, lon: -0.1, t: i * 1000, ele: 50 + Math.sin(i * 1.7) * 2, acc: 5 });
    }
    expect(elevationChange(t).ascentM).toBe(0);
  });

  it('still counts a climb made of small steps', () => {
    // Rising 1 m per sample, 100 samples: under the per-sample threshold but a
    // real 100 m climb. Anchoring to the last confirmed level is what catches it.
    const t: TrackPoint[] = [];
    for (let i = 0; i < 100; i++) {
      t.push({ lat: 51 + i / METERS_PER_DEG_LAT, lon: -0.1, t: i * 1000, ele: 50 + i, acc: 5 });
    }
    expect(elevationChange(t).ascentM).toBeGreaterThan(90);
  });

  it('returns zero without altitude', () => {
    expect(elevationChange(straightTrack({ meters: 100, seconds: 60, points: 5 }))).toEqual({ ascentM: 0, descentM: 0 });
  });

  it('uses a three-metre threshold by default', () => {
    expect(ELEVATION_NOISE_M).toBe(3);
  });
});

describe('splits', () => {
  it('produces one split per kilometre at an even pace', () => {
    const t = straightTrack({ meters: 3000, seconds: 900, points: 301 });
    const s = splits(t, KM);
    expect(s).toHaveLength(3);
    for (const split of s) expect(split.seconds).toBeCloseTo(300, 0);
  });

  it('keeps a long remainder as a partial split', () => {
    const t = straightTrack({ meters: 2500, seconds: 750, points: 251 });
    const s = splits(t, KM);
    expect(s).toHaveLength(3);
    expect(s[2]!.distanceM).toBeGreaterThan(400);
    expect(s[2]!.distanceM).toBeLessThan(600);
  });

  it('drops a remainder too short to mean anything', () => {
    const t = straightTrack({ meters: 2030, seconds: 609, points: 204 });
    expect(splits(t, KM)).toHaveLength(2);
  });

  it('interpolates the boundary rather than snapping to a fix', () => {
    // Ten-second samples: a runner covers ~33 m between fixes. Snapping would
    // scatter split times by several seconds.
    const t = straightTrack({ meters: 2000, seconds: 600, points: 61 });
    const s = splits(t, KM);
    expect(s[0]!.seconds).toBeCloseTo(300, 1);
  });

  it('splits by mile when asked', () => {
    const t = straightTrack({ meters: 2 * MILE, seconds: 1200, points: 201 });
    const s = splits(t, MILE);
    expect(s).toHaveLength(2);
    expect(s[0]!.seconds).toBeCloseTo(600, 0);
  });

  it('returns nothing for a trace shorter than one unit', () => {
    expect(splits(straightTrack({ meters: 50, seconds: 30, points: 6 }), KM)).toEqual([]);
  });
});

describe('gradeFactor', () => {
  it('costs nothing extra on the flat', () => {
    expect(gradeFactor(0)).toBeCloseTo(1, 5);
  });

  it('costs more uphill', () => {
    expect(gradeFactor(0.1)).toBeGreaterThan(1.3);
    expect(gradeFactor(0.2)).toBeGreaterThan(gradeFactor(0.1));
  });

  it('costs less downhill, but turns back up on a steep descent', () => {
    expect(gradeFactor(-0.05)).toBeLessThan(1);
    const gentlest = gradeFactor(-0.13);
    expect(gradeFactor(-0.3)).toBeGreaterThan(gentlest);
  });

  it('never goes below half, however steep the drop', () => {
    expect(gradeFactor(-5)).toBeGreaterThanOrEqual(0.5);
  });
});

describe('gradeAdjustedPace', () => {
  it('reports a faster equivalent flat pace on a climb', () => {
    const t = straightTrack({ meters: 2000, seconds: 720, points: 201, startEle: 0, endEle: 200 });
    const actual = paceFrom(trackStats(t), 'metric')!;
    const gap = gradeAdjustedPace(t)!;
    expect(gap).toBeLessThan(actual);
  });

  it('matches actual pace on flat ground', () => {
    const t = straightTrack({ meters: 2000, seconds: 600, points: 201, startEle: 40, endEle: 40 });
    expect(gradeAdjustedPace(t)!).toBeCloseTo(300, 0);
  });

  it('refuses without altitude rather than reporting plain pace', () => {
    expect(gradeAdjustedPace(straightTrack({ meters: 2000, seconds: 600, points: 201 }))).toBeNull();
  });
});

describe('simplify', () => {
  it('reduces a dense straight line to its endpoints', () => {
    expect(simplify(straightTrack({ meters: 1000, seconds: 300, points: 200 }), 5)).toHaveLength(2);
  });

  it('keeps the corner of a dog-leg', () => {
    const north = straightTrack({ meters: 500, seconds: 150, points: 50 });
    const east = north.map((p, i) => ({
      ...p,
      lat: north[north.length - 1]!.lat,
      lon: -0.1 + (i * 10) / (METERS_PER_DEG_LAT * Math.cos((51 * Math.PI) / 180)),
      t: p.t + 150_000,
    }));
    const kept = simplify([...north, ...east], 5);
    expect(kept.length).toBeGreaterThanOrEqual(3);
    expect(kept.length).toBeLessThan(10);
  });

  it('leaves short traces alone', () => {
    const t = straightTrack({ meters: 20, seconds: 10, points: 2 });
    expect(simplify(t)).toHaveLength(2);
  });
});

describe('formatting', () => {
  it('formats durations under and over an hour', () => {
    expect(formatDuration(125)).toBe('2:05');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(0)).toBe('0:00');
  });

  it('carries rounded seconds instead of printing :60', () => {
    expect(formatPaceSec(299.7, 'km')).toBe('5:00 /km');
    expect(formatPaceSec(292, 'mi')).toBe('4:52 /mi');
  });

  it('dashes rather than dividing by zero', () => {
    expect(formatPaceSec(0, 'km')).toBe('—');
    expect(formatPaceSec(Number.NaN, 'km')).toBe('—');
  });

  it('paces off moving time, not elapsed', () => {
    const s = trackStats(straightTrack({ meters: 1000, seconds: 300, points: 101 }));
    expect(paceFrom(s, 'metric')!).toBeCloseTo(300, 0);
    expect(paceFrom(s, 'imperial')!).toBeCloseTo(300 * 1.609, 0);
  });
});

describe('elevationProfile', () => {
  it('survives a trace that simplify would reduce to two points', () => {
    // A dead-straight climb: no horizontal deviation at all, so thinning the
    // trace by its shape keeps only the endpoints. The profile must not go
    // with it — this is the bug that made a hill's chart come out blank.
    const t = straightTrack({ meters: 2000, seconds: 900, points: 201, startEle: 20, endEle: 220 });
    expect(simplify(t, 3)).toHaveLength(2);
    const profile = elevationProfile(t);
    expect(profile.length).toBeGreaterThan(20);
    expect(profile[0]!.ele).toBeCloseTo(20, 0);
    expect(profile[profile.length - 1]!.ele).toBeCloseTo(220, 0);
  });

  it('samples against distance, not against sample index', () => {
    const t = straightTrack({ meters: 1000, seconds: 300, points: 101, startEle: 0, endEle: 100 });
    const profile = elevationProfile(t, 100);
    for (let i = 1; i < profile.length; i++) {
      expect(profile[i]!.distanceM).toBeGreaterThan(profile[i - 1]!.distanceM);
    }
    // Roughly one sample per hundred metres, plus the final point.
    expect(profile.length).toBeLessThanOrEqual(12);
  });

  it('caps the number of samples however long the route', () => {
    const t = straightTrack({ meters: 80_000, seconds: 12_000, points: 2001, startEle: 0, endEle: 1500 });
    expect(elevationProfile(t, 25, 300).length).toBeLessThanOrEqual(301);
  });

  it('returns nothing without altitude', () => {
    expect(elevationProfile(straightTrack({ meters: 1000, seconds: 300, points: 101 }))).toEqual([]);
  });

  it('always includes the last point, so the profile reaches the finish', () => {
    const t = straightTrack({ meters: 1000, seconds: 300, points: 101, startEle: 0, endEle: 100 });
    const profile = elevationProfile(t, 300);
    expect(profile[profile.length - 1]!.distanceM).toBeGreaterThan(950);
  });
});

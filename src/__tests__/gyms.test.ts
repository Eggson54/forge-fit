import {
  bearingDegrees,
  boundsOf,
  compassPoint,
  distanceMeters,
  fitViewport,
  formatDistance,
  offsetBy,
  padBounds,
  projectUnit,
  unprojectUnit,
} from '../domain/geo';
import {
  CLAIM_RADIUS_M,
  claimPoints,
  claimableNow,
  evaluateCheckIn,
  nearbyGyms,
  rarityOf,
  summariseCollection,
  type Claim,
  type Gym,
} from '../domain/gyms';
import { demoGymProvider } from '../services/gyms/demo';

const LONDON = { lat: 51.5074, lon: -0.1278 };
const PARIS = { lat: 48.8566, lon: 2.3522 };

const gym = (over: Partial<Gym> = {}): Gym => ({
  id: 'g1',
  name: 'Test Gym',
  kind: 'commercial',
  lat: LONDON.lat,
  lon: LONDON.lon,
  ...over,
});

describe('distanceMeters', () => {
  it('matches the known London–Paris great-circle distance', () => {
    // ~343.5 km; allow a kilometre either way for the earth-radius constant.
    expect(distanceMeters(LONDON, PARIS) / 1000).toBeCloseTo(343.5, 0);
  });

  it('is zero for a point against itself, and symmetric', () => {
    expect(distanceMeters(LONDON, LONDON)).toBe(0);
    expect(distanceMeters(LONDON, PARIS)).toBeCloseTo(distanceMeters(PARIS, LONDON), 6);
  });

  it('handles the antimeridian without going the long way round', () => {
    const a = { lat: 0, lon: 179.9 };
    const b = { lat: 0, lon: -179.9 };
    // 0.2 degrees at the equator is about 22 km, not most of the planet.
    expect(distanceMeters(a, b) / 1000).toBeCloseTo(22.2, 0);
  });
});

describe('bearingDegrees', () => {
  it('reads due north, east, south and west', () => {
    expect(bearingDegrees({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(0, 1);
    expect(bearingDegrees({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90, 1);
    expect(bearingDegrees({ lat: 0, lon: 0 }, { lat: -1, lon: 0 })).toBeCloseTo(180, 1);
    expect(bearingDegrees({ lat: 0, lon: 0 }, { lat: 0, lon: -1 })).toBeCloseTo(270, 1);
  });

  it('never returns a negative bearing', () => {
    for (const lon of [-1, -0.5, -179]) {
      expect(bearingDegrees({ lat: 0, lon: 0 }, { lat: 0, lon })).toBeGreaterThanOrEqual(0);
    }
  });

  it('names the compass point, wrapping 350 back to north', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(90)).toBe('E');
    expect(compassPoint(225)).toBe('SW');
    expect(compassPoint(350)).toBe('N');
    expect(compassPoint(-90)).toBe('W');
  });
});

describe('Web Mercator projection', () => {
  it('puts the origin at the centre of the unit square', () => {
    const p = projectUnit({ lat: 0, lon: 0 });
    expect(p.x).toBeCloseTo(0.5, 9);
    expect(p.y).toBeCloseTo(0.5, 9);
  });

  it('round-trips a coordinate', () => {
    const back = unprojectUnit(projectUnit(LONDON));
    expect(back.lat).toBeCloseTo(LONDON.lat, 8);
    expect(back.lon).toBeCloseTo(LONDON.lon, 8);
  });

  it('clamps the poles instead of projecting to infinity', () => {
    for (const lat of [90, -90, 89.999]) {
      const p = projectUnit({ lat, lon: 0 });
      expect(Number.isFinite(p.y)).toBe(true);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
  });

  it('puts north above south on the canvas', () => {
    expect(projectUnit({ lat: 60, lon: 0 }).y).toBeLessThan(projectUnit({ lat: 10, lon: 0 }).y);
  });
});

describe('fitViewport', () => {
  const bounds = { north: 51.52, south: 51.5, east: -0.1, west: -0.14 };

  it('keeps every corner inside the canvas', () => {
    const vp = fitViewport(bounds, 300, 200);
    for (const lat of [bounds.north, bounds.south]) {
      for (const lon of [bounds.east, bounds.west]) {
        const p = vp.project({ lat, lon });
        expect(p.x).toBeGreaterThanOrEqual(-0.001);
        expect(p.x).toBeLessThanOrEqual(300.001);
        expect(p.y).toBeGreaterThanOrEqual(-0.001);
        expect(p.y).toBeLessThanOrEqual(200.001);
      }
    }
  });

  it('does not stretch: equal ground distances stay equal on screen', () => {
    const vp = fitViewport(bounds, 300, 300);
    const origin = { lat: 51.51, lon: -0.12 };
    const north = vp.project(offsetBy(origin, 300, 0));
    const east = vp.project(offsetBy(origin, 300, 90));
    const c = vp.project(origin);
    const dNorth = Math.hypot(north.x - c.x, north.y - c.y);
    const dEast = Math.hypot(east.x - c.x, east.y - c.y);
    expect(dNorth).toBeCloseTo(dEast, 0);
  });

  it('survives a single point without dividing by zero', () => {
    const b = padBounds(boundsOf([LONDON])!, 0.2);
    const vp = fitViewport(b, 300, 200);
    const p = vp.project(LONDON);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    expect(p.x).toBeCloseTo(150, 0);
    expect(p.y).toBeCloseTo(100, 0);
  });

  it('reports a plausible scale', () => {
    const vp = fitViewport(bounds, 300, 300);
    // The box is a couple of kilometres across, shown 300px wide.
    expect(vp.metersPerPixel).toBeGreaterThan(1);
    expect(vp.metersPerPixel).toBeLessThan(50);
  });
});

describe('offsetBy', () => {
  it('lands the requested distance away in the requested direction', () => {
    const p = offsetBy(LONDON, 500, 90);
    expect(distanceMeters(LONDON, p)).toBeCloseTo(500, 0);
    expect(bearingDegrees(LONDON, p)).toBeCloseTo(90, 1);
    expect(p.lon).toBeGreaterThan(LONDON.lon);
  });

  it('wraps longitude across the antimeridian rather than exceeding 180', () => {
    const p = offsetBy({ lat: 0, lon: 179.999 }, 5000, 90);
    expect(p.lon).toBeGreaterThanOrEqual(-180);
    expect(p.lon).toBeLessThanOrEqual(180);
    expect(p.lon).toBeLessThan(0);
  });
});

describe('formatDistance', () => {
  it('switches unit at a sensible threshold', () => {
    expect(formatDistance(120, 'metric')).toBe('120 m');
    expect(formatDistance(2400, 'metric')).toBe('2.4 km');
    expect(formatDistance(24000, 'metric')).toBe('24 km');
  });

  it('does the same in feet and miles', () => {
    expect(formatDistance(60, 'imperial')).toBe('200 ft');
    expect(formatDistance(3200, 'imperial')).toBe('2.0 mi');
  });
});

describe('evaluateCheckIn', () => {
  const now = new Date('2026-09-17T12:00:00Z');
  const atTheDoor = { lat: LONDON.lat, lon: LONDON.lon };

  it('pays the full rarity value for a first claim', () => {
    const r = evaluateCheckIn(gym({ kind: 'strength' }), atTheDoor, undefined, now);
    expect(r).toEqual({ ok: true, points: 100, first: true });
  });

  it('refuses a claim from too far away, and says how far', () => {
    const far = offsetBy(LONDON, CLAIM_RADIUS_M + 400, 45);
    const r = evaluateCheckIn(gym(), far, undefined, now);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('too_far');
      expect(r.distanceMeters).toBeGreaterThan(CLAIM_RADIUS_M);
    }
  });

  it('allows a claim from just inside the radius', () => {
    const close = offsetBy(LONDON, CLAIM_RADIUS_M - 10, 200);
    expect(evaluateCheckIn(gym(), close, undefined, now).ok).toBe(true);
  });

  it('distinguishes "we do not know where you are" from "you are not there"', () => {
    const r = evaluateCheckIn(gym(), null, undefined, now);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('no_location');
      expect(r.distanceMeters).toBeNull();
    }
  });

  it('holds a return visit behind the cooldown, then pays a small amount', () => {
    const claim: Claim = {
      gymId: 'g1',
      claimedAt: '2026-09-17T09:00:00Z',
      visits: ['2026-09-17T09:00:00Z'],
      pointsEarned: 10,
    };
    const blocked = evaluateCheckIn(gym(), atTheDoor, claim, now);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok && blocked.reason === 'cooldown') expect(blocked.hoursRemaining).toBe(3);

    const later = new Date('2026-09-17T20:00:00Z');
    const allowed = evaluateCheckIn(gym(), atTheDoor, claim, later);
    expect(allowed).toEqual({ ok: true, points: 2, first: false });
  });

  it('never pays a repeat visit more than a first claim', () => {
    const claim: Claim = { gymId: 'g1', claimedAt: '2026-01-01T00:00:00Z', visits: ['2026-01-01T00:00:00Z'], pointsEarned: 10 };
    const repeat = evaluateCheckIn(gym({ kind: 'commercial' }), atTheDoor, claim, now);
    const first = evaluateCheckIn(gym({ kind: 'commercial' }), atTheDoor, undefined, now);
    if (repeat.ok && first.ok) expect(repeat.points).toBeLessThan(first.points);
  });
});

describe('rarity and points', () => {
  it('scores a rare kind above a common one regardless of distance', () => {
    expect(claimPoints({ kind: 'strength' })).toBeGreaterThan(claimPoints({ kind: 'commercial' }));
    expect(rarityOf({ kind: 'outdoor' })).toBe('rare');
  });
});

describe('summariseCollection', () => {
  const gyms: Record<string, Gym> = {
    a: gym({ id: 'a', kind: 'commercial' }),
    b: gym({ id: 'b', kind: 'strength' }),
    c: gym({ id: 'c', kind: 'outdoor' }),
  };
  const claim = (id: string, points: number, visits = 1): Claim => ({
    gymId: id,
    claimedAt: '2026-09-01T00:00:00Z',
    visits: Array.from({ length: visits }, () => '2026-09-01T00:00:00Z'),
    pointsEarned: points,
  });

  it('totals points and counts by rarity', () => {
    const s = summariseCollection([claim('a', 10), claim('b', 100), claim('c', 50)], gyms);
    expect(s.points).toBe(160);
    expect(s.claimed).toBe(3);
    expect(s.byRarity).toEqual({ common: 1, uncommon: 0, rare: 1, legendary: 1 });
  });

  it('assigns a tier and progress toward the next', () => {
    const s = summariseCollection([claim('b', 100)], gyms);
    expect(s.tier.key).toBe('regular');
    expect(s.nextTier?.key).toBe('scout');
    expect(s.progress).toBeCloseTo((100 - 60) / (200 - 60), 5);
  });

  it('caps progress at the top tier instead of overflowing', () => {
    const s = summariseCollection([claim('b', 99999)], gyms);
    expect(s.nextTier).toBeNull();
    expect(s.progress).toBe(1);
  });

  it('suggests missing kinds rarest first', () => {
    const s = summariseCollection([claim('a', 10)], gyms);
    expect(s.missingKinds).not.toContain('commercial');
    expect(s.missingKinds[0]).toBe('strength');
  });

  it('ignores a claim whose gym is no longer in the data', () => {
    const s = summariseCollection([claim('a', 10), claim('ghost', 25)], gyms);
    expect(s.points).toBe(35);
    expect(s.byRarity.common).toBe(1);
  });

  it('starts everyone somewhere rather than at no tier', () => {
    const s = summariseCollection([], gyms);
    expect(s.tier.key).toBe('local');
    expect(s.points).toBe(0);
  });
});

describe('nearbyGyms', () => {
  const near = gym({ id: 'near', name: 'Near', lat: LONDON.lat + 0.001, lon: LONDON.lon });
  const far = gym({ id: 'far', name: 'Far', lat: LONDON.lat + 0.05, lon: LONDON.lon });

  it('sorts by distance and marks what is already claimed', () => {
    const rows = nearbyGyms([far, near], LONDON, new Set(['far']));
    expect(rows.map((r) => r.id)).toEqual(['near', 'far']);
    expect(rows[1].claimed).toBe(true);
  });

  it('does not promote unclaimed gyms above closer claimed ones', () => {
    const rows = nearbyGyms([far, near], LONDON, new Set(['near']));
    expect(rows[0].id).toBe('near');
  });

  it('degrades to a stable alphabetical list with no location', () => {
    const rows = nearbyGyms([far, near], null, new Set());
    expect(rows.map((r) => r.name)).toEqual(['Far', 'Near']);
  });
});

describe('claimableNow', () => {
  it('returns the closest gym inside the radius, or null', () => {
    const a = gym({ id: 'a', lat: LONDON.lat, lon: LONDON.lon });
    const b = gym({ id: 'b', ...offsetBy(LONDON, 50, 0) });
    expect(claimableNow([b, a], LONDON)?.id).toBe('a');
    expect(claimableNow([gym({ ...offsetBy(LONDON, 5000, 0) })], LONDON)).toBeNull();
    expect(claimableNow([a], null)).toBeNull();
  });
});

describe('demo gym provider', () => {
  const HERE = { lat: 51.5074, lon: -0.1278 };

  it('keeps venues in the same place when the user walks', async () => {
    const a = await demoGymProvider.search(HERE, 20000);
    // ~350 m north-east: far enough to matter, inside the same grid cell.
    const b = await demoGymProvider.search({ lat: HERE.lat + 0.002, lon: HERE.lon + 0.002 }, 20000);

    const byId = Object.fromEntries(b.gyms.map((g) => [g.id, g]));
    expect(a.gyms.length).toBeGreaterThan(0);
    for (const g of a.gyms) {
      const moved = byId[g.id];
      expect(moved).toBeDefined();
      expect(distanceMeters(g, moved!)).toBeLessThan(1);
    }
  });

  it('lets you actually get close enough to claim one', async () => {
    const { gyms } = await demoGymProvider.search(HERE, 20000);
    const target = gyms[0];
    const atTheDoor = { lat: target.lat, lon: target.lon };
    // Standing on it must be claimable — with venues pinned to the live
    // position this was impossible, because they moved with you.
    expect(evaluateCheckIn(target, atTheDoor, undefined, new Date()).ok).toBe(true);
  });

  it('honours the search radius from where the user is', async () => {
    const near = await demoGymProvider.search(HERE, 700);
    const far = await demoGymProvider.search(HERE, 20000);
    expect(near.gyms.length).toBeLessThan(far.gyms.length);
    for (const g of near.gyms) expect(distanceMeters(HERE, g)).toBeLessThanOrEqual(700);
  });

  it('marks itself as sample data and invents its names', async () => {
    const r = await demoGymProvider.search(HERE, 20000);
    expect(r.sample).toBe(true);
    expect(r.features).toEqual([]);
    expect(r.gyms.every((g) => g.name.length > 0)).toBe(true);
  });
});

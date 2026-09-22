import {
  DEFAULT_LIFE_KM,
  defaultFor,
  orderGear,
  totalsFor,
  wearBand,
  type Gear,
  type GearUse,
} from '../domain/gear';

const shoes = (over: Partial<Gear> = {}): Gear => ({
  id: 'g1', kind: 'shoes', name: 'Pegasus', types: ['run'], addedOn: '2026-01-01',
  startingM: 0, retireAtM: 650_000, ...over,
});

const use = (gearId: string, date: string, km: number): GearUse => ({
  gearId, activityId: `a-${date}`, date, distanceM: km * 1000,
});

describe('totalsFor', () => {
  it('sums the distance logged against it', () => {
    const t = totalsFor(shoes(), [use('g1', '2026-02-01', 10), use('g1', '2026-02-03', 15)], '2026-02-04');
    expect(t.totalM).toBe(25_000);
    expect(t.activities).toBe(2);
  });

  it('includes distance the gear already had when it was added', () => {
    const t = totalsFor(shoes({ startingM: 200_000 }), [use('g1', '2026-02-01', 10)], '2026-02-02');
    expect(t.totalM).toBe(210_000);
  });

  it('ignores uses of other gear', () => {
    const t = totalsFor(shoes(), [use('g1', '2026-02-01', 10), use('g2', '2026-02-02', 50)], '2026-02-03');
    expect(t.totalM).toBe(10_000);
  });

  it('reports wear against the figure that was set', () => {
    const t = totalsFor(shoes(), [use('g1', '2026-02-01', 325)], '2026-02-02');
    expect(t.wear).toBeCloseTo(0.5, 3);
  });

  it('has no wear when no retirement figure was set', () => {
    const t = totalsFor(shoes({ retireAtM: null }), [use('g1', '2026-02-01', 500)], '2026-02-02');
    expect(t.wear).toBeNull();
    expect(t.note).toMatch(/nothing here will nag/i);
  });

  it('calls a figure an estimate rather than an expiry', () => {
    const t = totalsFor(shoes(), [use('g1', '2026-02-01', 700)], '2026-02-02');
    expect(t.note).toMatch(/estimate, not an expiry/i);
  });

  it('suggests overlapping the next pair rather than switching in a day', () => {
    const t = totalsFor(shoes(), [use('g1', '2026-02-01', 580)], '2026-02-02');
    expect(t.note).toMatch(/break in the next pair/i);
  });

  it('notes gear that has not been used in months', () => {
    const t = totalsFor(shoes({ retireAtM: null }), [use('g1', '2026-01-02', 10)], '2026-09-01');
    expect(t.note).toMatch(/not used in \d+ months/i);
  });

  it('handles gear with nothing logged against it at all', () => {
    const t = totalsFor(shoes(), [], '2026-02-02');
    expect(t.totalM).toBe(0);
    expect(t.lastUsed).toBeNull();
    expect(t.note).toMatch(/nothing logged/i);
  });

  it('says so plainly once retired', () => {
    const t = totalsFor(shoes({ retiredOn: '2026-05-01' }), [use('g1', '2026-02-01', 10)], '2026-06-01');
    expect(t.note).toMatch(/retired on 2026-05-01/i);
  });
});

describe('wearBand', () => {
  it('bands the life of a shoe', () => {
    expect(wearBand(0.2)).toBe('fresh');
    expect(wearBand(0.6)).toBe('worn');
    expect(wearBand(0.9)).toBe('due');
    expect(wearBand(1.4)).toBe('past');
  });

  it('treats no figure as nothing to worry about', () => {
    expect(wearBand(null)).toBe('fresh');
  });
});

describe('defaultFor', () => {
  const road = shoes({ id: 'road', name: 'Road', isDefault: true });
  const trail = shoes({ id: 'trail', name: 'Trail' });

  it('picks the one marked default', () => {
    expect(defaultFor('run', [road, trail])!.id).toBe('road');
  });

  it('picks the only candidate when there is exactly one', () => {
    expect(defaultFor('run', [trail])!.id).toBe('trail');
  });

  it('refuses to guess between two with no default', () => {
    // Mileage on the wrong shoe is worse than no mileage at all.
    expect(defaultFor('run', [trail, shoes({ id: 'other', name: 'Other' })])).toBeNull();
  });

  it('ignores retired gear', () => {
    expect(defaultFor('run', [shoes({ id: 'old', retiredOn: '2026-01-01' })])).toBeNull();
  });

  it('ignores gear for a different sport', () => {
    expect(defaultFor('ride', [road, trail])).toBeNull();
  });
});

describe('orderGear', () => {
  it('puts the most recently used first and retired last', () => {
    const a = shoes({ id: 'a', name: 'A' });
    const b = shoes({ id: 'b', name: 'B' });
    const old = shoes({ id: 'old', name: 'Old', retiredOn: '2026-01-01' });
    const uses = [use('a', '2026-02-01', 5), use('b', '2026-05-01', 5), use('old', '2026-06-01', 5)];
    expect(orderGear([a, old, b], uses, '2026-06-02').map((t) => t.gear.id)).toEqual(['b', 'a', 'old']);
  });

  it('falls back to name for gear never used', () => {
    const z = shoes({ id: 'z', name: 'Zeta' });
    const a = shoes({ id: 'a', name: 'Alpha' });
    expect(orderGear([z, a], [], '2026-06-02').map((t) => t.gear.name)).toEqual(['Alpha', 'Zeta']);
  });
});

describe('defaults', () => {
  it('gives shoes a life and a bike none', () => {
    expect(DEFAULT_LIFE_KM.shoes).toBeGreaterThan(300);
    expect(DEFAULT_LIFE_KM.bike).toBeNull();
  });
});

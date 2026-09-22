import {
  DEFAULT_RADIUS_M,
  describeEffect,
  insideAnyZone,
  startIsProtected,
  trimToZones,
  visiblePoints,
  type PrivacyZone,
} from '../domain/privacy';
import { offsetBy } from '../domain/geo';

const HOME = { lat: 51.5, lon: -0.12 };
const zone: PrivacyZone = { id: 'z1', label: 'Home', center: HOME, radiusM: 400 };

/** A straight line of points heading north from an origin, one every 50 m. */
function line(from: { lat: number; lon: number }, count: number, stepM = 50, bearing = 0) {
  const out = [from];
  for (let i = 1; i < count; i++) out.push(offsetBy(out[i - 1]!, stepM, bearing));
  return out;
}

describe('insideAnyZone', () => {
  it('is true at the centre and false well outside', () => {
    expect(insideAnyZone(HOME, [zone])).toBe(true);
    expect(insideAnyZone(offsetBy(HOME, 2000, 0), [zone])).toBe(false);
  });

  it('includes the boundary', () => {
    expect(insideAnyZone(offsetBy(HOME, 399, 90), [zone])).toBe(true);
    expect(insideAnyZone(offsetBy(HOME, 401, 90), [zone])).toBe(false);
  });

  it('is false with no zones at all', () => {
    expect(insideAnyZone(HOME, [])).toBe(false);
  });

  it('checks every zone, not just the first', () => {
    const office: PrivacyZone = { id: 'z2', label: 'Office', center: offsetBy(HOME, 5000, 90), radiusM: 300 };
    expect(insideAnyZone(office.center, [zone, office])).toBe(true);
  });
});

describe('trimToZones', () => {
  it('removes the start of a route that begins at home', () => {
    const route = line(HOME, 40);
    const pieces = trimToZones(route, [zone]);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]!.length).toBeLessThan(route.length);
    // Nothing that survives may be inside the zone.
    for (const p of pieces[0]!) expect(insideAnyZone(p, [zone])).toBe(false);
  });

  it('removes both ends of an out-and-back from home', () => {
    const out = line(HOME, 30);
    const back = [...out].reverse();
    const pieces = trimToZones([...out, ...back], [zone]);
    expect(pieces).toHaveLength(1);
    for (const p of pieces[0]!) expect(insideAnyZone(p, [zone])).toBe(false);
  });

  it('splits into separate lines when a route passes back through home', () => {
    // Out north, back to home, out east again: the two halves must not be
    // joined by a line straight through the thing being hidden. This is the
    // single most common way this feature is got wrong.
    const out = line(HOME, 30);
    const back = [...out].reverse();
    const second = line(HOME, 30, 50, 90);
    const pieces = trimToZones([...out, ...back, ...second], [zone]);
    expect(pieces.length).toBe(2);
    for (const piece of pieces) {
      for (const p of piece) expect(insideAnyZone(p, [zone])).toBe(false);
    }
  });

  it('leaves a route that never goes near a zone completely alone', () => {
    const away = line(offsetBy(HOME, 8000, 90), 20);
    expect(trimToZones(away, [zone])).toEqual([away]);
  });

  it('returns nothing when the whole route is inside', () => {
    const tiny = line(HOME, 4, 20);
    expect(trimToZones(tiny, [zone])).toEqual([]);
  });

  it('passes everything through when there are no zones', () => {
    const route = line(HOME, 10);
    expect(trimToZones(route, [])).toEqual([route]);
    expect(trimToZones([], [])).toEqual([]);
  });

  it('drops a surviving run of a single point rather than drawing a dot', () => {
    // One point between two zones is not a line and should not become one.
    const other: PrivacyZone = { id: 'z2', label: 'B', center: offsetBy(HOME, 500, 0), radiusM: 60 };
    const route = [HOME, offsetBy(HOME, 440, 0), offsetBy(HOME, 500, 0)];
    for (const piece of trimToZones(route, [zone, other])) {
      expect(piece.length).toBeGreaterThan(1);
    }
  });

  it('keeps the extra fields on the points it keeps', () => {
    const route = line(HOME, 40).map((p, i) => ({ ...p, t: i * 1000, hr: 150 }));
    const kept = visiblePoints(route, [zone]);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept[0]!.hr).toBe(150);
    expect(typeof kept[0]!.t).toBe('number');
  });
});

describe('describeEffect', () => {
  it('says nothing is hidden when nothing is', () => {
    const away = line(offsetBy(HOME, 8000, 90), 20);
    const effect = describeEffect(away, [zone]);
    expect(effect.hidden).toBe(0);
    expect(effect.note).toMatch(/none of this route/i);
  });

  it('counts what was removed and promises the numbers are unchanged', () => {
    const effect = describeEffect(line(HOME, 40), [zone]);
    expect(effect.hidden).toBeGreaterThan(0);
    expect(effect.fullyHidden).toBe(false);
    expect(effect.note).toMatch(/unchanged/i);
  });

  it('flags a route hidden entirely, and says the numbers still count', () => {
    const effect = describeEffect(line(HOME, 4, 20), [zone]);
    expect(effect.fullyHidden).toBe(true);
    expect(effect.note).toMatch(/still counted/i);
  });

  it('mentions the split when a route is cut into pieces', () => {
    const out = line(HOME, 30);
    const route = [...out, ...[...out].reverse(), ...line(HOME, 30, 50, 90)];
    expect(describeEffect(route, [zone]).note).toMatch(/separate lines/i);
  });

  it('handles an empty route', () => {
    expect(describeEffect([], [zone]).note).toMatch(/nothing to hide/i);
  });
});

describe('startIsProtected', () => {
  it('is true when the route begins inside a zone', () => {
    expect(startIsProtected(line(HOME, 10).map((p, i) => ({ ...p, t: i })), [zone])).toBe(true);
  });

  it('is false when it begins somewhere else entirely', () => {
    const elsewhere = line(offsetBy(HOME, 6000, 180), 10).map((p, i) => ({ ...p, t: i }));
    expect(startIsProtected(elsewhere, [zone])).toBe(false);
  });

  it('is false for an empty route rather than throwing', () => {
    expect(startIsProtected([], [zone])).toBe(false);
  });

  it('defaults to a radius that actually covers a street', () => {
    expect(DEFAULT_RADIUS_M).toBeGreaterThanOrEqual(200);
  });
});

import {
  HR_ZONES,
  PACE_ZONES,
  estimatedMaxHr,
  paceZoneFor,
  relativeEffort,
  timeInZones,
  zoneFor,
  zoneSetup,
} from '../domain/zones';
import type { TrackPoint } from '../domain/track';

const setup = { maxHr: 190, basis: 'measured' as const };

function hrTrace(beats: number[], stepMs = 1000): TrackPoint[] {
  return beats.map((hr, i) => ({ lat: 51 + i * 0.0001, lon: -0.1, t: i * stepMs, hr, acc: 5 }));
}

describe('zoneSetup', () => {
  it('prefers a measured maximum over the formula', () => {
    expect(zoneSetup({ measuredMaxHr: 201, age: 40 })).toEqual({ maxHr: 201, basis: 'measured' });
  });

  it('falls back to the formula and flags it', () => {
    expect(zoneSetup({ age: 40 })).toEqual({ maxHr: 180, basis: 'estimated' });
  });

  it('refuses rather than inventing a maximum from nothing', () => {
    expect(zoneSetup({})).toBeNull();
    expect(zoneSetup({ measuredMaxHr: null, age: null })).toBeNull();
  });

  it('ignores an implausible measured maximum', () => {
    expect(zoneSetup({ measuredMaxHr: 60, age: 30 })!.basis).toBe('estimated');
  });

  it('clamps the formula at absurd ages', () => {
    expect(estimatedMaxHr(200)).toBe(120);
    expect(estimatedMaxHr(1)).toBe(210);
  });
});

describe('zoneFor', () => {
  it('places beats in the right zone', () => {
    expect(zoneFor(100, setup)!.label).toBe('Recovery');
    expect(zoneFor(124, setup)!.label).toBe('Endurance');
    expect(zoneFor(142, setup)!.label).toBe('Tempo');
    expect(zoneFor(161, setup)!.label).toBe('Threshold');
    expect(zoneFor(180, setup)!.label).toBe('Maximum');
  });

  it('puts a reading above maximum in the top zone rather than nowhere', () => {
    expect(zoneFor(205, setup)!.index).toBe(5);
  });

  it('returns null below the first zone and for nonsense', () => {
    expect(zoneFor(70, setup)).toBeNull();
    expect(zoneFor(0, setup)).toBeNull();
    expect(zoneFor(Number.NaN, setup)).toBeNull();
  });

  it('has five contiguous zones', () => {
    expect(HR_ZONES).toHaveLength(5);
    for (let i = 1; i < HR_ZONES.length; i++) {
      expect(HR_ZONES[i]!.from).toBeCloseTo(HR_ZONES[i - 1]!.to, 5);
    }
  });
});

describe('timeInZones', () => {
  it('attributes seconds to the zone the interval ended in', () => {
    const times = timeInZones(hrTrace(new Array(300).fill(124)), setup);
    const endurance = times.find((t) => t.zone.label === 'Endurance')!;
    expect(endurance.seconds).toBeCloseTo(299, 0);
    expect(endurance.share).toBeCloseTo(1, 2);
  });

  it('uses elapsed time, not a count of samples', () => {
    // Ten-second sampling: five samples is forty seconds of interval, not five.
    const times = timeInZones(hrTrace(new Array(5).fill(124), 10_000), setup);
    expect(times.find((t) => t.zone.label === 'Endurance')!.seconds).toBe(40);
  });

  it('does not credit a dropout as time in zone', () => {
    const points: TrackPoint[] = [
      { lat: 51, lon: -0.1, t: 0, hr: 150 },
      { lat: 51.001, lon: -0.1, t: 10_000, hr: 150 },
      // Five-minute gap: the strap fell off.
      { lat: 51.002, lon: -0.1, t: 310_000, hr: 150 },
    ];
    const total = timeInZones(points, setup).reduce((a, z) => a + z.seconds, 0);
    expect(total).toBe(10);
  });

  it('splits time across zones for an interval session', () => {
    const times = timeInZones(hrTrace([...new Array(200).fill(124), ...new Array(200).fill(175)]), setup);
    expect(times.find((t) => t.zone.label === 'Endurance')!.seconds).toBeGreaterThan(150);
    expect(times.find((t) => t.zone.label === 'Maximum')!.seconds).toBeGreaterThan(150);
  });

  it('returns all five zones at zero for a trace with no heart rate', () => {
    const times = timeInZones([{ lat: 51, lon: -0.1, t: 0 }], setup);
    expect(times).toHaveLength(5);
    expect(times.every((t) => t.seconds === 0 && t.share === 0)).toBe(true);
  });
});

describe('relativeEffort', () => {
  it('refuses a session too short to score', () => {
    expect(relativeEffort(timeInZones(hrTrace(new Array(30).fill(150)), setup), 'measured')).toBeNull();
  });

  it('scores a hard hour above an easy one of the same length', () => {
    const easy = relativeEffort(timeInZones(hrTrace(new Array(3600).fill(124)), setup), 'measured')!;
    const hard = relativeEffort(timeInZones(hrTrace(new Array(3600).fill(175)), setup), 'measured')!;
    expect(hard.score).toBeGreaterThan(easy.score * 3);
  });

  it('names the zone that took the most time', () => {
    const effort = relativeEffort(
      timeInZones(hrTrace([...new Array(600).fill(124), ...new Array(200).fill(175)]), setup),
      'measured',
    )!;
    expect(effort.dominant.label).toBe('Endurance');
  });

  it('warns when the zones came from the formula', () => {
    const estimated = relativeEffort(timeInZones(hrTrace(new Array(600).fill(150)), setup), 'estimated')!;
    expect(estimated.note).toMatch(/220/);
    const measured = relativeEffort(timeInZones(hrTrace(new Array(600).fill(150)), setup), 'measured')!;
    expect(measured.note).not.toMatch(/220/);
  });

  it('reports duration in whole minutes', () => {
    const effort = relativeEffort(timeInZones(hrTrace(new Array(601).fill(150)), setup), 'measured')!;
    expect(effort.minutes).toBe(10);
  });
});

describe('paceZoneFor', () => {
  it('places a pace against a threshold', () => {
    expect(paceZoneFor(300, 300)!.label).toBe('Threshold');
    expect(paceZoneFor(360, 300)!.label).toBe('Easy');
    expect(paceZoneFor(420, 300)!.label).toBe('Recovery');
    expect(paceZoneFor(280, 300)!.label).toBe('Interval');
    expect(paceZoneFor(240, 300)!.label).toBe('Repetition');
  });

  it('refuses without a threshold to measure against', () => {
    expect(paceZoneFor(300, 0)).toBeNull();
    expect(paceZoneFor(0, 300)).toBeNull();
  });

  it('runs slowest to fastest', () => {
    for (let i = 1; i < PACE_ZONES.length; i++) {
      expect(PACE_ZONES[i]!.to).toBeLessThanOrEqual(PACE_ZONES[i - 1]!.from + 0.001);
    }
  });
});

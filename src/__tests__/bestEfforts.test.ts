import {
  EFFORT_DISTANCES,
  allTimeBests,
  bestEffortsIn,
  effortDistancesFor,
  historyFor,
  standingOf,
  type BestEffort,
  type EffortRecord,
} from '../domain/bestEfforts';
import { KM } from '../domain/track';
import type { TrackPoint } from '../domain/track';

const METERS_PER_DEG_LAT = 111_194.9;

/** A trace with a per-metre pace that can vary along the way. */
function paced(legs: { meters: number; secPerKm: number }[], t0 = 1_700_000_000_000): TrackPoint[] {
  const out: TrackPoint[] = [{ lat: 51, lon: -0.1, t: t0, acc: 5 }];
  let lat = 51;
  let t = t0;
  for (const leg of legs) {
    const steps = Math.max(1, Math.round(leg.meters / 10));
    for (let i = 0; i < steps; i++) {
      lat += 10 / METERS_PER_DEG_LAT;
      t += (10 / KM) * leg.secPerKm * 1000;
      out.push({ lat, lon: -0.1, t, acc: 5 });
    }
  }
  return out;
}

describe('bestEffortsIn', () => {
  it('finds a kilometre at the pace it was run', () => {
    const efforts = bestEffortsIn(paced([{ meters: 2000, secPerKm: 300 }]));
    const oneK = efforts.find((e) => e.key === '1k')!;
    expect(oneK.seconds).toBeCloseTo(300, 0);
  });

  it('finds the fast kilometre even when it starts mid-split', () => {
    // Slow 600 m, a hard kilometre, then slow again. The fastest *split*
    // would straddle the surge; the fastest window should find it whole.
    const t = paced([
      { meters: 600, secPerKm: 360 },
      { meters: 1000, secPerKm: 240 },
      { meters: 900, secPerKm: 360 },
    ]);
    const oneK = bestEffortsIn(t).find((e) => e.key === '1k')!;
    expect(oneK.seconds).toBeCloseTo(240, 0);
  });

  it('offers nothing longer than the activity', () => {
    const efforts = bestEffortsIn(paced([{ meters: 3000, secPerKm: 300 }]));
    expect(efforts.some((e) => e.key === '5k')).toBe(false);
    expect(efforts.some((e) => e.key === '1k')).toBe(true);
  });

  it('returns nothing for a trace with no distance', () => {
    expect(bestEffortsIn([])).toEqual([]);
    expect(bestEffortsIn([{ lat: 51, lon: -0.1, t: 0 }])).toEqual([]);
  });

  it('is monotonic: longer distances are never faster in total', () => {
    const efforts = bestEffortsIn(paced([{ meters: 6000, secPerKm: 300 }]));
    const oneK = efforts.find((e) => e.key === '1k')!;
    const fiveK = efforts.find((e) => e.key === '5k')!;
    expect(fiveK.seconds).toBeGreaterThan(oneK.seconds);
  });

  it('reports where in the trace the effort sat', () => {
    const t = paced([
      { meters: 1500, secPerKm: 400 },
      { meters: 1000, secPerKm: 220 },
    ]);
    const oneK = bestEffortsIn(t).find((e) => e.key === '1k')!;
    expect(oneK.startIndex).toBeGreaterThan(100);
    expect(oneK.endIndex).toBeGreaterThan(oneK.startIndex);
  });
});

describe('effortDistancesFor', () => {
  it('shows miles to imperial users and kilometres to metric ones', () => {
    const imperial = effortDistancesFor('imperial').map((d) => d.key);
    expect(imperial).toContain('10mi');
    expect(imperial).not.toContain('400m');

    const metric = effortDistancesFor('metric').map((d) => d.key);
    expect(metric).toContain('1k');
    expect(metric).not.toContain('halfmile');
  });

  it('shows the shared distances to everyone', () => {
    for (const units of ['imperial', 'metric'] as const) {
      expect(effortDistancesFor(units).map((d) => d.key)).toContain('marathon');
    }
  });

  it('keeps the catalog ordered shortest to longest', () => {
    const meters = EFFORT_DISTANCES.map((d) => d.meters);
    expect([...meters].sort((a, b) => a - b)).toEqual(meters);
  });
});

describe('allTimeBests', () => {
  const effort = (key: string, seconds: number): BestEffort => ({
    key, label: key, meters: 1000, seconds, startIndex: 0, endIndex: 1,
  });

  it('keeps the fastest of each distance', () => {
    const bests = allTimeBests([
      { id: 'a', name: 'Monday', date: '2026-01-05', efforts: [effort('1k', 300)] },
      { id: 'b', name: 'Friday', date: '2026-01-09', efforts: [effort('1k', 280)] },
    ]);
    expect(bests).toHaveLength(1);
    expect(bests[0]!.seconds).toBe(280);
    expect(bests[0]!.activityName).toBe('Friday');
  });

  it('gives a tie to the day it first happened', () => {
    const bests = allTimeBests([
      { id: 'a', name: 'March', date: '2026-03-01', efforts: [effort('1k', 280)] },
      { id: 'b', name: 'October', date: '2026-10-01', efforts: [effort('1k', 280)] },
    ]);
    expect(bests[0]!.date).toBe('2026-03-01');
  });

  it('returns the board in catalog order, not insertion order', () => {
    const bests = allTimeBests([
      { id: 'a', name: 'x', date: '2026-01-01', efforts: [effort('5k', 1500), effort('1k', 280)] },
    ]);
    expect(bests.map((b) => b.key)).toEqual(['1k', '5k']);
  });

  it('is empty when nothing has been recorded', () => {
    expect(allTimeBests([])).toEqual([]);
  });
});

describe('historyFor and standingOf', () => {
  const rec = (date: string, seconds: number): EffortRecord => ({
    key: '1k', label: '1 km', meters: 1000, seconds, startIndex: 0, endIndex: 1,
    activityId: date, activityName: 'Run', date,
  });

  it('returns one distance fastest first', () => {
    const history = historyFor('1k', [
      { id: 'a', name: 'r', date: '2026-01-01', efforts: [rec('2026-01-01', 300)] },
      { id: 'b', name: 'r', date: '2026-02-01', efforts: [rec('2026-02-01', 280)] },
      { id: 'c', name: 'r', date: '2026-03-01', efforts: [{ ...rec('2026-03-01', 100), key: '5k' }] },
    ]);
    expect(history.map((h) => h.seconds)).toEqual([280, 300]);
  });

  it('refuses to rank a distance with only one attempt', () => {
    expect(standingOf(rec('2026-01-01', 300), [rec('2026-01-01', 300)])).toBeNull();
  });

  it('places an effort among its history', () => {
    const history = [rec('a', 270), rec('b', 290), rec('c', 310)];
    const standing = standingOf(rec('d', 295), history)!;
    expect(standing.rank).toBe(3);
    expect(standing.outOf).toBe(3);
    expect(standing.behindBest).toBe(25);
    expect(standing.isBest).toBe(false);
  });

  it('marks a new best as the best', () => {
    const standing = standingOf(rec('d', 260), [rec('a', 270), rec('b', 290)])!;
    expect(standing.rank).toBe(1);
    expect(standing.isBest).toBe(true);
    expect(standing.behindBest).toBe(0);
  });
});

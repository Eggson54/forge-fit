import {
  FATIGUE_EXPONENT,
  RACE_TARGETS,
  predictRaces,
  readGoal,
  riegel,
} from '../domain/predictions';
import type { EffortRecord } from '../domain/bestEfforts';
import { KM } from '../domain/track';

const rec = (key: string, label: string, meters: number, seconds: number, date = '2026-06-01'): EffortRecord => ({
  key, label, meters, seconds, startIndex: 0, endIndex: 1,
  activityId: `a-${key}`, activityName: 'Run', date,
});

const fiveK = rec('5k', '5 km', 5 * KM, 1200);
const half = rec('half', 'Half marathon', 21_097.5, 5700);

describe('riegel', () => {
  it('predicts a longer distance as slower per unit', () => {
    const tenK = riegel(1200, 5000, 10_000);
    expect(tenK).toBeGreaterThan(2400);
    expect(tenK).toBeLessThan(2600);
  });

  it('returns the same time for the same distance', () => {
    expect(riegel(1200, 5000, 5000)).toBeCloseTo(1200, 5);
  });

  it('predicts a shorter distance as faster', () => {
    expect(riegel(1200, 5000, 1000)).toBeLessThan(240);
  });

  it('refuses nonsense rather than returning NaN', () => {
    expect(riegel(0, 5000, 10_000)).toBe(0);
    expect(riegel(1200, 0, 10_000)).toBe(0);
    expect(riegel(1200, 5000, 0)).toBe(0);
  });

  it('uses the published exponent', () => {
    expect(FATIGUE_EXPONENT).toBe(1.06);
  });
});

describe('predictRaces', () => {
  it('predicts every target from a single effort', () => {
    const predictions = predictRaces([fiveK], '2026-06-15');
    expect(predictions.map((p) => p.target.key)).toEqual(RACE_TARGETS.map((t) => t.key));
  });

  it('builds each prediction from the closest distance it has', () => {
    const predictions = predictRaces([fiveK, half], '2026-06-15');
    expect(predictions.find((p) => p.target.key === 'marathon')!.fromLabel).toBe('Half marathon');
    expect(predictions.find((p) => p.target.key === '10k')!.fromLabel).toBe('5 km');
  });

  it('is confident about a short extrapolation from recent evidence', () => {
    const p = predictRaces([fiveK], '2026-06-15').find((x) => x.target.key === '10k')!;
    expect(p.confidence).toBe('good');
  });

  it('calls a marathon off a 5 k what it is', () => {
    const p = predictRaces([fiveK], '2026-06-15').find((x) => x.target.key === 'marathon')!;
    expect(p.confidence).toBe('stretch');
    expect(p.extrapolation).toBeGreaterThan(8);
    expect(p.note).toMatch(/without the training/i);
  });

  it('downgrades stale evidence', () => {
    const old = predictRaces([rec('5k', '5 km', 5 * KM, 1200, '2025-01-01')], '2026-06-15');
    expect(old.find((p) => p.target.key === '5k')!.confidence).toBe('stretch');
    expect(old.find((p) => p.target.key === '5k')!.note).toMatch(/months ago/);
  });

  it('ignores efforts too short to predict a race from', () => {
    expect(predictRaces([rec('400m', '400 m', 400, 70)], '2026-06-15')).toEqual([]);
  });

  it('returns nothing when there is nothing to go on', () => {
    expect(predictRaces([], '2026-06-15')).toEqual([]);
  });

  it('prefers longer evidence when two are equally far off', () => {
    // 1 km and 25 km are the same log-distance from 5 km; the longer one is
    // the better basis for a race.
    const predictions = predictRaces(
      [rec('1k', '1 km', KM, 220), rec('25k', '25 km', 25 * KM, 6600)],
      '2026-06-15',
    );
    expect(predictions.find((p) => p.target.key === '5k')!.fromLabel).toBe('25 km');
  });
});

describe('readGoal', () => {
  const predictions = predictRaces([half], '2026-06-15');

  it('counts down to the race', () => {
    const reading = readGoal({ id: 'g', name: 'Autumn marathon', date: '2026-09-01', targetKey: 'marathon' }, predictions, '2026-06-15');
    expect(reading.daysAway).toBe(78);
    expect(reading.headline).toMatch(/78 days/);
  });

  it('measures the gap to a time goal', () => {
    const reading = readGoal(
      { id: 'g', name: 'Marathon', date: '2026-09-01', targetKey: 'marathon', goalSeconds: 10_800 },
      predictions,
      '2026-06-15',
    );
    expect(reading.gap).not.toBeNull();
    expect(reading.headline).toMatch(/of work|inside your goal/);
  });

  it('says so when current shape is already inside the goal', () => {
    const reading = readGoal(
      { id: 'g', name: 'Marathon', date: '2026-09-01', targetKey: 'marathon', goalSeconds: 60_000 },
      predictions,
      '2026-06-15',
    );
    expect(reading.gap!).toBeLessThan(0);
    expect(reading.headline).toMatch(/inside your goal/);
  });

  it('handles a race that has already happened', () => {
    const reading = readGoal({ id: 'g', name: 'Spring 10k', date: '2026-04-01', targetKey: '10k' }, predictions, '2026-06-15');
    expect(reading.daysAway).toBeLessThan(0);
    expect(reading.headline).toMatch(/been and gone/);
  });

  it('admits when it has nothing to predict from', () => {
    const reading = readGoal({ id: 'g', name: 'First 5k', date: '2026-09-01', targetKey: '5k' }, [], '2026-06-15');
    expect(reading.prediction).toBeNull();
    expect(reading.headline).toMatch(/nothing logged/i);
  });
});

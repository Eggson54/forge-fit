import {
  MORE_SCORES_CAVEAT,
  cardioFocus,
  heartRateRecovery,
  projectBodyFat,
  projectComposition,
  sleepNeed,
  stressScore,
} from '../domain/moreScores';
import { addDaysISO } from '../domain/date';
import type { CardioSession } from '../domain/cardio';
import type { SleepLog } from '../domain/types';
import type { VitalsDay } from '../domain/vitals';

const TODAY = '2026-09-21';

describe('stressScore', () => {
  const calm = { hrvZ: 0, rhrZ: 0, reported: 1, sleepRatio: 1 };

  it('reads low when nothing is strained', () => {
    const r = stressScore(calm)!;
    expect(r.band).toBe('low');
    expect(r.headline).toMatch(/nothing the app can see is under strain/i);
  });

  it('rises when HRV is suppressed and resting heart rate is up', () => {
    const strained = stressScore({ hrvZ: -2.2, rhrZ: 2, reported: 4, sleepRatio: 0.7 })!;
    expect(strained.score).toBeGreaterThan(stressScore(calm)!.score + 40);
    expect(strained.band).toBe('high');
  });

  it('knows HRV down is the strained direction and heart rate up is', () => {
    const hrvDown = stressScore({ ...calm, hrvZ: -2 })!.score;
    const hrvUp = stressScore({ ...calm, hrvZ: 2 })!.score;
    const rhrUp = stressScore({ ...calm, rhrZ: 2 })!.score;
    expect(hrvDown).toBeGreaterThan(hrvUp);
    expect(rhrUp).toBeGreaterThan(stressScore(calm)!.score);
  });

  it('drops what it cannot see instead of scoring it as calm', () => {
    const blind = stressScore({ hrvZ: null, rhrZ: null, reported: 5, sleepRatio: null })!;
    expect(blind.parts.map((p) => p.label)).toEqual(['How you rated it']);
    expect(blind.score).toBeGreaterThan(90);
  });

  it('says nothing at all when it knows nothing', () => {
    expect(stressScore({ hrvZ: null, rhrZ: null, reported: null, sleepRatio: null })).toBeNull();
  });

  it('admits it cannot tell training strain from life strain', () => {
    expect(stressScore({ ...calm, hrvZ: -2 })!.headline).toMatch(/cannot tell training strain from life strain/);
  });
});

describe('cardioFocus', () => {
  const session = (date: string, type: CardioSession['type'], minutes: number): CardioSession => ({
    id: `${date}-${type}`, date, type, minutes, source: 'manual', loggedAt: `${date}T08:00:00.000Z`,
  });

  it('calls a mostly-easy month base work', () => {
    const sessions = [
      session(addDaysISO(TODAY, -2), 'walk', 200),
      session(addDaysISO(TODAY, -5), 'hike', 120),
      session(addDaysISO(TODAY, -7), 'run', 40),
    ];
    const r = cardioFocus(sessions, TODAY);
    expect(r.focus).toBe('base');
    expect(r.easyShare).toBeGreaterThan(0.7);
  });

  it('calls a mostly-hard month intensity, without scolding', () => {
    const sessions = [session(addDaysISO(TODAY, -2), 'run', 200), session(addDaysISO(TODAY, -4), 'walk', 30)];
    const r = cardioFocus(sessions, TODAY);
    expect(r.focus).toBe('intensity');
    expect(r.note).toMatch(/a real choice/);
  });

  it('says so when nothing was logged', () => {
    expect(cardioFocus([], TODAY).focus).toBe('none');
  });

  it('ignores sessions outside the window', () => {
    expect(cardioFocus([session('2025-01-01', 'run', 500)], TODAY).focus).toBe('none');
  });

  it('admits the split is by session type, not by effort', () => {
    const r = cardioFocus([session(addDaysISO(TODAY, -1), 'walk', 60)], TODAY);
    expect(r.note).toMatch(/not heart rate/);
  });
});

describe('heartRateRecovery', () => {
  const day = (back: number, rhr: number): VitalsDay => ({
    date: addDaysISO(TODAY, -back), restingHeartRate: rhr, source: 'health',
  });

  it('measures the drop from the window high', () => {
    const days = [day(10, 62), day(9, 64), day(8, 66), day(7, 65), day(6, 63), day(5, 61), day(4, 59), day(3, 58), day(2, 57), day(1, 56), day(0, 55)];
    const r = heartRateRecovery(days, TODAY)!;
    expect(r.from).toBe(66);
    expect(r.to).toBe(55);
    expect(r.drop).toBe(11);
  });

  it('says so plainly when today is the high point', () => {
    const days = Array.from({ length: 10 }, (_, i) => day(9 - i, 55 + i));
    const r = heartRateRecovery(days, TODAY)!;
    expect(r.drop).toBeLessThanOrEqual(0);
    expect(r.note).toMatch(/hard block and on the way into an illness alike/);
  });

  it('refuses without enough days behind it', () => {
    expect(heartRateRecovery([day(1, 60), day(0, 58)], TODAY)).toBeNull();
  });

  it('names itself accurately rather than claiming the clinical measure', () => {
    const days = Array.from({ length: 12 }, (_, i) => day(11 - i, 60 - i * 0.2));
    expect(heartRateRecovery(days, TODAY)!.note).toMatch(/not the one-minute-after-exercise measure/);
  });
});

describe('projectComposition', () => {
  const opts = { label: 'Body fat', unit: '%' };

  it('extends a real trend', () => {
    const series = [
      { date: '2026-07-01', value: 22 },
      { date: '2026-08-01', value: 20.5 },
      { date: '2026-09-01', value: 19 },
    ];
    const p = projectComposition(series, { ...opts, horizonDays: 30 })!;
    expect(p.value).toBeLessThan(19);
    expect(p.perWeek).toBeLessThan(0);
  });

  it('refuses below three readings or three weeks', () => {
    expect(projectComposition([{ date: '2026-09-01', value: 20 }, { date: '2026-09-20', value: 19 }], opts)).toBeNull();
    const bunched = [
      { date: '2026-09-18', value: 22 },
      { date: '2026-09-19', value: 21 },
      { date: '2026-09-20', value: 20 },
    ];
    expect(projectComposition(bunched, opts)).toBeNull();
  });

  it('caps a rate a body could not do', () => {
    // Two points saying four points of body fat a week is the measurement
    // moving, not the person.
    const wild = [
      { date: '2026-08-01', value: 30 },
      { date: '2026-08-15', value: 24 },
      { date: '2026-09-01', value: 18 },
    ];
    expect(Math.abs(projectComposition(wild, opts)!.perWeek)).toBeLessThanOrEqual(0.5);
  });

  it('never projects further than three months', () => {
    const series = [
      { date: '2026-06-01', value: 22 },
      { date: '2026-07-15', value: 21 },
      { date: '2026-09-01', value: 20 },
    ];
    expect(projectComposition(series, { ...opts, horizonDays: 3650 })!.horizonDays).toBe(90);
  });

  it('hedges rather than stating the projection as fact', () => {
    const series = [
      { date: '2026-06-01', value: 24 },
      { date: '2026-07-15', value: 22 },
      { date: '2026-09-01', value: 20 },
    ];
    expect(projectComposition(series, opts)!.note).toMatch(/if the trend holds/);
  });

  it('reads a body-fat series straight from the composition screen', () => {
    const points = [
      { date: '2026-06-01', pct: 22, measured: false },
      { date: '2026-07-15', pct: 21, measured: false },
      { date: '2026-09-01', pct: 20, measured: true },
    ];
    expect(projectBodyFat(points)!.value).toBeLessThan(20);
  });
});

describe('sleepNeed', () => {
  const nights = (values: number[]): SleepLog[] =>
    values.map((minutes, i) => ({ id: `s${i}`, date: addDaysISO(TODAY, -i), minutes }));

  it('reads need off the unconstrained nights, not the average', () => {
    // Mostly alarm-clock nights, a few free ones. The average measures the
    // alarm; the long nights measure the need.
    const logs = nights([420, 415, 425, 410, 420, 415, 540, 530, 405, 415, 420, 535, 410, 420]);
    const need = sleepNeed(logs, TODAY, 420)!;
    expect(need.suggested).toBeGreaterThan(500);
    expect(need.note).toMatch(/nothing cut the night short|nothing woke you/);
  });

  it('agrees with a target that already matches', () => {
    const logs = nights(Array.from({ length: 14 }, () => 480));
    expect(sleepNeed(logs, TODAY, 480)!.note).toMatch(/matches what you sleep/);
  });

  it('says so when even the longest nights fall short of the target', () => {
    const logs = nights(Array.from({ length: 14 }, () => 400));
    expect(sleepNeed(logs, TODAY, 540)!.note).toMatch(/cutting every night short/);
  });

  it('refuses below a fortnight of nights', () => {
    expect(sleepNeed(nights([480, 470, 460]), TODAY, 480)).toBeNull();
  });
});

describe('the caveat', () => {
  it('names each thing these readings cannot see', () => {
    expect(MORE_SCORES_CAVEAT).toMatch(/cannot tell them apart/);
    expect(MORE_SCORES_CAVEAT).toMatch(/not the minute after a session/);
    expect(MORE_SCORES_CAVEAT).toMatch(/cap the rate/);
  });
});

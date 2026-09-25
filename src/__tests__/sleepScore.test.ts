import {
  DEFAULT_SLEEP_TARGET_MINUTES,
  SLEEP_WEIGHTS,
  bandFor,
  bedtimeSpreadMinutes,
  formatHm,
  sleepScore,
  sleepTrend,
  type SleepNight,
} from '../domain/sleepScore';

const night = (over: Partial<SleepNight> = {}): SleepNight => ({
  date: '2026-09-20',
  asleepMinutes: 480,
  coreMinutes: 260,
  deepMinutes: 70,
  remMinutes: 105,
  awakeMinutes: 15,
  inBedMinutes: 510,
  bedtime: '2026-09-19T23:00:00.000Z',
  wakeTime: '2026-09-20T07:30:00.000Z',
  ...over,
});

describe('sleepScore', () => {
  it('scores a good night highly', () => {
    const s = sleepScore(night());
    expect(s.score).not.toBeNull();
    expect(s.score!).toBeGreaterThan(80);
    expect(s.band).toBe(bandFor(s.score!));
  });

  it('returns null rather than zero when there is no sleep recorded', () => {
    // A zero is a measurement. "No data" and "you slept badly" must not look
    // the same, which is the whole reason this is nullable.
    const s = sleepScore(night({ asleepMinutes: 0 }));
    expect(s.score).toBeNull();
    expect(s.band).toBe('unknown');
    expect(s.read).toMatch(/simply missing/i);
  });

  it('punishes a short night through the duration component', () => {
    const full = sleepScore(night()).score!;
    const short = sleepScore(night({ asleepMinutes: 300 })).score!;
    expect(short).toBeLessThan(full);
    const duration = sleepScore(night({ asleepMinutes: 300 })).components.find((c) => c.key === 'duration')!;
    // 300/480 = 62.5%, rounded by the component to 63.
    expect(duration.score).toBe(63);
  });

  it('gives full marks for duration at target and does not punish slightly over', () => {
    expect(sleepScore(night({ asleepMinutes: 480 })).components.find((c) => c.key === 'duration')!.score).toBe(100);
    expect(sleepScore(night({ asleepMinutes: 540 })).components.find((c) => c.key === 'duration')!.score).toBe(100);
  });

  it('mildly marks down sleeping far more than the target', () => {
    const long = sleepScore(night({ asleepMinutes: 800 })).components.find((c) => c.key === 'duration')!;
    expect(long.score).toBeLessThan(100);
    // Mildly: never below 80, because oversleeping is a much weaker signal
    // than undersleeping.
    expect(long.score).toBeGreaterThanOrEqual(80);
  });

  it('honours a custom target', () => {
    const s = sleepScore(night({ asleepMinutes: 420 }), { targetMinutes: 420 });
    expect(s.components.find((c) => c.key === 'duration')!.score).toBe(100);
  });

  // ---- the missing-data commitment ----

  it('drops a missing stage instead of scoring it zero', () => {
    const withStages = sleepScore(night()).score!;
    const noStages = sleepScore(night({ deepMinutes: null, remMinutes: null })).score!;
    // Removing two strong components must not drag the score down; the rest
    // are reweighted to fill the gap.
    expect(noStages).toBeGreaterThanOrEqual(withStages - 2);
  });

  it('names what it could not see', () => {
    const s = sleepScore(night({ deepMinutes: null, remMinutes: null, inBedMinutes: null }));
    expect(s.missing).toEqual(expect.arrayContaining(['deep', 'rem', 'efficiency']));
    expect(s.read).toMatch(/did not report/i);
  });

  it('still scores a device that reports only a duration', () => {
    const s = sleepScore({ date: '2026-09-20', asleepMinutes: 480 });
    expect(s.score).toBe(100);
    expect(s.components).toHaveLength(1);
    expect(s.missing).toEqual(expect.arrayContaining(['deep', 'rem', 'efficiency', 'consistency', 'restfulness']));
  });

  it('distinguishes a reported zero from a missing value', () => {
    // 0 minutes of deep sleep is a measurement and should score badly;
    // null is absence and should be dropped.
    const reportedZero = sleepScore(night({ deepMinutes: 0 }));
    const absent = sleepScore(night({ deepMinutes: null }));
    expect(reportedZero.components.find((c) => c.key === 'deep')!.score).toBe(0);
    expect(absent.components.find((c) => c.key === 'deep')).toBeUndefined();
    expect(reportedZero.score!).toBeLessThan(absent.score!);
  });

  // ---- individual components ----

  it('scores efficiency against the 85% threshold', () => {
    const s = sleepScore(night({ asleepMinutes: 425, inBedMinutes: 500 }));
    // 425/500 = 85% exactly → full marks
    expect(s.components.find((c) => c.key === 'efficiency')!.score).toBe(100);
  });

  it('does not punish more deep sleep than the reference share', () => {
    const plenty = sleepScore(night({ deepMinutes: 200 })).components.find((c) => c.key === 'deep')!;
    expect(plenty.score).toBe(100);
  });

  it('scores restfulness off waking after sleep onset, with a normal allowance', () => {
    expect(sleepScore(night({ awakeMinutes: 15 })).components.find((c) => c.key === 'restfulness')!.score).toBe(100);
    expect(sleepScore(night({ awakeMinutes: 80 })).components.find((c) => c.key === 'restfulness')!.score).toBeLessThan(40);
  });

  it('weights duration above deep and REM combined', () => {
    expect(SLEEP_WEIGHTS.duration).toBeGreaterThan(SLEEP_WEIGHTS.deep + SLEEP_WEIGHTS.rem);
  });
});

describe('bedtimeSpreadMinutes', () => {
  const at = (iso: string): SleepNight => ({ date: '2026-09-20', asleepMinutes: 480, bedtime: iso });

  it('needs at least three nights to say anything', () => {
    expect(bedtimeSpreadMinutes([at('2026-09-18T23:00:00Z'), at('2026-09-19T23:00:00Z')])).toBeNull();
  });

  it('is zero for an identical schedule', () => {
    expect(
      bedtimeSpreadMinutes([at('2026-09-18T23:00:00Z'), at('2026-09-19T23:00:00Z'), at('2026-09-20T23:00:00Z')]),
    ).toBeCloseTo(0, 5);
  });

  it('handles the midnight wrap', () => {
    // 23:40, 00:10 and 23:50 are within half an hour of each other, not
    // twenty-three and a half hours apart.
    const spread = bedtimeSpreadMinutes([
      at('2026-09-18T23:40:00'),
      at('2026-09-20T00:10:00'),
      at('2026-09-20T23:50:00'),
    ])!;
    expect(spread).toBeLessThan(30);
  });

  it('grows with a scattered schedule', () => {
    const tight = bedtimeSpreadMinutes([at('2026-09-18T23:00:00'), at('2026-09-19T23:10:00'), at('2026-09-20T22:50:00')])!;
    const loose = bedtimeSpreadMinutes([at('2026-09-18T21:00:00'), at('2026-09-19T23:30:00'), at('2026-09-20T02:00:00')])!;
    expect(loose).toBeGreaterThan(tight);
  });

  it('ignores nights with no bedtime', () => {
    const nights = [at('2026-09-18T23:00:00Z'), { date: '2026-09-19', asleepMinutes: 400 }, at('2026-09-20T23:00:00Z')];
    expect(bedtimeSpreadMinutes(nights)).toBeNull();
  });
});

describe('sleepTrend', () => {
  const n = (date: string, asleepMinutes: number): SleepNight => ({ date, asleepMinutes });

  it('keeps an unscored night in the series as a gap rather than dropping it', () => {
    const t = sleepTrend([n('2026-09-18', 480), n('2026-09-19', 0), n('2026-09-20', 450)]);
    expect(t.nights).toHaveLength(3);
    expect(t.nights[1]!.score).toBeNull();
  });

  it('averages only the nights that scored', () => {
    const t = sleepTrend([n('2026-09-18', 480), n('2026-09-19', 0), n('2026-09-20', 480)]);
    expect(t.scored).toBe(2);
    expect(t.average).toBe(100);
  });

  it('is null rather than zero when nothing scored', () => {
    const t = sleepTrend([n('2026-09-18', 0), n('2026-09-19', 0)]);
    expect(t.average).toBeNull();
    expect(t.averageAsleepMinutes).toBeNull();
    expect(t.scored).toBe(0);
  });

  it('sorts by date regardless of input order', () => {
    const t = sleepTrend([n('2026-09-20', 480), n('2026-09-18', 480), n('2026-09-19', 480)]);
    expect(t.nights.map((x) => x.date)).toEqual(['2026-09-18', '2026-09-19', '2026-09-20']);
  });

  it('averages duration across scored nights', () => {
    const t = sleepTrend([n('2026-09-18', 400), n('2026-09-19', 500)]);
    expect(t.averageAsleepMinutes).toBe(450);
  });
});

describe('bandFor and formatHm', () => {
  it('bands the score', () => {
    expect(bandFor(90)).toBe('excellent');
    expect(bandFor(75)).toBe('good');
    expect(bandFor(60)).toBe('fair');
    expect(bandFor(40)).toBe('poor');
  });

  it('formats durations without a stray zero', () => {
    expect(formatHm(480)).toBe('8h');
    expect(formatHm(455)).toBe('7h 35m');
    expect(formatHm(45)).toBe('45m');
    expect(formatHm(0)).toBe('0m');
    expect(formatHm(-5)).toBe('0m');
  });

  it('uses the documented default target', () => {
    expect(DEFAULT_SLEEP_TARGET_MINUTES).toBe(480);
  });
});

import {
  CHALLENGE_SCOPE_NOTE,
  ON_TRACK_TOLERANCE,
  challengeProblem,
  daysLeft,
  elapsedFraction,
  inWindow,
  monthWindow,
  perDayNeeded,
  progressOf,
  standingOf,
  statusOf,
  valueOf,
  windowDays,
  type Challenge,
  type ChallengeEntry,
} from '../domain/challenges';

const challenge = (over: Partial<Challenge> = {}): Challenge => ({
  id: 'ch_1',
  name: 'September 100k',
  metric: 'distance',
  target: 100_000,
  from: '2026-09-01',
  to: '2026-09-30',
  createdAt: '2026-08-28T10:00:00.000Z',
  ...over,
});

const run = (date: string, distanceM: number, over: Partial<ChallengeEntry> = {}): ChallengeEntry => ({
  date,
  distanceM,
  elevationGainM: 50,
  movingSeconds: 1800,
  ...over,
});

describe('valueOf', () => {
  it('reads the metric it was asked for', () => {
    const e = run('2026-09-02', 5000);
    expect(valueOf(e, 'distance')).toBe(5000);
    expect(valueOf(e, 'elevation')).toBe(50);
    expect(valueOf(e, 'time')).toBe(1800);
    expect(valueOf(e, 'activities')).toBe(1);
  });

  it('treats a missing measurement as nothing, not as a break', () => {
    const e: ChallengeEntry = { date: '2026-09-02' };
    expect(valueOf(e, 'distance')).toBe(0);
    expect(valueOf(e, 'elevation')).toBe(0);
    // An activity still counts as one even with nothing measured on it.
    expect(valueOf(e, 'activities')).toBe(1);
  });
});

describe('inWindow and progressOf', () => {
  it('includes both ends of the window', () => {
    const c = challenge();
    expect(inWindow(c, '2026-09-01')).toBe(true);
    expect(inWindow(c, '2026-09-30')).toBe(true);
    expect(inWindow(c, '2026-08-31')).toBe(false);
    expect(inWindow(c, '2026-10-01')).toBe(false);
  });

  it('ignores anything outside the window', () => {
    const p = progressOf(challenge(), [run('2026-08-31', 10_000), run('2026-09-05', 10_000), run('2026-10-01', 10_000)]);
    expect(p.value).toBe(10_000);
    expect(p.entries).toBe(1);
  });

  it('clamps the fraction rather than going past full', () => {
    const p = progressOf(challenge(), [run('2026-09-05', 250_000)]);
    expect(p.fraction).toBe(1);
    // The raw value is kept, though: "250 km of 100 km" is the true story.
    expect(p.value).toBe(250_000);
    expect(p.complete).toBe(true);
  });

  it('is complete exactly at the target, not only past it', () => {
    expect(progressOf(challenge(), [run('2026-09-05', 100_000)]).complete).toBe(true);
  });

  it('counts activities when that is the metric', () => {
    const p = progressOf(challenge({ metric: 'activities', target: 20 }), [
      run('2026-09-02', 5000),
      run('2026-09-03', 5000),
    ]);
    expect(p.value).toBe(2);
  });
});

describe('statusOf, daysLeft and windowDays', () => {
  it('knows where in its life the challenge is', () => {
    const c = challenge();
    expect(statusOf(c, '2026-08-20')).toBe('upcoming');
    expect(statusOf(c, '2026-09-01')).toBe('active');
    expect(statusOf(c, '2026-09-30')).toBe('active');
    expect(statusOf(c, '2026-10-01')).toBe('ended');
  });

  it('counts today as a day you can still use', () => {
    // The last day is not zero days left; it is one.
    expect(daysLeft(challenge(), '2026-09-30')).toBe(1);
    expect(daysLeft(challenge(), '2026-09-29')).toBe(2);
  });

  it('is zero once the window has closed', () => {
    expect(daysLeft(challenge(), '2026-10-05')).toBe(0);
  });

  it('counts the whole window before it begins', () => {
    expect(daysLeft(challenge(), '2026-08-01')).toBe(30);
  });

  it('counts both ends of the window', () => {
    expect(windowDays(challenge())).toBe(30);
    expect(windowDays(challenge({ from: '2026-09-01', to: '2026-09-01' }))).toBe(1);
  });
});

describe('perDayNeeded', () => {
  it('divides what is left by the days that are left', () => {
    const c = challenge();
    const p = progressOf(c, [run('2026-09-01', 40_000)]);
    // 60 km left over 20 remaining days (11th–30th).
    expect(perDayNeeded(c, p, '2026-09-11')).toBeCloseTo(3000, 5);
  });

  it('is null when it is already done', () => {
    const c = challenge();
    expect(perDayNeeded(c, progressOf(c, [run('2026-09-02', 100_000)]), '2026-09-11')).toBeNull();
  });

  it('is null once no amount per day would help', () => {
    const c = challenge();
    expect(perDayNeeded(c, progressOf(c, [run('2026-09-02', 10_000)]), '2026-10-02')).toBeNull();
  });
});

describe('elapsedFraction', () => {
  it('counts today as spent', () => {
    // On the morning of day one nothing has been done; treating day one as
    // untouched would report everybody perfectly on track until midnight.
    expect(elapsedFraction(challenge(), '2026-09-01')).toBeCloseTo(1 / 30, 6);
  });

  it('is nothing before the start and everything after the end', () => {
    expect(elapsedFraction(challenge(), '2026-08-15')).toBe(0);
    expect(elapsedFraction(challenge(), '2026-10-15')).toBe(1);
  });

  it('is full on the last day', () => {
    expect(elapsedFraction(challenge(), '2026-09-30')).toBe(1);
  });
});

describe('standingOf', () => {
  const c = challenge();
  const at = (date: string, done: number) => standingOf(c, progressOf(c, [run('2026-09-01', done)]), date);

  it('refuses to judge a challenge that has not started', () => {
    const s = standingOf(c, progressOf(c, []), '2026-08-20');
    expect(s.standing).toBe('not_started');
    expect(s.projected).toBeNull();
  });

  it('calls it done the moment the target is met, whatever the pace was', () => {
    expect(at('2026-09-03', 100_000).standing).toBe('done');
    expect(at('2026-09-03', 100_000).read).toMatch(/days to spare/i);
  });

  it('still says done after the window closes', () => {
    const s = at('2026-10-05', 100_000);
    expect(s.standing).toBe('done');
    expect(s.read).not.toMatch(/days to spare/i);
  });

  it('is on track at exactly the required pace', () => {
    // Half the month gone, half the target done.
    expect(at('2026-09-15', 50_000).standing).toBe('on_track');
  });

  it('is ahead when well past the pace, behind when well under', () => {
    expect(at('2026-09-15', 80_000).standing).toBe('ahead');
    expect(at('2026-09-15', 20_000).standing).toBe('behind');
  });

  it('allows a small margin either side before saying anything alarming', () => {
    const elapsed = elapsedFraction(c, '2026-09-15');
    const justUnder = c.target * elapsed * (1 - ON_TRACK_TOLERANCE / 2);
    expect(at('2026-09-15', justUnder).standing).toBe('on_track');
  });

  it('projects the finish from the pace so far', () => {
    const s = at('2026-09-15', 50_000);
    expect(s.projected).toBeCloseTo(100_000, -2);
  });

  it('says how far short a finished challenge fell', () => {
    const s = at('2026-10-01', 60_000);
    expect(s.standing).toBe('missed');
    expect(s.read).toContain('40000 m');
  });

  it('counts a shortfall in whole activities when that is the metric', () => {
    const counted = challenge({ metric: 'activities', target: 20 });
    const s = standingOf(counted, progressOf(counted, [run('2026-09-02', 1)]), '2026-10-01');
    expect(s.read).toContain('19 activities');
  });
});

describe('challengeProblem', () => {
  const draft = { name: 'September 100k', metric: 'distance' as const, target: 100_000, from: '2026-09-01', to: '2026-09-30' };

  it('accepts a sensible draft', () => {
    expect(challengeProblem(draft)).toBeNull();
  });

  it('needs a name', () => {
    expect(challengeProblem({ ...draft, name: '   ' })).toMatch(/name/i);
  });

  it('needs a target worth chasing', () => {
    expect(challengeProblem({ ...draft, target: 0 })).toMatch(/more than nothing/i);
    expect(challengeProblem({ ...draft, target: Number.NaN })).toMatch(/more than nothing/i);
  });

  it('needs the end to come after the start', () => {
    expect(challengeProblem({ ...draft, from: '2026-09-30', to: '2026-09-01' })).toMatch(/after the start/i);
  });

  it('allows a single-day challenge', () => {
    expect(challengeProblem({ ...draft, from: '2026-09-05', to: '2026-09-05' })).toBeNull();
  });
});

describe('monthWindow', () => {
  it('covers the whole month a date falls in', () => {
    expect(monthWindow('2026-09-14')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('handles the thirty-one day months', () => {
    expect(monthWindow('2026-07-04').to).toBe('2026-07-31');
  });

  it('handles February without a table of month lengths', () => {
    expect(monthWindow('2026-02-10').to).toBe('2026-02-28');
    expect(monthWindow('2028-02-10').to).toBe('2028-02-29');
  });

  it('rolls over the year at December', () => {
    expect(monthWindow('2026-12-25')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
});

describe('the missing scope', () => {
  it('says why there is no global challenge rather than shipping an empty tab', () => {
    expect(CHALLENGE_SCOPE_NOTE).toMatch(/no global challenge/i);
  });
});

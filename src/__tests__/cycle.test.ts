import {
  CYCLE_CAVEAT,
  FLOW_LABEL,
  MIN_CYCLES_FOR_PREDICTION,
  PHASE_LABEL,
  PHASE_NOTE,
  cycleStats,
  cycleToday,
  periodsFrom,
  predictNext,
  readCycle,
  symptomPatterns,
  type CycleDay,
} from '../domain/cycle';

/** Bleeding days, `days` of them, starting at `start`. */
function period(start: string, days: number, flow: 'light' | 'medium' | 'heavy' = 'medium'): CycleDay[] {
  return Array.from({ length: days }, (_, i) => ({ date: shift(start, i), flow }));
}

function shift(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

describe('periodsFrom', () => {
  it('groups consecutive bleeding days into one period', () => {
    const p = periodsFrom(period('2026-09-01', 5));
    expect(p).toHaveLength(1);
    expect(p[0]).toEqual({ start: '2026-09-01', end: '2026-09-05', days: 5 });
  });

  it('does not split a period over a single skipped day', () => {
    // One light day logged as nothing is not the end of a period, and
    // splitting there would wreck every cycle length after it.
    const days = [...period('2026-09-01', 2), ...period('2026-09-04', 3)];
    expect(periodsFrom(days)).toHaveLength(1);
  });

  it('starts a new period after a real gap', () => {
    const days = [...period('2026-09-01', 5), ...period('2026-09-29', 5)];
    expect(periodsFrom(days).map((p) => p.start)).toEqual(['2026-09-01', '2026-09-29']);
  });

  it('ignores days with no flow logged', () => {
    const days: CycleDay[] = [...period('2026-09-01', 3), { date: '2026-09-15', symptoms: ['cramps'] }];
    expect(periodsFrom(days)).toHaveLength(1);
  });

  it('is empty with nothing logged', () => {
    expect(periodsFrom([])).toEqual([]);
    expect(periodsFrom([{ date: '2026-09-01', note: 'nothing' }])).toEqual([]);
  });
});

describe('cycleStats', () => {
  const threeCycles = periodsFrom([
    ...period('2026-06-01', 5),
    ...period('2026-06-29', 5),
    ...period('2026-07-28', 4),
    ...period('2026-08-25', 5),
  ]);

  it('measures start to start, not end to start', () => {
    const s = cycleStats(threeCycles)!;
    expect(s.cycles).toBe(3);
    expect(s.averageLength).toBe(28);
  });

  it('reports the spread, not just the average', () => {
    const s = cycleStats(threeCycles)!;
    expect(s.shortest).toBeLessThanOrEqual(s.averageLength);
    expect(s.longest).toBeGreaterThanOrEqual(s.averageLength);
    expect(s.variation).toBe(s.longest - s.shortest);
  });

  it('throws out a gap that is a logging hole rather than a cycle', () => {
    // Six months between two periods is somebody who stopped logging.
    const withHole = periodsFrom([
      ...period('2026-01-01', 5),
      ...period('2026-08-01', 5),
      ...period('2026-08-29', 5),
    ]);
    expect(cycleStats(withHole)!.cycles).toBe(1);
    expect(cycleStats(withHole)!.averageLength).toBe(28);
  });

  it('says nothing from a single period', () => {
    expect(cycleStats(periodsFrom(period('2026-09-01', 5)))).toBeNull();
    expect(cycleStats([])).toBeNull();
  });
});

describe('cycleToday', () => {
  const periods = periodsFrom([
    ...period('2026-07-28', 5),
    ...period('2026-08-25', 5),
  ]);
  const stats = cycleStats(periods);

  it('counts the day from the start of the current period', () => {
    expect(cycleToday(periods, stats, '2026-08-25')!.day).toBe(1);
    expect(cycleToday(periods, stats, '2026-09-01')!.day).toBe(8);
  });

  it('calls bleeding days menstrual whatever the arithmetic says', () => {
    expect(cycleToday(periods, stats, '2026-08-27')!.phase).toBe('menstrual');
  });

  it('anchors ovulation backwards from the next period, not forwards from the last', () => {
    // A 35-day cycle ovulates around day 21, not day 14. Anchoring forwards
    // is the assumption that makes calendar apps wrong for most people.
    const long = periodsFrom([...period('2026-07-01', 5), ...period('2026-08-05', 5)]);
    const longStats = cycleStats(long)!;
    expect(longStats.averageLength).toBe(35);
    expect(cycleToday(long, longStats, shift('2026-08-05', 13))!.phase).toBe('follicular');
    expect(cycleToday(long, longStats, shift('2026-08-05', 20))!.phase).toBe('ovulatory');
    expect(cycleToday(long, longStats, shift('2026-08-05', 25))!.phase).toBe('luteal');
  });

  it('refuses to invent an ovulation date without a measured length', () => {
    const one = periodsFrom(period('2026-09-01', 5));
    const phases = [8, 14, 20].map((d) => cycleToday(one, null, shift('2026-09-01', d))!.phase);
    expect(phases).not.toContain('ovulatory');
  });

  it('says nothing before the first logged period', () => {
    expect(cycleToday(periods, stats, '2026-01-01')).toBeNull();
  });

  it('has a label and a note for every phase it can return', () => {
    for (const phase of ['menstrual', 'follicular', 'ovulatory', 'luteal'] as const) {
      expect(PHASE_LABEL[phase]).toBeTruthy();
      expect(PHASE_NOTE[phase].length).toBeGreaterThan(20);
    }
  });

  it('never tells anyone how to train in a phase note', () => {
    for (const note of Object.values(PHASE_NOTE)) {
      expect(note).not.toMatch(/you should|avoid training|do not lift|must rest/i);
    }
  });
});

describe('predictNext', () => {
  const periods = periodsFrom([
    ...period('2026-07-01', 5),
    ...period('2026-07-29', 5),
    ...period('2026-08-26', 5),
  ]);
  const stats = cycleStats(periods)!;

  it('predicts a window, not a date', () => {
    const p = predictNext(periods, stats, '2026-09-10')!;
    expect(p.earliest < p.expected).toBe(true);
    expect(p.latest > p.expected).toBe(true);
  });

  it('widens the window for someone whose cycles vary', () => {
    const erratic = periodsFrom([
      ...period('2026-05-01', 5),
      ...period('2026-05-23', 5),
      ...period('2026-06-30', 5),
    ]);
    const erraticStats = cycleStats(erratic)!;
    const steady = predictNext(periods, stats, '2026-09-10')!;
    const wide = predictNext(erratic, erraticStats, '2026-07-20')!;
    const width = (p: { earliest: string; latest: string }) =>
      new Date(p.latest).getTime() - new Date(p.earliest).getTime();
    expect(width(wide)).toBeGreaterThan(width(steady));
    expect(wide.note).toMatch(/wide guess rather than a date/);
  });

  it('refuses below the minimum history', () => {
    const two = periodsFrom([...period('2026-08-01', 5), ...period('2026-08-29', 5)]);
    expect(cycleStats(two)!.cycles).toBe(1);
    expect(predictNext(two, cycleStats(two), '2026-09-10')).toBeNull();
    expect(MIN_CYCLES_FOR_PREDICTION).toBeGreaterThan(1);
  });

  it('says nothing without stats at all', () => {
    expect(predictNext(periods, null, '2026-09-10')).toBeNull();
  });

  it('reports a negative days-away when the estimate has passed', () => {
    const p = predictNext(periods, stats, '2026-10-05')!;
    expect(p.daysAway).toBeLessThan(0);
  });
});

describe('symptomPatterns', () => {
  const periods = periodsFrom([...period('2026-08-01', 5), ...period('2026-08-29', 5)]);
  const days: CycleDay[] = [
    { date: '2026-08-01', symptoms: ['cramps'] },
    { date: '2026-08-02', symptoms: ['cramps', 'fatigue'] },
    { date: '2026-08-29', symptoms: ['cramps'] },
    { date: '2026-08-30', symptoms: ['cramps'] },
    { date: '2026-08-25', symptoms: ['bloating'] },
  ];

  it('counts by symptom, most common first', () => {
    const p = symptomPatterns(days, periods);
    expect(p[0]!.symptom).toBe('cramps');
    expect(p[0]!.days).toBe(4);
  });

  it('gives a typical cycle day only when there are enough to say', () => {
    const p = symptomPatterns(days, periods);
    // Cramps landed on cycle days 1, 2, 1 and 2 — the median of those is 1.5,
    // which rounds to 2.
    expect(p.find((x) => x.symptom === 'cramps')!.typicalDay).toBe(2);
    // One sighting is not a pattern.
    expect(p.find((x) => x.symptom === 'fatigue')!.typicalDay).toBeNull();
  });

  it('is empty when nothing was logged', () => {
    expect(symptomPatterns([], periods)).toEqual([]);
  });
});

describe('readCycle', () => {
  it('invites a first entry rather than reporting nothing', () => {
    expect(readCycle(null, null, null)).toMatch(/Log a day of bleeding/);
  });

  it('says how much more history it needs before estimating', () => {
    const one = periodsFrom(period('2026-09-01', 5));
    const line = readCycle(cycleToday(one, null, '2026-09-08'), null, null);
    expect(line).toMatch(/Day 8/);
    expect(line).toMatch(/more complete/);
  });

  it('counts down to the estimate when there is one', () => {
    const periods = periodsFrom([...period('2026-07-01', 5), ...period('2026-07-29', 5), ...period('2026-08-26', 5)]);
    const stats = cycleStats(periods);
    const line = readCycle(cycleToday(periods, stats, '2026-09-15'), predictNext(periods, stats, '2026-09-15'), stats);
    expect(line).toMatch(/Next period estimated in about \d+ days/);
  });

  it('treats a late period as common, and points at a doctor for a pattern', () => {
    const periods = periodsFrom([...period('2026-07-01', 5), ...period('2026-07-29', 5), ...period('2026-08-26', 5)]);
    const stats = cycleStats(periods);
    const line = readCycle(cycleToday(periods, stats, '2026-10-05'), predictNext(periods, stats, '2026-10-05'), stats);
    expect(line).toMatch(/late is common/);
    expect(line).toMatch(/doctor/);
  });
});

describe('the labels and the caveat', () => {
  it('labels every flow level', () => {
    for (const f of ['spotting', 'light', 'medium', 'heavy'] as const) {
      expect(FLOW_LABEL[f]).toBeTruthy();
    }
  });

  it('refuses the contraception reading in the strongest terms', () => {
    expect(CYCLE_CAVEAT).toMatch(/not contraception/i);
    expect(CYCLE_CAVEAT).toMatch(/must not be used/i);
    expect(CYCLE_CAVEAT).toMatch(/cannot diagnose/i);
  });
});

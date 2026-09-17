import {
  DEFAULT_PLAN,
  INTERVAL_PRESETS,
  buildSchedule,
  describePlan,
  formatClock,
  normalisePlan,
  positionAt,
  totalSeconds,
  type IntervalPlan,
} from '../domain/interval';

const plan = (over: Partial<IntervalPlan> = {}): IntervalPlan => ({ ...DEFAULT_PLAN, ...over });

describe('buildSchedule', () => {
  it('lays out prepare, then alternating work and rest', () => {
    const s = buildSchedule(plan({ rounds: 3, workSeconds: 30, restSeconds: 15, prepareSeconds: 10 }));
    expect(s.map((p) => p.kind)).toEqual([
      'prepare',
      'work', 'rest',
      'work', 'rest',
      'work',
      'done',
    ]);
  });

  it('drops the rest after the final work phase', () => {
    // Resting at the end of a finished session is standing there watching a clock.
    const s = buildSchedule(plan({ rounds: 2, restSeconds: 20 }));
    const beforeDone = s[s.length - 2];
    expect(beforeDone.kind).toBe('work');
  });

  it('omits a zero-length rest rather than emitting an empty phase', () => {
    const s = buildSchedule(plan({ rounds: 3, restSeconds: 0, prepareSeconds: 0 }));
    expect(s.every((p) => p.seconds > 0 || p.kind === 'done')).toBe(true);
    expect(s.map((p) => p.kind)).toEqual(['work', 'work', 'work', 'done']);
  });

  it('walks every station before starting the next round', () => {
    const s = buildSchedule(plan({ stations: 3, rounds: 2, prepareSeconds: 0, restSeconds: 10, roundRestSeconds: 60 }));
    const work = s.filter((p) => p.kind === 'work');
    expect(work).toHaveLength(6);
    expect(work.map((p) => `${p.round}.${p.station}`)).toEqual(['1.1', '1.2', '1.3', '2.1', '2.2', '2.3']);
    // The longer rest lands between rounds, the short one between stations.
    expect(s.filter((p) => p.kind === 'round_rest')).toHaveLength(1);
    expect(s.find((p) => p.kind === 'round_rest')!.seconds).toBe(60);
  });

  it('falls back to the normal rest between rounds when no round rest is set', () => {
    const s = buildSchedule(plan({ stations: 2, rounds: 2, restSeconds: 15, roundRestSeconds: 0, prepareSeconds: 0 }));
    expect(s.find((p) => p.kind === 'round_rest')!.seconds).toBe(15);
  });

  it('start times are contiguous and never overlap', () => {
    const s = buildSchedule(plan({ stations: 2, rounds: 3, roundRestSeconds: 45 }));
    for (let i = 1; i < s.length; i += 1) {
      expect(s[i].startsAt).toBe(s[i - 1].startsAt + s[i - 1].seconds);
    }
  });

  it('always ends with a done marker at the total duration', () => {
    const p = plan({ rounds: 4 });
    const s = buildSchedule(p);
    expect(s[s.length - 1].kind).toBe('done');
    expect(s[s.length - 1].startsAt).toBe(totalSeconds(p));
  });
});

describe('normalisePlan', () => {
  it('clamps values into a representable range', () => {
    const p = normalisePlan({ stations: 0, rounds: 999, workSeconds: 1, restSeconds: -5, roundRestSeconds: 99999, prepareSeconds: 500 });
    expect(p.stations).toBe(1);
    expect(p.rounds).toBe(60);
    expect(p.workSeconds).toBe(5);
    expect(p.restSeconds).toBe(0);
    expect(p.prepareSeconds).toBe(120);
  });

  it('survives NaN without producing a NaN schedule', () => {
    const s = buildSchedule({ ...DEFAULT_PLAN, rounds: Number.NaN, workSeconds: Number.NaN });
    expect(s.every((p) => Number.isFinite(p.seconds) && Number.isFinite(p.startsAt))).toBe(true);
  });
});

describe('positionAt', () => {
  const p = plan({ rounds: 3, workSeconds: 30, restSeconds: 15, prepareSeconds: 10 });
  const schedule = buildSchedule(p);
  // prepare 0-10, work 10-40, rest 40-55, work 55-85, rest 85-100, work 100-130

  it('reports the phase containing a given second', () => {
    expect(positionAt(schedule, 0).phase.kind).toBe('prepare');
    expect(positionAt(schedule, 9.9).phase.kind).toBe('prepare');
    expect(positionAt(schedule, 10).phase.kind).toBe('work');
    expect(positionAt(schedule, 45).phase.kind).toBe('rest');
    expect(positionAt(schedule, 120).phase.round).toBe(3);
  });

  it('counts down inside the phase', () => {
    const at = positionAt(schedule, 20);
    expect(at.remaining).toBe(20);
    expect(at.phaseProgress).toBeCloseTo(1 / 3, 5);
  });

  it('names what comes next, so the screen can show it before it arrives', () => {
    expect(positionAt(schedule, 20).next?.kind).toBe('rest');
    expect(positionAt(schedule, 125).next?.kind).toBe('done');
  });

  it('is finished at and past the end, without running off the array', () => {
    const total = totalSeconds(p);
    expect(positionAt(schedule, total).finished).toBe(true);
    expect(positionAt(schedule, total + 9999).finished).toBe(true);
    expect(positionAt(schedule, total).next).toBeNull();
  });

  it('treats a negative elapsed as the very start rather than going backwards', () => {
    expect(positionAt(schedule, -50).phase.kind).toBe('prepare');
    expect(positionAt(schedule, -50).sessionProgress).toBe(0);
  });

  it('never returns a phase whose window excludes the time asked for', () => {
    // The property the whole screen depends on.
    for (let t = 0; t < totalSeconds(p); t += 0.5) {
      const at = positionAt(schedule, t);
      expect(t).toBeGreaterThanOrEqual(at.phase.startsAt);
      expect(t).toBeLessThan(at.phase.startsAt + at.phase.seconds);
    }
  });

  it('handles an empty schedule without throwing', () => {
    expect(positionAt([], 10).finished).toBe(true);
  });
});

describe('formatClock', () => {
  it('rounds up, so a timer never shows 0 while time remains', () => {
    expect(formatClock(0.1)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
  });

  it('pads seconds and grows an hours field when needed', () => {
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(600)).toBe('10:00');
    expect(formatClock(3725)).toBe('1:02:05');
  });

  it('never shows a negative clock', () => {
    expect(formatClock(-30)).toBe('0:00');
  });
});

describe('presets', () => {
  it('every preset builds a schedule that runs for a sensible length', () => {
    for (const preset of INTERVAL_PRESETS) {
      const total = totalSeconds(preset.plan);
      expect(total).toBeGreaterThan(60);
      expect(total).toBeLessThan(60 * 60);
      expect(buildSchedule(preset.plan).filter((p) => p.kind === 'work').length).toBe(
        preset.plan.rounds * preset.plan.stations,
      );
    }
  });

  it('Tabata is the protocol everyone means by that word', () => {
    const tabata = INTERVAL_PRESETS.find((p) => p.key === 'tabata')!;
    expect(tabata.plan.rounds).toBe(8);
    expect(tabata.plan.workSeconds).toBe(20);
    expect(tabata.plan.restSeconds).toBe(10);
    // 8 × 30s of work+rest, minus the dropped final rest, plus the countdown.
    expect(totalSeconds(tabata.plan)).toBe(10 + 8 * 20 + 7 * 10);
  });

  it('describes itself in one line', () => {
    expect(describePlan(INTERVAL_PRESETS[0].plan)).toBe('8 × 20s / 10s');
    expect(describePlan(INTERVAL_PRESETS[2].plan)).toBe('4 stations · 3 × 45s / 15s');
    expect(describePlan(INTERVAL_PRESETS[1].plan)).toBe('10 × 60s');
  });
});

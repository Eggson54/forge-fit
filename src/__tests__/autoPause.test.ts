import { AUTO_PAUSE_AFTER_S, AUTO_PAUSE_MS, decide, type PauseState } from '../domain/autoPause';

const T0 = 1_760_000_000_000;
const running: PauseState = { recording: true, autoPaused: false, stillSince: null };
const paused: PauseState = { recording: false, autoPaused: true, stillSince: null };

/** Feed a run of fixes and report where it ended up. */
function run(start: PauseState, fixes: { speedMs: number | null; t: number }[]) {
  let state = { ...start };
  const actions: string[] = [];
  for (const fix of fixes) {
    const d = decide(state, fix);
    actions.push(d.action);
    if (d.action === 'pause') state = { recording: false, autoPaused: true, stillSince: d.stillSince };
    else if (d.action === 'resume') state = { recording: true, autoPaused: false, stillSince: d.stillSince };
    else state = { ...state, stillSince: d.stillSince };
  }
  return { state, actions };
}

const still = (n: number, from = T0) => Array.from({ length: n }, (_, i) => ({ speedMs: 0.1, t: from + i * 1000 }));
const moving = (n: number, from = T0) => Array.from({ length: n }, (_, i) => ({ speedMs: 3.2, t: from + i * 1000 }));

describe('decide', () => {
  it('does nothing while somebody is running', () => {
    const { state, actions } = run(running, moving(30));
    expect(actions.every((a) => a === 'none')).toBe(true);
    expect(state.autoPaused).toBe(false);
  });

  it('pauses after the threshold of standing still, not before', () => {
    const { actions } = run(running, still(12));
    // Nine fixes a second apart is eight seconds elapsed from the first.
    expect(actions.slice(0, AUTO_PAUSE_AFTER_S).every((a) => a === 'none')).toBe(true);
    expect(actions).toContain('pause');
    expect(actions.indexOf('pause')).toBe(AUTO_PAUSE_AFTER_S);
  });

  it('does not pause for a stop shorter than the threshold', () => {
    const { state, actions } = run(running, [...still(5), ...moving(5, T0 + 5000)]);
    expect(actions).not.toContain('pause');
    expect(state.autoPaused).toBe(false);
  });

  it('resumes the moment real movement returns', () => {
    const { state, actions } = run(paused, moving(2));
    expect(actions[0]).toBe('resume');
    expect(state.autoPaused).toBe(false);
  });

  it('resumes on an unknown speed, and never pauses on one', () => {
    // The bug this exists for: some receivers report speed intermittently.
    // Treating "don't know" as "stopped" stranded somebody auto-paused for
    // the rest of a run with no way back but a manual resume.
    expect(decide(paused, { speedMs: null, t: T0 }).action).toBe('resume');
    const { actions } = run(running, Array.from({ length: 60 }, (_, i) => ({ speedMs: null, t: T0 + i * 1000 })));
    expect(actions).not.toContain('pause');
  });

  it('treats a non-finite speed the same as an absent one', () => {
    expect(decide(paused, { speedMs: Number.NaN, t: T0 }).action).toBe('resume');
    expect(run(running, [{ speedMs: Number.NaN, t: T0 }]).actions).toEqual(['none']);
  });

  it('stays paused while the stop continues', () => {
    const { state, actions } = run(paused, still(20));
    expect(actions.every((a) => a === 'none')).toBe(true);
    expect(state.autoPaused).toBe(true);
  });

  it('times the stop from the first still fix, not from the threshold crossing', () => {
    // At a one-second sample rate, timing from the crossing means a
    // nine-second stop never quite adds up to a pause.
    const first = decide(running, { speedMs: 0.1, t: T0 });
    expect(first.stillSince).toBe(T0);
    expect(first.action).toBe('none');
  });

  it('forgets the stillness clock as soon as anything moves', () => {
    const almost = run(running, still(7));
    expect(almost.state.stillSince).toBe(T0);
    const after = decide(almost.state, { speedMs: 3.2, t: T0 + 7000 });
    expect(after.stillSince).toBeNull();
  });

  it('does not start a pause from a state that is not recording', () => {
    const idle: PauseState = { recording: false, autoPaused: false, stillSince: null };
    expect(run(idle, still(30)).actions.every((a) => a === 'none')).toBe(true);
  });

  it('pauses below a slow walk and not above it', () => {
    const justUnder = run(running, Array.from({ length: 12 }, (_, i) => ({ speedMs: AUTO_PAUSE_MS - 0.01, t: T0 + i * 1000 })));
    expect(justUnder.actions).toContain('pause');
    const justOver = run(running, Array.from({ length: 12 }, (_, i) => ({ speedMs: AUTO_PAUSE_MS, t: T0 + i * 1000 })));
    expect(justOver.actions).not.toContain('pause');
  });

  it('keeps a walk break in the middle of a run as part of the run', () => {
    // A deliberate walk at 1.3 m/s is well above the threshold and must not
    // stop the clock — this is the complaint about every app that does this.
    const walk = Array.from({ length: 120 }, (_, i) => ({ speedMs: 1.3, t: T0 + i * 1000 }));
    expect(run(running, walk).actions).not.toContain('pause');
  });

  it('handles a receiver that drops out and comes back still', () => {
    const { actions } = run(running, [
      ...still(4),
      { speedMs: null, t: T0 + 4000 },
      ...still(12, T0 + 5000),
    ]);
    // The dropout clears the clock, so the pause is timed from after it.
    expect(actions.indexOf('pause')).toBeGreaterThan(AUTO_PAUSE_AFTER_S);
  });
});

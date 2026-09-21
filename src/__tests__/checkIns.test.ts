import {
  CADENCE_LABEL,
  CHECK_IN_NOTE,
  DEFAULT_CHECK_INS,
  GHOST_SUPPRESSES,
  THINKING_LABEL,
  THINKING_NOTE,
  describeCheckIn,
  describeGhost,
  dueNow,
  effectiveMode,
  formatTime,
  ghostActive,
  isDue,
  type CheckIn,
} from '../domain/checkIns';

/** 2026-09-21 is a Monday. */
const MONDAY = '2026-09-21';
const SATURDAY = '2026-09-26';

const at = (hour: number, minute = 0) => new Date(2026, 8, 21, hour, minute);

const checkIn = (over: Partial<CheckIn> = {}): CheckIn => ({
  id: 'c1',
  label: 'Morning readiness',
  cadence: 'daily',
  timeMinutes: 7 * 60 + 30,
  enabled: true,
  ...over,
});

describe('isDue', () => {
  it('waits for its hour', () => {
    expect(isDue(checkIn(), at(7, 0), MONDAY)).toBe(false);
    expect(isDue(checkIn(), at(7, 30), MONDAY)).toBe(true);
    expect(isDue(checkIn(), at(11, 0), MONDAY)).toBe(true);
  });

  it('fires once a day, however many times the app is opened', () => {
    // Without this guard a daily check-in fires five times on a busy morning.
    expect(isDue(checkIn({ lastFiredOn: MONDAY }), at(11), MONDAY)).toBe(false);
    expect(isDue(checkIn({ lastFiredOn: '2026-09-20' }), at(11), MONDAY)).toBe(true);
  });

  it('respects the enabled flag and the off cadence', () => {
    expect(isDue(checkIn({ enabled: false }), at(11), MONDAY)).toBe(false);
    expect(isDue(checkIn({ cadence: 'off' }), at(11), MONDAY)).toBe(false);
  });

  it('skips weekends for a weekdays check-in', () => {
    // Monday-first indexing: getDay() calls Sunday 0, which had this firing
    // on Sunday and skipping Friday.
    expect(isDue(checkIn({ cadence: 'weekdays' }), at(11), MONDAY)).toBe(true);
    expect(isDue(checkIn({ cadence: 'weekdays' }), at(11), '2026-09-25')).toBe(true);
    expect(isDue(checkIn({ cadence: 'weekdays' }), at(11), SATURDAY)).toBe(false);
    expect(isDue(checkIn({ cadence: 'weekdays' }), at(11), '2026-09-27')).toBe(false);
  });

  it('fires a weekly one only on its day', () => {
    const weekly = checkIn({ cadence: 'weekly', weekday: 6, timeMinutes: 600 });
    expect(isDue(weekly, at(11), MONDAY)).toBe(false);
    expect(isDue(weekly, at(11), '2026-09-27')).toBe(true);
  });

  it('holds a fortnightly one back for a full two weeks', () => {
    const base = checkIn({ cadence: 'fortnightly', weekday: 0, timeMinutes: 600 });
    expect(isDue({ ...base, lastFiredOn: '2026-09-14' }, at(11), MONDAY)).toBe(false);
    expect(isDue({ ...base, lastFiredOn: '2026-09-07' }, at(11), MONDAY)).toBe(true);
    // Never fired before: the first matching day is the one.
    expect(isDue(base, at(11), MONDAY)).toBe(true);
  });

  it('gives a monthly one the first open of the month, not just the 1st', () => {
    // A summary that silently skips a month because nobody opened the app on
    // the 1st is worse than one that arrives on the 3rd.
    const monthly = checkIn({ cadence: 'monthly', timeMinutes: 600, lastFiredOn: '2026-08-01' });
    expect(isDue(monthly, at(11), MONDAY)).toBe(true);
    expect(isDue({ ...monthly, lastFiredOn: '2026-09-03' }, at(11), MONDAY)).toBe(false);
  });

  it('orders what is due by the time it was set for', () => {
    const list = [
      checkIn({ id: 'evening', timeMinutes: 21 * 60 }),
      checkIn({ id: 'morning', timeMinutes: 7 * 60 }),
    ];
    expect(dueNow(list, at(22), MONDAY).map((c) => c.id)).toEqual(['morning', 'evening']);
  });
});

describe('describeCheckIn', () => {
  it('reads like a sentence for every cadence', () => {
    expect(describeCheckIn(checkIn())).toBe('Every day at 7:30 am');
    expect(describeCheckIn(checkIn({ cadence: 'weekdays' }))).toMatch(/^Weekdays at/);
    expect(describeCheckIn(checkIn({ cadence: 'weekly', weekday: 6 }))).toMatch(/^Sundays at/);
    expect(describeCheckIn(checkIn({ cadence: 'fortnightly', weekday: 0 }))).toMatch(/^Every other Monday/);
    expect(describeCheckIn(checkIn({ cadence: 'monthly' }))).toMatch(/^Start of each month/);
    expect(describeCheckIn(checkIn({ enabled: false }))).toBe('Off');
  });

  it('labels every cadence the settings screen can offer', () => {
    for (const c of ['daily', 'weekdays', 'weekly', 'fortnightly', 'monthly', 'off'] as const) {
      expect(CADENCE_LABEL[c]).toBeTruthy();
    }
  });

  it('ships defaults that are mostly off, so the app is quiet out of the box', () => {
    expect(DEFAULT_CHECK_INS.filter((c) => c.enabled).length).toBeLessThan(DEFAULT_CHECK_INS.length);
  });
});

describe('formatTime', () => {
  it('reads like a clock', () => {
    expect(formatTime(0)).toBe('12:00 am');
    expect(formatTime(7 * 60 + 5)).toBe('7:05 am');
    expect(formatTime(12 * 60)).toBe('12:00 pm');
    expect(formatTime(21 * 60)).toBe('9:00 pm');
  });
});

describe('ghost mode', () => {
  it('is off until turned on', () => {
    expect(ghostActive({ on: false, until: null }, MONDAY)).toBe(false);
  });

  it('stays on indefinitely without an end date', () => {
    expect(ghostActive({ on: true, until: null }, MONDAY)).toBe(true);
    expect(describeGhost({ on: true, until: null }, MONDAY)).toMatch(/until you turn it off/);
  });

  it('lifts itself on the day after its end', () => {
    expect(ghostActive({ on: true, until: MONDAY }, MONDAY)).toBe(true);
    expect(ghostActive({ on: true, until: MONDAY }, '2026-09-22')).toBe(false);
  });

  it('promises nothing is deleted, every time it describes itself', () => {
    expect(describeGhost({ on: true, until: null }, MONDAY)).toMatch(/Nothing is being deleted/);
    expect(describeGhost({ on: true, until: '2026-09-25' }, MONDAY)).toMatch(/Nothing is being deleted/);
  });

  it('spells out what it suppresses rather than leaving it to trust', () => {
    expect(GHOST_SUPPRESSES.length).toBeGreaterThan(3);
    expect(GHOST_SUPPRESSES.join(' ')).toMatch(/streak pauses rather than resets/);
  });
});

describe('effectiveMode', () => {
  it('passes an explicit mode straight through', () => {
    expect(effectiveMode('fast', 'why has my bench stalled')).toBe('fast');
    expect(effectiveMode('thorough', 'what now')).toBe('thorough');
  });

  it('goes thorough for a question about a trend', () => {
    for (const q of ['why has my bench stalled', 'compare this month to last', 'am I making progress', 'what is my pattern']) {
      expect(effectiveMode('adaptive', q)).toBe('thorough');
    }
  });

  it('stays fast for a question that wants an answer now', () => {
    // Making somebody wait for a better answer to "what should I eat" is a
    // worse answer.
    for (const q of ['what should I eat', 'am I recovered', 'push me']) {
      expect(effectiveMode('adaptive', q)).toBe('fast');
    }
  });

  it('describes every mode it offers', () => {
    for (const m of ['fast', 'thorough', 'adaptive'] as const) {
      expect(THINKING_LABEL[m]).toBeTruthy();
      expect(THINKING_NOTE[m].length).toBeGreaterThan(20);
    }
  });
});

describe('the note', () => {
  it('says why a check-in stays quiet when it has nothing', () => {
    expect(CHECK_IN_NOTE).toMatch(/trains you to ignore it/);
  });
});

import {
  MEAL_TIMING_NOTE,
  dayWindow,
  formatClock,
  formatSpan,
  minutesOfDay,
  overnightFast,
  proteinSpread,
  readSpread,
  readWindow,
  typicalWindow,
  windowSeries,
} from '../domain/mealTiming';
import type { MealSlot, NutritionEntry } from '../domain/types';

const TODAY = '2026-09-21';

/** A local wall-clock time, so these tests do not depend on the machine's zone. */
const at = (date: string, hour: number, minute = 0): string => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, m! - 1, d!, hour, minute).toISOString();
};

const entry = (
  date: string,
  hour: number,
  minute: number,
  over: Partial<NutritionEntry> = {},
): NutritionEntry => ({
  id: `${date}-${hour}-${minute}-${Math.random()}`,
  date,
  slot: 'lunch',
  name: 'Food',
  quantity: 1,
  servingLabel: '1 serving',
  macros: { calories: 400, proteinG: 30, carbsG: 30, fatG: 10 },
  source: 'manual',
  isEstimate: false,
  loggedAt: at(date, hour, minute),
  ...over,
});

describe('minutesOfDay', () => {
  it('reads the local wall clock off a timestamp', () => {
    expect(minutesOfDay(at(TODAY, 7, 30))).toBe(7 * 60 + 30);
    expect(minutesOfDay(at(TODAY, 0, 0))).toBe(0);
  });

  it('refuses a timestamp it cannot parse', () => {
    expect(minutesOfDay('not a date')).toBeNull();
    expect(minutesOfDay('')).toBeNull();
  });
});

describe('formatClock', () => {
  it('reads like a clock', () => {
    expect(formatClock(0)).toBe('12:00 am');
    expect(formatClock(7 * 60 + 5)).toBe('7:05 am');
    expect(formatClock(12 * 60)).toBe('12:00 pm');
    expect(formatClock(13 * 60 + 30)).toBe('1:30 pm');
    expect(formatClock(23 * 60 + 59)).toBe('11:59 pm');
  });

  it('wraps rather than printing a 25th hour', () => {
    expect(formatClock(1440)).toBe('12:00 am');
    expect(formatClock(-60)).toBe('11:00 pm');
  });
});

describe('formatSpan', () => {
  it('reads like a duration', () => {
    expect(formatSpan(0)).toBe('0m');
    expect(formatSpan(45)).toBe('45m');
    expect(formatSpan(600)).toBe('10h');
    expect(formatSpan(860)).toBe('14h 20m');
  });
});

describe('dayWindow', () => {
  it('measures first meal to last', () => {
    const w = dayWindow([entry(TODAY, 8, 0), entry(TODAY, 13, 0), entry(TODAY, 20, 30)], TODAY)!;
    expect(formatClock(w.firstMinutes)).toBe('8:00 am');
    expect(formatClock(w.lastMinutes)).toBe('8:30 pm');
    expect(w.windowMinutes).toBe(750);
  });

  it('counts sittings, not entries', () => {
    // Rice, chicken and broccoli entered together are one meal.
    const w = dayWindow(
      [entry(TODAY, 13, 0), entry(TODAY, 13, 2), entry(TODAY, 13, 5), entry(TODAY, 19, 0)],
      TODAY,
    )!;
    expect(w.meals).toBe(2);
  });

  it('refuses a single meal rather than calling it a zero-minute window', () => {
    expect(dayWindow([entry(TODAY, 13, 0)], TODAY)).toBeNull();
    expect(dayWindow([], TODAY)).toBeNull();
  });

  it('ignores other days', () => {
    expect(dayWindow([entry('2026-09-20', 8, 0), entry(TODAY, 13, 0)], TODAY)).toBeNull();
  });
});

describe('windowSeries', () => {
  it('is oldest first and skips days with nothing logged', () => {
    const entries = [
      entry('2026-09-19', 8, 0), entry('2026-09-19', 20, 0),
      entry(TODAY, 9, 0), entry(TODAY, 19, 0),
    ];
    expect(windowSeries(entries, 7, TODAY).map((w) => w.date)).toEqual(['2026-09-19', TODAY]);
  });
});

describe('typicalWindow', () => {
  const day = (date: string, from: number, to: number) => [entry(date, from, 0), entry(date, to, 0)];

  it('uses the median, so one late night does not move the usual', () => {
    const entries = [
      ...day('2026-09-17', 8, 20),
      ...day('2026-09-18', 8, 20),
      ...day('2026-09-19', 8, 20),
      ...day('2026-09-20', 8, 23),
    ];
    const typical = typicalWindow(windowSeries(entries, 7, TODAY))!;
    expect(formatClock(typical.lastMinutes)).toBe('8:00 pm');
    expect(typical.days).toBe(4);
  });

  it('says nothing from fewer than three days', () => {
    const entries = [...day('2026-09-19', 8, 20), ...day('2026-09-20', 8, 20)];
    expect(typicalWindow(windowSeries(entries, 7, TODAY))).toBeNull();
  });
});

describe('overnightFast', () => {
  it('measures from last night to this morning', () => {
    const entries = [entry('2026-09-20', 20, 0), entry(TODAY, 8, 0)];
    expect(overnightFast(entries, TODAY)).toBe(12 * 60);
  });

  it('says nothing when both days landed on the same minute of the clock', () => {
    // A batch of entries sharing one timestamp, not a fast timed to the second.
    const entries = [entry('2026-09-20', 19, 0), entry(TODAY, 19, 0)];
    expect(overnightFast(entries, TODAY)).toBeNull();
  });

  it('still reports a genuinely long fast', () => {
    const entries = [entry('2026-09-20', 18, 0), entry(TODAY, 20, 0)];
    expect(overnightFast(entries, TODAY)).toBe(26 * 60);
  });

  it('says nothing when either end is missing', () => {
    expect(overnightFast([entry(TODAY, 8, 0)], TODAY)).toBeNull();
    expect(overnightFast([entry('2026-09-20', 20, 0)], TODAY)).toBeNull();
  });
});

describe('proteinSpread', () => {
  const meal = (slot: MealSlot, hour: number, proteinG: number) =>
    entry(TODAY, hour, 0, { slot, macros: { calories: 400, proteinG, carbsG: 30, fatG: 10 } });

  it('adds protein up per slot and marks the ones that cleared the line', () => {
    const s = proteinSpread([meal('breakfast', 8, 20), meal('lunch', 13, 45), meal('dinner', 19, 50)], TODAY)!;
    expect(s.slots.map((r) => r.proteinG)).toEqual([20, 45, 50]);
    expect(s.hitCount).toBe(2);
    expect(s.totalG).toBe(115);
  });

  it('scales by quantity', () => {
    const doubled = entry(TODAY, 13, 0, { quantity: 2, slot: 'lunch' });
    expect(proteinSpread([doubled], TODAY)!.totalG).toBe(60);
  });

  it('keeps the slots in the order of the day, not of entry', () => {
    const s = proteinSpread([meal('dinner', 19, 40), meal('breakfast', 8, 40)], TODAY)!;
    expect(s.slots.map((r) => r.slot)).toEqual(['breakfast', 'dinner']);
  });

  it('says nothing on a day with nothing logged', () => {
    expect(proteinSpread([], TODAY)).toBeNull();
  });

  it('notices when one meal carries the day', () => {
    const s = proteinSpread([meal('breakfast', 8, 10), meal('dinner', 19, 90)], TODAY)!;
    expect(s.biggestShare).toBeCloseTo(0.9, 2);
  });
});

describe('the readings', () => {
  it('calls out a day loaded into one meal', () => {
    const s = proteinSpread(
      [
        entry(TODAY, 8, 0, { slot: 'breakfast', macros: { calories: 100, proteinG: 10, carbsG: 0, fatG: 0 } }),
        entry(TODAY, 19, 0, { slot: 'dinner', macros: { calories: 600, proteinG: 90, carbsG: 0, fatG: 0 } }),
      ],
      TODAY,
    );
    expect(readSpread(s)).toMatch(/single meal/);
  });

  it('says so when it all went in at once', () => {
    const s = proteinSpread([entry(TODAY, 19, 0, { slot: 'dinner' })], TODAY);
    expect(readSpread(s)).toMatch(/one sitting/);
  });

  it('counts the sittings that cleared the line on an even day', () => {
    const s = proteinSpread(
      [
        entry(TODAY, 8, 0, { slot: 'breakfast', macros: { calories: 400, proteinG: 40, carbsG: 0, fatG: 0 } }),
        entry(TODAY, 13, 0, { slot: 'lunch', macros: { calories: 400, proteinG: 40, carbsG: 0, fatG: 0 } }),
        entry(TODAY, 19, 0, { slot: 'dinner', macros: { calories: 400, proteinG: 40, carbsG: 0, fatG: 0 } }),
      ],
      TODAY,
    );
    expect(readSpread(s)).toBe('3 of 3 sittings cleared 30g.');
  });

  it('says nothing rather than something empty', () => {
    expect(readSpread(null)).toBeNull();
    expect(readWindow(null)).toBeNull();
  });

  it('reads the window back in plain words', () => {
    const entries = ['2026-09-17', '2026-09-18', '2026-09-19'].flatMap((d) => [entry(d, 8, 0), entry(d, 20, 0)]);
    const line = readWindow(typicalWindow(windowSeries(entries, 7, TODAY)))!;
    expect(line).toMatch(/8:00 am and 8:00 pm/);
    expect(line).toMatch(/12h window/);
  });
});

describe('the note', () => {
  it('admits it measures logging, not eating', () => {
    expect(MEAL_TIMING_NOTE).toMatch(/logged, not when it was eaten/);
  });
});

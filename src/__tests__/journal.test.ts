import {
  BUILT_IN_FACTORS,
  JOURNAL_CAVEAT,
  MIN_GROUP,
  MIN_PAIRS,
  correlate,
  entriesInWindow,
  factorByKey,
  findCorrelations,
  journalStreak,
  readJournal,
  type FactorDef,
  type JournalEntry,
  type Outcome,
} from '../domain/journal';
import { addDaysISO } from '../domain/date';

const TODAY = '2026-09-21';
const alcohol = factorByKey('alcohol')!;
const caffeine = factorByKey('caffeineAfterNoon')!;

/** N days back from today, newest last. */
const dates = (n: number) => Array.from({ length: n }, (_, i) => addDaysISO(TODAY, -(n - 1 - i)));

function build(
  n: number,
  factorValue: (i: number) => number,
  outcomeValue: (i: number) => number,
  key = 'alcohol',
): { entries: JournalEntry[]; outcome: Outcome } {
  const days = dates(n);
  const entries: JournalEntry[] = days.map((date, i) => ({ date, values: { [key]: factorValue(i) } }));
  const byDate: Record<string, number> = {};
  days.forEach((date, i) => {
    byDate[date] = outcomeValue(i);
  });
  return {
    entries,
    outcome: { key: 'sleep', label: 'Sleep', byDate, unit: 'min', higherIsBetter: true, minEffect: 15 },
  };
}

describe('the factor list', () => {
  it('finds a built-in by key and returns null for something invented', () => {
    expect(factorByKey('alcohol')!.label).toBe('Alcohol');
    expect(factorByKey('nonsense')).toBeNull();
  });

  it('includes a custom factor when one is passed', () => {
    const custom: FactorDef = { key: 'sauna', label: 'Sauna', kind: 'toggle', builtIn: false };
    expect(factorByKey('sauna', [custom])!.label).toBe('Sauna');
  });

  it('marks every built-in as built-in, so none can be deleted', () => {
    expect(BUILT_IN_FACTORS.every((f) => f.builtIn)).toBe(true);
  });
});

describe('entriesInWindow', () => {
  it('keeps the window, oldest first', () => {
    const entries: JournalEntry[] = [
      { date: TODAY, values: {} },
      { date: addDaysISO(TODAY, -3), values: {} },
      { date: '2025-01-01', values: {} },
    ];
    expect(entriesInWindow(entries, TODAY, 7).map((e) => e.date)).toEqual([addDaysISO(TODAY, -3), TODAY]);
  });
});

describe('journalStreak', () => {
  it('counts consecutive days back from today', () => {
    const entries = dates(4).map((date) => ({ date, values: {} }));
    expect(journalStreak(entries, TODAY)).toBe(4);
  });

  it('does not break the streak just because today is not written yet', () => {
    // At breakfast, yesterday's streak is still yesterday's streak.
    const entries = [1, 2, 3].map((i) => ({ date: addDaysISO(TODAY, -i), values: {} }));
    expect(journalStreak(entries, TODAY)).toBe(3);
  });

  it('stops at the first missed day', () => {
    const entries = [1, 3, 4].map((i) => ({ date: addDaysISO(TODAY, -i), values: {} }));
    expect(journalStreak(entries, TODAY)).toBe(1);
  });

  it('is zero with nothing written', () => {
    expect(journalStreak([], TODAY)).toBe(0);
  });
});

describe('correlate', () => {
  it('finds a large, well-populated difference', () => {
    // Alternate drinking and dry nights; drinking nights sleep 60 min less.
    const { entries, outcome } = build(20, (i) => (i % 2 === 0 ? 3 : 0), (i) => (i % 2 === 0 ? 390 : 450));
    const c = correlate(entries, alcohol, outcome)!;
    expect(c.difference).toBe(-60);
    expect(c.favourable).toBe(false);
    expect(c.pairs).toBe(20);
  });

  it('refuses without enough paired days', () => {
    const { entries, outcome } = build(MIN_PAIRS - 1, (i) => (i % 2 === 0 ? 3 : 0), (i) => (i % 2 === 0 ? 390 : 450));
    expect(correlate(entries, alcohol, outcome)).toBeNull();
  });

  it('refuses when one side of the comparison is nearly empty', () => {
    // Nineteen dry nights and one heavy one is not a comparison.
    const { entries, outcome } = build(20, (i) => (i === 0 ? 5 : 0), (i) => (i === 0 ? 380 : 450));
    expect(correlate(entries, alcohol, outcome)).toBeNull();
    expect(MIN_GROUP).toBeGreaterThan(1);
  });

  it('refuses an effect too small to mean anything, however clean the split', () => {
    // A one-minute difference, perfectly aligned with the factor. Scaling the
    // threshold to the data's own spread would wave this through, because the
    // factor explains all of the variance — which is exactly when it looks
    // most convincing and is least worth trusting.
    const { entries, outcome } = build(30, (i) => (i % 2 === 0 ? 2 : 0), (i) => (i % 2 === 0 ? 449 : 450));
    expect(correlate(entries, alcohol, outcome)).toBeNull();
  });

  it('also refuses a real-sized effect inside a much noisier signal', () => {
    // Twenty minutes either way, on nights that already swing by two hours.
    const { entries, outcome } = build(
      30,
      (i) => (i % 2 === 0 ? 2 : 0),
      (i) => (i % 2 === 0 ? 420 : 440) + (i % 4 < 2 ? -120 : 120),
    );
    expect(correlate(entries, alcohol, outcome)).toBeNull();
  });

  it('ignores days where either side is missing', () => {
    const { entries, outcome } = build(20, (i) => (i % 2 === 0 ? 3 : 0), (i) => (i % 2 === 0 ? 390 : 450));
    delete outcome.byDate[entries[0]!.date];
    entries[1]!.values = {};
    expect(correlate(entries, alcohol, outcome)!.pairs).toBe(18);
  });

  it('splits a count at the athlete own median, not at a number from the air', () => {
    // Everybody has some caffeine; the question is "more than usual for you".
    const { entries, outcome } = build(
      20,
      (i) => (i % 2 === 0 ? 4 : 2),
      (i) => (i % 2 === 0 ? 390 : 450),
      'sunlight',
    );
    const sunlight = factorByKey('sunlight')!;
    const c = correlate(entries, sunlight, outcome)!;
    expect(c.difference).toBe(-60);
  });

  it('treats a toggle as present or absent', () => {
    const { entries, outcome } = build(
      20,
      (i) => (i % 2 === 0 ? 1 : 0),
      (i) => (i % 2 === 0 ? 400 : 460),
      'caffeineAfterNoon',
    );
    expect(correlate(entries, caffeine, outcome)!.difference).toBe(-60);
  });

  it('knows which direction is the good one', () => {
    const { entries, outcome } = build(20, (i) => (i % 2 === 0 ? 3 : 0), (i) => (i % 2 === 0 ? 480 : 420));
    expect(correlate(entries, alcohol, outcome)!.favourable).toBe(true);
  });

  it('never says one thing caused the other', () => {
    const { entries, outcome } = build(20, (i) => (i % 2 === 0 ? 3 : 0), (i) => (i % 2 === 0 ? 390 : 450));
    const note = correlate(entries, alcohol, outcome)!.note;
    expect(note).toMatch(/a pattern, not a cause/);
    expect(note).not.toMatch(/\bcauses\b|\bcausing\b|because of/i);
  });

  it('reports how many days sit in the smaller group, so the reader can judge', () => {
    const { entries, outcome } = build(20, (i) => (i % 2 === 0 ? 3 : 0), (i) => (i % 2 === 0 ? 390 : 450));
    expect(correlate(entries, alcohol, outcome)!.smallerGroup).toBe(10);
  });
});

describe('findCorrelations', () => {
  it('puts the biggest difference first', () => {
    const days = dates(20);
    const entries: JournalEntry[] = days.map((date, i) => ({
      date,
      values: { alcohol: i % 2 === 0 ? 3 : 0, caffeineAfterNoon: i % 2 === 0 ? 1 : 0 },
    }));
    const big: Record<string, number> = {};
    days.forEach((d, i) => {
      big[d] = i % 2 === 0 ? 380 : 460;
    });
    const outcome: Outcome = { key: 'sleep', label: 'Sleep', byDate: big, unit: 'min', higherIsBetter: true, minEffect: 15 };
    const found = findCorrelations(entries, [alcohol, caffeine], [outcome]);
    expect(found.length).toBe(2);
    expect(Math.abs(found[0]!.difference)).toBeGreaterThanOrEqual(Math.abs(found[1]!.difference));
  });
});

describe('readJournal', () => {
  it('invites a first entry rather than reporting nothing', () => {
    expect(readJournal([], [])).toMatch(/nothing written yet/i);
  });

  it('calls "no pattern" a real answer instead of a gap', () => {
    const entries = dates(14).map((date) => ({ date, values: {} }));
    const line = readJournal([], entries);
    expect(line).toMatch(/a real answer, not a missing one/);
  });

  it('leads with what is working against them', () => {
    const { entries, outcome } = build(20, (i) => (i % 2 === 0 ? 3 : 0), (i) => (i % 2 === 0 ? 390 : 450));
    const found = findCorrelations(entries, [alcohol], [outcome]);
    expect(readJournal(found, entries)).toMatch(/lower/);
  });
});

describe('the caveat', () => {
  it('names the confound rather than waving at one', () => {
    expect(JOURNAL_CAVEAT).toMatch(/not causes/i);
    expect(JOURNAL_CAVEAT).toMatch(/eat late/);
  });
});

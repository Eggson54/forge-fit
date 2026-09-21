import {
  MIN_BASELINE_DAYS,
  VITALS_CAVEAT,
  VITAL_HIGHER_IS_BETTER,
  VITAL_KEYS,
  VITAL_LABEL,
  baselineFor,
  readAllVitals,
  readMonitor,
  readVital,
  seriesFor,
  type VitalsDay,
} from '../domain/vitals';
import { addDaysISO } from '../domain/date';

const TODAY = '2026-09-21';

/** N days of a steady signal ending yesterday, plus today's reading. */
function history(key: 'restingHeartRate' | 'hrvMs', values: number[], end = TODAY): VitalsDay[] {
  return values.map((v, i) => ({
    date: addDaysISO(end, -(values.length - 1 - i)),
    [key]: v,
    source: 'health' as const,
  }));
}

describe('seriesFor', () => {
  it('keeps only the days that have the signal, oldest first', () => {
    const days: VitalsDay[] = [
      { date: '2026-09-20', hrvMs: 50, source: 'health' },
      { date: '2026-09-19', source: 'health' },
      { date: '2026-09-18', hrvMs: 44, source: 'health' },
    ];
    expect(seriesFor(days, 'hrvMs')).toEqual([
      { date: '2026-09-18', value: 44 },
      { date: '2026-09-20', value: 50 },
    ]);
  });

  it('drops a value that is not a finite number', () => {
    const days = [{ date: TODAY, hrvMs: Number.NaN, source: 'health' as const }];
    expect(seriesFor(days, 'hrvMs')).toEqual([]);
  });
});

describe('baselineFor', () => {
  it('refuses to call a handful of days a baseline', () => {
    const short = history('restingHeartRate', [55, 56, 54, 55]);
    expect(baselineFor(short, 'restingHeartRate', { today: TODAY })).toBeNull();
    expect(MIN_BASELINE_DAYS).toBeGreaterThan(4);
  });

  it('excludes today, so today is compared against something it did not move', () => {
    // Nine steady days then a wild one today. If today counted, the baseline
    // would chase it and the deviation would shrink.
    const days = history('restingHeartRate', [55, 55, 55, 55, 55, 55, 55, 55, 55, 90]);
    const baseline = baselineFor(days, 'restingHeartRate', { today: TODAY })!;
    expect(baseline.mean).toBe(55);
    expect(baseline.days).toBe(9);
  });

  it('ignores days older than the window', () => {
    const days = [
      ...history('restingHeartRate', [55, 55, 55, 55, 55, 55, 55, 55], addDaysISO(TODAY, -1)),
      { date: '2025-01-01', restingHeartRate: 200, source: 'health' as const },
    ];
    expect(baselineFor(days, 'restingHeartRate', { today: TODAY })!.mean).toBe(55);
  });
});

describe('readVital', () => {
  it('measures the move in standard deviations, not raw units', () => {
    const days = history('restingHeartRate', [54, 55, 56, 54, 55, 56, 54, 55, 56, 62]);
    const r = readVital(days, 'restingHeartRate', { today: TODAY })!;
    expect(r.value).toBe(62);
    expect(r.z).toBeGreaterThan(2);
    expect(r.deviation).toBe('off');
  });

  it('knows which direction is the good one', () => {
    const rhrUp = readVital(history('restingHeartRate', [55, 55, 55, 55, 55, 55, 55, 55, 55, 62]), 'restingHeartRate', { today: TODAY })!;
    const hrvUp = readVital(history('hrvMs', [50, 50, 50, 50, 50, 50, 50, 50, 50, 70]), 'hrvMs', { today: TODAY })!;
    // The same shape of move, opposite meanings.
    expect(rhrUp.favourable).toBe(false);
    expect(hrvUp.favourable).toBe(true);
    expect(VITAL_HIGHER_IS_BETTER.restingHeartRate).toBe(false);
    expect(VITAL_HIGHER_IS_BETTER.hrvMs).toBe(true);
  });

  it('calls an ordinary day ordinary', () => {
    const r = readVital(history('restingHeartRate', [54, 55, 56, 54, 55, 56, 54, 55, 56, 55]), 'restingHeartRate', { today: TODAY })!;
    expect(r.deviation).toBe('normal');
    expect(r.note).toMatch(/In line with/);
  });

  it('does not divide by a standard deviation of zero', () => {
    // A device that reports the same number every day is reporting its own
    // precision, not a body that never varies — so the scale has a floor and
    // the move is still noticed, without z running off to infinity.
    const flat = history('restingHeartRate', [55, 55, 55, 55, 55, 55, 55, 55, 55, 58]);
    const r = readVital(flat, 'restingHeartRate', { today: TODAY })!;
    expect(Number.isFinite(r.z)).toBe(true);
    expect(r.deviation).not.toBe('normal');
  });

  it('does not let a floor-scaled reading run away', () => {
    const flat = history('restingHeartRate', [55, 55, 55, 55, 55, 55, 55, 55, 55, 55.5]);
    const r = readVital(flat, 'restingHeartRate', { today: TODAY })!;
    expect(Math.abs(r.z)).toBeLessThan(1);
    expect(r.deviation).toBe('normal');
  });

  it('says nothing without a baseline, rather than comparing against a textbook', () => {
    expect(readVital(history('hrvMs', [50, 52, 48]), 'hrvMs', { today: TODAY })).toBeNull();
  });

  it('says nothing when the signal has no reading at all', () => {
    expect(readVital(history('restingHeartRate', [55, 55, 55, 55, 55, 55, 55, 55, 55]), 'hrvMs', { today: TODAY })).toBeNull();
  });

  it('writes the note in the signal own units and precision', () => {
    const r = readVital(history('restingHeartRate', [54, 55, 56, 54, 55, 56, 54, 55, 56, 62]), 'restingHeartRate', { today: TODAY })!;
    expect(r.note).toMatch(/bpm/);
    expect(r.note).not.toMatch(/\d\.\d{3}/);
  });
});

describe('readAllVitals', () => {
  it('puts the most unusual signal first', () => {
    const days: VitalsDay[] = [];
    for (let i = 9; i >= 1; i -= 1) {
      days.push({ date: addDaysISO(TODAY, -i), restingHeartRate: 55, hrvMs: 50, source: 'health' });
    }
    days.push({ date: TODAY, restingHeartRate: 56, hrvMs: 20, source: 'health' });
    const readings = readAllVitals(days, { today: TODAY });
    expect(readings[0]!.key).toBe('hrvMs');
  });

  it('leaves out every signal without a baseline', () => {
    const readings = readAllVitals(history('hrvMs', [50, 51, 49]), { today: TODAY });
    expect(readings).toEqual([]);
  });
});

describe('readMonitor', () => {
  const steady = (over: Partial<VitalsDay>): VitalsDay[] => {
    const days: VitalsDay[] = [];
    for (let i = 9; i >= 1; i -= 1) {
      days.push({ date: addDaysISO(TODAY, -i), restingHeartRate: 55, hrvMs: 50, source: 'health' });
    }
    days.push({ date: TODAY, restingHeartRate: 55, hrvMs: 50, source: 'health', ...over });
    return days;
  };

  it('says nothing at all when there is nothing to read', () => {
    expect(readMonitor([])).toBeNull();
  });

  it('calls a quiet day quiet', () => {
    expect(readMonitor(readAllVitals(steady({}), { today: TODAY }))).toMatch(/where it usually sits/);
  });

  it('does not treat a good move as a warning', () => {
    const line = readMonitor(readAllVitals(steady({ hrvMs: 75 }), { today: TODAY }))!;
    expect(line).toMatch(/direction you would want/);
  });

  it('names the worst signal, and says one alone is usually nothing', () => {
    const line = readMonitor(readAllVitals(steady({ restingHeartRate: 68 }), { today: TODAY }))!;
    expect(line).toMatch(/Resting heart rate/);
    expect(line).toMatch(/usually nothing/);
  });

  it('is more pointed when several move at once', () => {
    const line = readMonitor(readAllVitals(steady({ restingHeartRate: 68, hrvMs: 25 }), { today: TODAY }))!;
    expect(line).toMatch(/2 signals/);
  });
});

describe('the tables', () => {
  it('give every key a label, a unit and a direction', () => {
    for (const k of VITAL_KEYS) {
      expect(VITAL_LABEL[k]).toBeTruthy();
      expect(typeof VITAL_HIGHER_IS_BETTER[k]).toBe('boolean');
    }
  });
});

describe('the caveat', () => {
  it('says it is not a diagnosis and not a population range', () => {
    expect(VITALS_CAVEAT).toMatch(/diagnosis/i);
    expect(VITALS_CAVEAT).toMatch(/your own baseline/i);
    expect(VITALS_CAVEAT).toMatch(/doctor/i);
  });
});

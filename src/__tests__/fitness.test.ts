import {
  FATIGUE_DAYS,
  FITNESS_DAYS,
  fitnessSeries,
  formBand,
  loadOf,
  readFitness,
  type LoadDay,
} from '../domain/fitness';
import { addDaysISO } from '../domain/date';

function block(from: string, days: number, load: number): LoadDay[] {
  return Array.from({ length: days }, (_, i) => ({ date: addDaysISO(from, i), load }));
}

describe('fitnessSeries', () => {
  it('builds both curves from a steady block', () => {
    const series = fitnessSeries(block('2026-01-01', 60, 60), { to: addDaysISO('2026-01-01', 59) });
    expect(series).toHaveLength(60);
    const last = series[59]!;
    expect(last.fitness).toBeGreaterThan(0);
    // Fatigue is the faster average, so a steady block leaves it nearer the
    // daily load than fitness is.
    expect(last.fatigue).toBeGreaterThan(last.fitness);
  });

  it('both curves approach the steady load given long enough', () => {
    const series = fitnessSeries(block('2026-01-01', 300, 50), { to: addDaysISO('2026-01-01', 299) });
    const last = series[series.length - 1]!;
    expect(last.fitness).toBeGreaterThan(48);
    expect(last.fatigue).toBeGreaterThan(48);
    expect(Math.abs(last.form)).toBeLessThan(2);
  });

  it('fills the empty days so time off actually decays fitness', () => {
    const trained = block('2026-01-01', 30, 70);
    const series = fitnessSeries(trained, { to: addDaysISO('2026-01-01', 59) });
    expect(series).toHaveLength(60);
    const atEndOfBlock = series[29]!;
    const thirtyDaysLater = series[59]!;
    expect(thirtyDaysLater.fitness).toBeLessThan(atEndOfBlock.fitness);
    // And fatigue, being the faster curve, is all but gone.
    expect(thirtyDaysLater.fatigue).toBeLessThanOrEqual(1);
  });

  it('puts form positive after a taper', () => {
    const hard = block('2026-01-01', 40, 80);
    const easy = block('2026-02-10', 10, 15);
    const series = fitnessSeries([...hard, ...easy], { to: '2026-02-19' });
    expect(series[series.length - 1]!.form).toBeGreaterThan(0);
  });

  it('puts form negative in a heavy week', () => {
    const steady = block('2026-01-01', 40, 40);
    const spike = block('2026-02-10', 7, 140);
    const series = fitnessSeries([...steady, ...spike], { to: '2026-02-16' });
    expect(series[series.length - 1]!.form).toBeLessThan(0);
  });

  it('returns nothing for no data or a backwards window', () => {
    expect(fitnessSeries([])).toEqual([]);
    expect(fitnessSeries(block('2026-03-01', 3, 10), { from: '2026-03-01', to: '2026-02-01' })).toEqual([]);
  });

  it('uses the conventional time constants', () => {
    expect(FITNESS_DAYS).toBe(42);
    expect(FATIGUE_DAYS).toBe(7);
  });
});

describe('formBand', () => {
  const point = (fitness: number, form: number) => ({ date: '2026-01-01', fitness, fatigue: fitness - form, form, load: 0 });

  it('reads form relative to fitness, not as an absolute', () => {
    // The same −20 form is ordinary for a fit athlete and a hole for a new one.
    expect(formBand(point(120, -20))).toBe('productive');
    expect(formBand(point(30, -20))).toBe('overreaching');
  });

  it('names the bands across the range', () => {
    expect(formBand(point(100, 20))).toBe('fresh');
    expect(formBand(point(100, 0))).toBe('neutral');
    expect(formBand(point(100, -20))).toBe('productive');
    expect(formBand(point(100, -50))).toBe('overreaching');
  });

  it('does not divide by zero at the very start', () => {
    expect(formBand(point(0, 0))).toBe('neutral');
  });
});

describe('readFitness', () => {
  it('refuses while the curves are still filling from zero', () => {
    const series = fitnessSeries(block('2026-01-01', 10, 50), { to: addDaysISO('2026-01-01', 9) });
    expect(readFitness(series)).toBeNull();
  });

  it('reads a long block and says what it cannot see', () => {
    const series = fitnessSeries(block('2026-01-01', 70, 60), { to: addDaysISO('2026-01-01', 69) });
    const reading = readFitness(series)!;
    expect(reading.headline).toMatch(/fitness \d+/i);
    expect(reading.caveat).toMatch(/cannot see/i);
  });

  it('reports the four-week direction of travel', () => {
    const rising = fitnessSeries(
      [...block('2026-01-01', 30, 20), ...block('2026-01-31', 30, 90)],
      { to: addDaysISO('2026-01-01', 59) },
    );
    expect(readFitness(rising)!.fitnessChange).toBeGreaterThan(0);

    const falling = fitnessSeries(
      [...block('2026-01-01', 30, 90), ...block('2026-01-31', 30, 5)],
      { to: addDaysISO('2026-01-01', 59) },
    );
    expect(readFitness(falling)!.fitnessChange).toBeLessThan(0);
  });
});

describe('loadOf', () => {
  it('is zero for a session of no length', () => {
    expect(loadOf({ minutes: 0, effort: 5 })).toBe(0);
    expect(loadOf({ minutes: -10, effort: 5 })).toBe(0);
  });

  it('grows faster than linearly with intensity', () => {
    const easy = loadOf({ minutes: 60, effort: 2 });
    const moderate = loadOf({ minutes: 60, effort: 3 });
    const hard = loadOf({ minutes: 60, effort: 5 });
    expect(moderate).toBeGreaterThan(easy);
    // Doubling perceived intensity should more than double the cost.
    expect(hard).toBeGreaterThan(moderate * 2);
  });

  it('grows linearly with duration', () => {
    expect(loadOf({ minutes: 120, effort: 3 })).toBeCloseTo(loadOf({ minutes: 60, effort: 3 }) * 2, 0);
  });

  it('prefers heart rate over a rating when it has one', () => {
    const rated = loadOf({ minutes: 60, effort: 2 });
    const measured = loadOf({ minutes: 60, effort: 2, hrFraction: 0.9 });
    expect(measured).toBeGreaterThan(rated);
  });

  it('assumes a middling effort when nobody rated it', () => {
    expect(loadOf({ minutes: 60, effort: null })).toBe(loadOf({ minutes: 60, effort: 3 }));
  });
});

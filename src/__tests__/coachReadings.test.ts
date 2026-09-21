import { readingAnswer, type CoachReadingData } from '../domain/coachReadings';

const base: CoachReadingData = {
  maintenanceKcal: 2680,
  meanIntakeKcal: 2310,
  kgPerWeek: -0.34,
  confidence: 'good',
  needsMoreDays: 0,
  needsMoreWeighIns: 0,
  targetCalories: 2400,
  formulaKcal: 2850,
  recoveryLine: 'Quads and Calves have been waiting — quads 9 days.',
  readyMuscles: ['Chest', 'Back'],
  overdueMuscles: ['Quads', 'Calves'],
  bodyFatPct: 16.4,
  bodyFatBandLabel: 'Fitness',
  bodyFatDeltaPct: -2.1,
  units: 'metric',
};

const d = (over: Partial<CoachReadingData> = {}): CoachReadingData => ({ ...base, ...over });

describe('the energy answer', () => {
  it('gives the measured figure and says it was measured', () => {
    const text = readingAnswer('energy', d());
    expect(text).toContain('2,680 kcal');
    expect(text).toMatch(/measured, not predicted/i);
    expect(text).toContain('2,310 kcal');
  });

  it('describes the trend in the athlete\'s own units', () => {
    expect(readingAnswer('energy', d())).toMatch(/0\.3 kg a week/);
    expect(readingAnswer('energy', d({ units: 'imperial' }))).toMatch(/0\.7 lb a week/);
  });

  it('calls a flat bodyweight flat rather than inventing a direction', () => {
    expect(readingAnswer('energy', d({ kgPerWeek: 0 }))).toMatch(/held flat/i);
    expect(readingAnswer('energy', d({ kgPerWeek: -0.01 }))).toMatch(/held flat/i);
  });

  it('places the current target against it', () => {
    const text = readingAnswer('energy', d({ targetCalories: 2400 }));
    expect(text).toMatch(/280 kcal under/);
  });

  it('says nothing about a gap when the target is maintenance', () => {
    const text = readingAnswer('energy', d({ targetCalories: 2680 }));
    expect(text).not.toMatch(/under|over that/);
  });

  it('refuses to guess a maintenance figure, and says what would fix it', () => {
    const text = readingAnswer('energy', d({ maintenanceKcal: null, needsMoreDays: 4, needsMoreWeighIns: 2 }));
    expect(text).not.toContain('2,680');
    expect(text).toMatch(/4 more days/);
    expect(text).toMatch(/2 more weigh-ins/);
    // It still tells them what their target is rather than leaving them with nothing.
    expect(text).toContain('2,400 kcal');
  });

  it('says a day and a weigh-in in the singular', () => {
    const text = readingAnswer('energy', d({ maintenanceKcal: null, needsMoreDays: 1, needsMoreWeighIns: 1 }));
    expect(text).toMatch(/1 more day of food/);
    expect(text).toMatch(/1 more weigh-in/);
  });

  it('never presents itself as a prescription', () => {
    expect(readingAnswer('energy', d())).toMatch(/none of this is a prescription/i);
  });
});

describe('the recovery answer', () => {
  it('leads with the reading', () => {
    expect(readingAnswer('recovery', d())).toMatch(/^Quads and Calves have been waiting/);
  });

  it('does not repeat the muscles the summary line already named', () => {
    const text = readingAnswer('recovery', d({ recoveryLine: 'Quads and Calves have been waiting — quads 9 days.' }));
    expect(text).not.toMatch(/Longest wait/);
    expect(text.match(/Quads/g) ?? []).toHaveLength(1);
  });

  it('adds the longest wait when the summary named something else', () => {
    const text = readingAnswer('recovery', d({ recoveryLine: 'Everything is inside its window.' }));
    expect(text).toMatch(/Longest wait: Quads and Calves/);
  });

  it('names what is available when nothing is overdue', () => {
    const text = readingAnswer('recovery', d({ overdueMuscles: [] }));
    expect(text).toMatch(/Recovered and available: Chest and Back/);
  });

  it('agrees with itself about number', () => {
    const line = 'Everything is inside its window.';
    expect(readingAnswer('recovery', d({ recoveryLine: line, overdueMuscles: ['Quads'] }))).toMatch(/it is overdue/);
    expect(readingAnswer('recovery', d({ recoveryLine: line }))).toMatch(/they are overdue/);
  });

  it('says there is nothing to read rather than reading nothing', () => {
    const text = readingAnswer('recovery', d({ recoveryLine: null }));
    expect(text).toMatch(/haven't logged a session/i);
  });

  it('admits what it cannot see', () => {
    expect(readingAnswer('recovery', d())).toMatch(/sore/i);
  });
});

describe('the composition answer', () => {
  it('gives the estimate, the band and the direction', () => {
    const text = readingAnswer('composition', d());
    expect(text).toContain('16.4%');
    expect(text).toMatch(/fitness band/);
    expect(text).toMatch(/2\.1 points down/);
  });

  it('says there is no direction from one reading', () => {
    expect(readingAnswer('composition', d({ bodyFatDeltaPct: null }))).toMatch(/one reading so far/i);
  });

  it('asks for the measurements it needs instead of guessing', () => {
    const text = readingAnswer('composition', d({ bodyFatPct: null }));
    expect(text).toMatch(/neck and waist/i);
    expect(text).not.toContain('%');
  });

  it('calls it a tape estimate rather than a measurement', () => {
    expect(readingAnswer('composition', d())).toMatch(/tape, not a scanner/i);
  });
});

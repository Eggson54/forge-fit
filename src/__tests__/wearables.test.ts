import {
  coverageOf,
  normaliseActivity,
  normaliseRecovery,
  normaliseSleep,
  providerLabel,
  qualityFromEfficiency,
  type OwActivitySummary,
  type OwRecoverySummary,
  type OwSleepSummary,
} from '../domain/wearables';

const src = (provider: string) => ({ provider, source: provider, device: null });

describe('qualityFromEfficiency', () => {
  it('bands where sleep efficiency actually sits', () => {
    // Efficiency clusters high; a linear 0-100 map would put nearly every
    // night at 4 or 5 and make the rating meaningless.
    expect(qualityFromEfficiency(95)).toBe(5);
    expect(qualityFromEfficiency(89)).toBe(4);
    expect(qualityFromEfficiency(83)).toBe(3);
    expect(qualityFromEfficiency(75)).toBe(2);
    expect(qualityFromEfficiency(60)).toBe(1);
  });

  it('returns nothing when the provider did not report it', () => {
    expect(qualityFromEfficiency(null)).toBeNull();
    expect(qualityFromEfficiency(undefined)).toBeNull();
    expect(qualityFromEfficiency(0)).toBeNull();
  });
});

describe('normaliseSleep', () => {
  const row = (over: Partial<OwSleepSummary> = {}): OwSleepSummary => ({
    date: '2026-09-20', source: src('whoop'), duration_minutes: 431,
    efficiency_percent: 91.2, ...over,
  });

  it('reads a Whoop-shaped night', () => {
    const [night] = normaliseSleep([row()]);
    expect(night!.date).toBe('2026-09-20');
    expect(night!.minutes).toBe(431);
    expect(night!.quality).toBe(4);
    expect(night!.provider).toBe('whoop');
  });

  it('uses the nap-free duration, not the day total', () => {
    // Falling back to the total would silently count an afternoon nap as
    // part of the night and inflate every sleep score.
    const [night] = normaliseSleep([row({ duration_minutes: 420, total_duration_minutes: 480 })]);
    expect(night!.minutes).toBe(420);
  });

  it('falls back to the total only when there is no nap-free figure', () => {
    const [night] = normaliseSleep([row({ duration_minutes: null, total_duration_minutes: 465 })]);
    expect(night!.minutes).toBe(465);
  });

  it('carries sleep stages when the provider reports them', () => {
    const [night] = normaliseSleep([
      row({ stages: { awake_minutes: 22, light_minutes: 210, deep_minutes: 95, rem_minutes: 104 } }),
    ]);
    expect(night!.stages).toEqual({ awake: 22, light: 210, deep: 95, rem: 104 });
  });

  it('reports no stages rather than four zeroes when the provider has none', () => {
    expect(normaliseSleep([row({ stages: null })])[0]!.stages).toBeNull();
    expect(normaliseSleep([row({ stages: { awake_minutes: null, light_minutes: null, deep_minutes: null, rem_minutes: null } })])[0]!.stages).toBeNull();
  });

  it('keeps a partial stage breakdown, filling the missing ones with zero', () => {
    const [night] = normaliseSleep([row({ stages: { deep_minutes: 90, awake_minutes: null, light_minutes: null, rem_minutes: null } })]);
    expect(night!.stages).toEqual({ awake: 0, light: 0, deep: 90, rem: 0 });
  });

  it('drops a night with no duration at all', () => {
    expect(normaliseSleep([row({ duration_minutes: null, total_duration_minutes: null })])).toEqual([]);
    expect(normaliseSleep([row({ duration_minutes: 0 })])).toEqual([]);
  });

  it('drops a row whose date is not one', () => {
    expect(normaliseSleep([row({ date: 'yesterday' })])).toEqual([]);
    expect(normaliseSleep([row({ date: '' })])).toEqual([]);
  });

  it('trims a full timestamp to the day this app keys on', () => {
    expect(normaliseSleep([row({ date: '2026-09-20T23:14:00Z' })])[0]!.date).toBe('2026-09-20');
  });

  it('keeps the first row for a day when two devices both wrote it', () => {
    // Their API orders by the priority configured in the service. Averaging
    // a watch and a ring gives a number neither of them measured.
    const nights = normaliseSleep([
      row({ duration_minutes: 431, source: src('whoop') }),
      row({ duration_minutes: 402, source: src('oura') }),
    ]);
    expect(nights).toHaveLength(1);
    expect(nights[0]!.provider).toBe('whoop');
  });

  it('survives an empty response', () => {
    expect(normaliseSleep([])).toEqual([]);
  });
});

describe('normaliseActivity', () => {
  const row = (over: Partial<OwActivitySummary> = {}): OwActivitySummary => ({
    date: '2026-09-20', source: src('garmin'), steps: 11_204,
    active_calories_kcal: 612.4, distance_meters: 8420.5, ...over,
  });

  it('reads a Garmin-shaped day', () => {
    const [day] = normaliseActivity([row()]);
    expect(day).toEqual({ date: '2026-09-20', steps: 11_204, activeKcal: 612, distanceM: 8421, provider: 'garmin' });
  });

  it('keeps a day with only some of the fields', () => {
    const [day] = normaliseActivity([row({ active_calories_kcal: null, distance_meters: null })]);
    expect(day!.steps).toBe(11_204);
    expect(day!.activeKcal).toBeNull();
  });

  it('drops an entirely empty day rather than writing zeroes over the phone', () => {
    // The service returns a row for every day it knows about, including ones
    // with nothing in them. A zero would overwrite what the phone recorded.
    expect(normaliseActivity([row({ steps: null, active_calories_kcal: null, distance_meters: null })])).toEqual([]);
  });

  it('treats a negative or non-finite figure as missing', () => {
    expect(normaliseActivity([row({ steps: -5, active_calories_kcal: null, distance_meters: null })])).toEqual([]);
    expect(normaliseActivity([row({ steps: Number.NaN, active_calories_kcal: 300, distance_meters: null })])[0]!.steps).toBeNull();
  });
});

describe('normaliseRecovery', () => {
  const row = (over: Partial<OwRecoverySummary> = {}): OwRecoverySummary => ({
    date: '2026-09-20', source: src('whoop'), resting_heart_rate_bpm: 48,
    avg_hrv_rmssd_ms: 71.3, avg_hrv_sdnn_ms: null, avg_spo2_percent: 97.2, ...over,
  });

  it('reads a Whoop recovery row and marks the HRV flavour', () => {
    const [day] = normaliseRecovery([row()]);
    expect(day!.restingHeartRate).toBe(48);
    expect(day!.hrvMs).toBeCloseTo(71.3, 1);
    expect(day!.hrvKind).toBe('rmssd');
    expect(day!.oxygenSaturationPct).toBeCloseTo(97.2, 1);
  });

  it('prefers SDNN when both are present', () => {
    // The two differ by a factor of two or more. Mixing them would make a
    // change of device look like a change in the athlete.
    const [day] = normaliseRecovery([row({ avg_hrv_sdnn_ms: 52.1, avg_hrv_rmssd_ms: 71.3 })]);
    expect(day!.hrvMs).toBeCloseTo(52.1, 1);
    expect(day!.hrvKind).toBe('sdnn');
  });

  it('records no HRV flavour when there is no HRV', () => {
    const [day] = normaliseRecovery([row({ avg_hrv_sdnn_ms: null, avg_hrv_rmssd_ms: null })]);
    expect(day!.hrvMs).toBeUndefined();
    expect(day!.hrvKind).toBeNull();
  });

  it('marks the days as coming from a device, not typed in', () => {
    expect(normaliseRecovery([row()])[0]!.source).toBe('health');
  });

  it('drops a row with nothing measured in it', () => {
    expect(normaliseRecovery([row({
      resting_heart_rate_bpm: null, avg_hrv_sdnn_ms: null, avg_hrv_rmssd_ms: null, avg_spo2_percent: null,
    })])).toEqual([]);
  });
});

describe('coverageOf', () => {
  it('reports what each provider actually supplied, busiest first', () => {
    const coverage = coverageOf([
      { date: '2026-09-01', provider: 'garmin' },
      { date: '2026-09-02', provider: 'garmin' },
      { date: '2026-09-03', provider: 'garmin' },
      { date: '2026-03-01', provider: 'whoop' },
    ]);
    expect(coverage[0]).toEqual({ provider: 'garmin', days: 3, first: '2026-09-01', last: '2026-09-03' });
    // A Whoop linked in March and not worn since should show as exactly that,
    // rather than as a green tick.
    expect(coverage[1]).toEqual({ provider: 'whoop', days: 1, first: '2026-03-01', last: '2026-03-01' });
  });

  it('is empty for no rows', () => {
    expect(coverageOf([])).toEqual([]);
  });
});

describe('providerLabel', () => {
  it('names the ones the service supports', () => {
    expect(providerLabel('whoop')).toBe('WHOOP');
    expect(providerLabel('health_connect')).toBe('Health Connect');
  });

  it('makes something readable out of one it has never seen', () => {
    expect(providerLabel('new_band')).toBe('new band');
  });
});

import {
  DUPLICATE_WINDOW_S,
  cardioTypeFor,
  dedupe,
  readWorkout,
  sourceOf,
  summarise,
  type HkWorkout,
  type ImportedWorkout,
} from '../domain/healthWorkouts';

const garmin = (over: Partial<HkWorkout> = {}): HkWorkout => ({
  uuid: 'u1',
  workoutActivityType: 37,
  duration: 1800,
  totalDistance: { quantity: 5000, unit: 'm' },
  totalEnergyBurned: { quantity: 420, unit: 'kcal' },
  startDate: '2026-09-20T07:00:00.000Z',
  endDate: '2026-09-20T07:30:00.000Z',
  sourceRevision: { source: { name: 'Garmin Connect', bundleIdentifier: 'com.garmin.connect.mobile' } },
  ...over,
});

describe('cardioTypeFor', () => {
  it('maps the common activity numbers', () => {
    expect(cardioTypeFor(37)).toBe('run');
    expect(cardioTypeFor(13)).toBe('ride');
    expect(cardioTypeFor(52)).toBe('walk');
    expect(cardioTypeFor(46)).toBe('swim');
    expect(cardioTypeFor(24)).toBe('hike');
  });

  it('collapses both strength types onto one', () => {
    expect(cardioTypeFor(20)).toBe('strength');
    expect(cardioTypeFor(50)).toBe('strength');
  });

  it('calls anything unrecognised "other" rather than guessing', () => {
    // Yoga imported as a run would put a 45-minute distanceless "run" into
    // the training load.
    expect(cardioTypeFor(57)).toBe('other');
    expect(cardioTypeFor(undefined)).toBe('other');
  });
});

describe('sourceOf', () => {
  it('reads a Garmin bundle identifier', () => {
    expect(sourceOf(garmin())).toBe('garmin');
  });

  it('prefers productType, which is the only thing that identifies a Watch', () => {
    // Both a Watch recording and the Health app relaying someone else's data
    // carry an Apple bundle id; only productType separates them.
    expect(
      sourceOf({ sourceRevision: { productType: 'Watch6,1', source: { bundleIdentifier: 'com.apple.health' } } }),
    ).toBe('apple_watch');
    expect(
      sourceOf({ sourceRevision: { productType: 'iPhone14,2', source: { bundleIdentifier: 'com.apple.health' } } }),
    ).toBe('iphone');
  });

  it('falls back to the display name when there is no bundle id', () => {
    expect(sourceOf({ sourceRevision: { source: { name: 'WHOOP' } } })).toBe('whoop');
    expect(sourceOf({ sourceRevision: { source: { name: 'Polar Flow' } } })).toBe('polar');
  });

  it('prefers the bundle id over the name, since names get rebranded', () => {
    expect(
      sourceOf({ sourceRevision: { source: { name: 'Something Else', bundleIdentifier: 'com.strava.stravaride' } } }),
    ).toBe('strava');
  });

  it('is "other" for anything unknown rather than a wrong guess', () => {
    expect(sourceOf({})).toBe('other');
    expect(sourceOf({ sourceRevision: { source: { name: 'Some Tracker', bundleIdentifier: 'io.example.app' } } })).toBe(
      'other',
    );
  });
});

describe('readWorkout', () => {
  it('reads an ordinary Garmin run', () => {
    const w = readWorkout(garmin())!;
    expect(w.type).toBe('run');
    expect(w.durationS).toBe(1800);
    expect(w.distanceM).toBe(5000);
    expect(w.energyKcal).toBe(420);
    expect(w.source).toBe('garmin');
    expect(w.sourceName).toBe('Garmin Connect');
  });

  it('converts a distance reported in kilometres', () => {
    // A silent km-for-m mix-up turns a 10 km run into 10 metres.
    const w = readWorkout(garmin({ totalDistance: { quantity: 10, unit: 'km' } }))!;
    expect(w.distanceM).toBe(10000);
  });

  it('converts energy reported in kilojoules', () => {
    const w = readWorkout(garmin({ totalEnergyBurned: { quantity: 1757, unit: 'kJ' } }))!;
    expect(w.energyKcal).toBe(420);
  });

  it('keeps a missing distance as null rather than zero', () => {
    // A gym session genuinely has no distance; zero would read as a measured
    // nought and drag any per-distance average down.
    const w = readWorkout(garmin({ totalDistance: undefined }))!;
    expect(w.distanceM).toBeNull();
  });

  it('rejects a record with no uuid or no dates', () => {
    expect(readWorkout(garmin({ uuid: undefined }))).toBeNull();
    expect(readWorkout(garmin({ startDate: undefined }))).toBeNull();
    expect(readWorkout(garmin({ endDate: undefined }))).toBeNull();
  });

  it('rejects a zero or missing duration', () => {
    expect(readWorkout(garmin({ duration: 0 }))).toBeNull();
    expect(readWorkout(garmin({ duration: undefined }))).toBeNull();
  });

  it('accepts Date objects as well as ISO strings', () => {
    // The library's JS wrapper converts these to Date; its raw layer does not.
    const w = readWorkout(
      garmin({ startDate: new Date('2026-09-20T07:00:00.000Z'), endDate: new Date('2026-09-20T07:30:00.000Z') }),
    )!;
    expect(w.startedAt).toBe('2026-09-20T07:00:00.000Z');
    expect(w.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rejects an unparseable date rather than producing an Invalid Date', () => {
    expect(readWorkout(garmin({ startDate: 'not a date' }))).toBeNull();
    expect(readWorkout(garmin({ startDate: new Date('nonsense') }))).toBeNull();
  });

  it('dates a workout by its local start', () => {
    const w = readWorkout(garmin({ startDate: '2026-09-20T07:00:00.000Z' }))!;
    expect(w.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('falls back to a readable source name when the app gave none', () => {
    const w = readWorkout(garmin({ sourceRevision: { source: { bundleIdentifier: 'com.garmin.connect.mobile' } } }))!;
    expect(w.sourceName).toBe('Garmin');
  });
});

describe('dedupe', () => {
  const made = (over: Partial<ImportedWorkout>): ImportedWorkout => ({
    uuid: 'x',
    date: '2026-09-20',
    startedAt: '2026-09-20T07:00:00.000Z',
    endedAt: '2026-09-20T07:30:00.000Z',
    type: 'run',
    durationS: 1800,
    distanceM: 5000,
    energyKcal: 400,
    source: 'garmin',
    sourceName: 'Garmin Connect',
    ...over,
  });

  it('keeps the watch record and drops Strava’s copy of it', () => {
    // Strava is usually an echo of what the watch recorded, not a separate
    // measurement. Importing both doubles the week's distance.
    const kept = dedupe([
      made({ uuid: 'strava', source: 'strava', startedAt: '2026-09-20T07:02:00.000Z' }),
      made({ uuid: 'garmin', source: 'garmin' }),
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.source).toBe('garmin');
  });

  it('keeps two genuinely different sessions on the same day', () => {
    const kept = dedupe([
      made({ uuid: 'a', startedAt: '2026-09-20T07:00:00.000Z' }),
      made({ uuid: 'b', startedAt: '2026-09-20T18:00:00.000Z' }),
    ]);
    expect(kept).toHaveLength(2);
  });

  it('does not merge different activity types that started together', () => {
    // A brick session: ride then run, logged as starting at the same time by
    // two different apps. They are not duplicates of each other.
    const kept = dedupe([
      made({ uuid: 'ride', type: 'ride' }),
      made({ uuid: 'run', type: 'run' }),
    ]);
    expect(kept).toHaveLength(2);
  });

  it('treats a start just inside the window as the same session', () => {
    const kept = dedupe([
      made({ uuid: 'a', source: 'garmin' }),
      made({
        uuid: 'b',
        source: 'strava',
        startedAt: new Date(Date.parse('2026-09-20T07:00:00.000Z') + (DUPLICATE_WINDOW_S - 10) * 1000).toISOString(),
      }),
    ]);
    expect(kept).toHaveLength(1);
  });

  it('treats a start outside the window as a separate session', () => {
    const kept = dedupe([
      made({ uuid: 'a', source: 'garmin' }),
      made({
        uuid: 'b',
        source: 'strava',
        startedAt: new Date(Date.parse('2026-09-20T07:00:00.000Z') + (DUPLICATE_WINDOW_S + 60) * 1000).toISOString(),
      }),
    ]);
    expect(kept).toHaveLength(2);
  });

  it('prefers the longer record when two equal-ranked sources collide', () => {
    const kept = dedupe([
      made({ uuid: 'short', source: 'garmin', durationS: 1200 }),
      made({ uuid: 'long', source: 'garmin', durationS: 1800 }),
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.uuid).toBe('long');
  });

  it('returns newest first', () => {
    const kept = dedupe([
      made({ uuid: 'a', startedAt: '2026-09-18T07:00:00.000Z' }),
      made({ uuid: 'c', startedAt: '2026-09-20T07:00:00.000Z' }),
      made({ uuid: 'b', startedAt: '2026-09-19T07:00:00.000Z' }),
    ]);
    expect(kept.map((k) => k.uuid)).toEqual(['c', 'b', 'a']);
  });

  it('is stable rather than order-dependent', () => {
    const rows = [
      made({ uuid: 'a', source: 'garmin' }),
      made({ uuid: 'b', source: 'strava', startedAt: '2026-09-20T07:01:00.000Z' }),
    ];
    expect(dedupe(rows).map((k) => k.uuid)).toEqual(dedupe([...rows].reverse()).map((k) => k.uuid));
  });

  it('handles an empty list', () => {
    expect(dedupe([])).toEqual([]);
  });
});

describe('summarise', () => {
  const made = (source: ImportedWorkout['source'], uuid: string): ImportedWorkout => ({
    uuid,
    date: '2026-09-20',
    startedAt: '2026-09-20T07:00:00.000Z',
    endedAt: '2026-09-20T07:30:00.000Z',
    type: 'run',
    durationS: 1800,
    distanceM: 5000,
    energyKcal: 400,
    source,
    sourceName: source,
  });

  it('counts by source, commonest first', () => {
    const kept = [made('garmin', 'a'), made('garmin', 'b'), made('apple_watch', 'c')];
    const s = summarise(kept, kept);
    expect(s.total).toBe(3);
    expect(s.bySource[0]).toEqual({ source: 'garmin', label: 'Garmin', count: 2 });
    expect(s.duplicatesDropped).toBe(0);
  });

  it('reports how many duplicates were dropped', () => {
    const raw = [made('garmin', 'a'), made('strava', 'b')];
    const s = summarise(raw, [raw[0]!]);
    expect(s.duplicatesDropped).toBe(1);
  });
});

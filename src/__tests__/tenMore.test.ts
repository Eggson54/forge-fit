import { ACHIEVEMENT_CATALOG, remainingLabel } from '../domain/achievements';
import { EFFORT_LABEL, effortSeries, readEffort } from '../domain/effort';
import { onThisDay } from '../domain/onThisDay';
import { exerciseNotes, strengthCurve } from '../domain/records';
import { buildCsv, csvCell, csvFilename, csvRows } from '../domain/csv';
import { canImport, inspectImport } from '../domain/importShape';
import { EXPORT_VERSION, buildExport } from '../domain/exportShape';
import { STORE_KEYS, UNEXPORTED_STORES, type StoreKey } from '../domain/storeKeys';
import { NOT_RESTORED, RESTORE_MAP } from '../domain/restoreMap';
import type { SetEntry, Workout } from '../domain/types';

const set = (over: Partial<SetEntry> = {}): SetEntry => ({
  id: Math.random().toString(36).slice(2),
  weightKg: 100,
  reps: 5,
  rpe: null,
  completed: true,
  ...over,
});

const workout = (date: string, over: Partial<Workout> = {}, sets: SetEntry[] = [set()], notes?: string): Workout =>
  ({
    id: `w_${date}_${Math.random()}`,
    name: 'Session',
    date,
    completedAt: `${date}T18:00:00.000Z`,
    status: 'completed',
    exercises: [
      { id: 'we', exerciseId: 'bench', name: 'Bench', primaryMuscle: 'chest', restSeconds: 120, sets, notes },
    ],
    ...over,
  }) as unknown as Workout;

describe('session effort', () => {
  it('says nothing useful until enough sessions are rated', () => {
    // Two data points is an anecdote, and "overreaching" is a diagnosis this
    // app cannot support.
    const r = readEffort([workout('2026-09-01', { effort: 5 }), workout('2026-09-02', { effort: 5 })]);
    expect(r.average).toBeNull();
    expect(r.headline).toMatch(/Not enough/);
    expect(r.rated).toBe(2);
  });

  it('averages the ratings once there are some', () => {
    const r = readEffort([
      workout('2026-09-01', { effort: 2 }),
      workout('2026-09-02', { effort: 3 }),
      workout('2026-09-03', { effort: 4 }),
    ]);
    expect(r.average).toBe(3);
    expect(r.hard).toBe(1);
  });

  it('remarks when most sessions land at the top of the scale', () => {
    const r = readEffort([
      workout('2026-09-01', { effort: 5 }),
      workout('2026-09-02', { effort: 4 }),
      workout('2026-09-03', { effort: 5 }),
      workout('2026-09-04', { effort: 2 }),
    ]);
    expect(r.headline).toMatch(/felt hard/);
    // Still framed as a record, not a verdict.
    expect(r.detail).toMatch(/not a verdict/);
  });

  it('ignores unrated and unfinished sessions', () => {
    const unfinished = workout('2026-09-04', { effort: 5, status: 'in_progress' } as never);
    const r = readEffort([
      workout('2026-09-01', { effort: 3 }),
      workout('2026-09-02'),
      workout('2026-09-03', { effort: 3 }),
      workout('2026-09-05', { effort: 3 }),
      unfinished,
    ]);
    expect(r.rated).toBe(3);
    expect(r.total).toBe(4);
  });

  it('series is oldest first and carries only rated sessions', () => {
    const s = effortSeries([workout('2026-09-05', { effort: 4 }), workout('2026-09-01', { effort: 2 }), workout('2026-09-03')]);
    expect(s).toEqual([
      { date: '2026-09-01', value: 2 },
      { date: '2026-09-05', value: 4 },
    ]);
  });

  it('every point on the scale has a label', () => {
    for (const v of [1, 2, 3, 4, 5] as const) expect(EFFORT_LABEL[v].length).toBeGreaterThan(2);
  });
});

describe('onThisDay', () => {
  it('matches the same calendar day a year back', () => {
    const hits = onThisDay([workout('2025-09-20')], '2026-09-20');
    expect(hits).toHaveLength(1);
    expect(hits[0].ago).toBe('A year ago today');
  });

  it('counts whole months too', () => {
    expect(onThisDay([workout('2026-03-20')], '2026-09-20')[0].ago).toBe('6 months ago today');
  });

  it('will not stretch to a nearby date', () => {
    // "Something roughly like this, some time ago" is a search result, not a
    // memory.
    expect(onThisDay([workout('2025-09-19')], '2026-09-20')).toEqual([]);
    expect(onThisDay([workout('2025-09-21')], '2026-09-20')).toEqual([]);
  });

  it('skips the recent past, where there is no distance to enjoy', () => {
    expect(onThisDay([workout('2026-08-20')], '2026-09-20')).toEqual([]);
    expect(onThisDay([workout('2026-06-20')], '2026-09-20')).toHaveLength(1);
  });

  it('never returns today or the future', () => {
    expect(onThisDay([workout('2026-09-20'), workout('2027-09-20')], '2026-09-20')).toEqual([]);
  });

  it('orders closest first', () => {
    const hits = onThisDay([workout('2024-09-20'), workout('2025-09-20')], '2026-09-20');
    expect(hits.map((h) => h.monthsAgo)).toEqual([12, 24]);
    expect(hits[1].ago).toBe('2 years ago today');
  });
});

describe('exerciseNotes', () => {
  it('collects notes for one lift, newest first', () => {
    const notes = exerciseNotes(
      [
        workout('2026-09-01', {}, [set()], 'elbows flared'),
        workout('2026-09-10', {}, [set()], 'felt easy'),
        workout('2026-09-05', {}, [set()], '   '),
      ],
      'bench',
    );
    expect(notes.map((n) => n.note)).toEqual(['felt easy', 'elbows flared']);
  });

  it('ignores notes on other lifts', () => {
    const squat = workout('2026-09-01', {}, [set()], 'deep');
    (squat.exercises[0] as { exerciseId: string }).exerciseId = 'squat';
    expect(exerciseNotes([squat], 'bench')).toEqual([]);
  });
});

describe('strengthCurve', () => {
  it('credits a heavy high-rep set at every lower rep count', () => {
    // 100 x 8 proves 100 x 5; a curve that ignores that has holes in it.
    const curve = strengthCurve([workout('2026-09-01', {}, [set({ weightKg: 100, reps: 8 })])], 'bench');
    expect(curve.find((p) => p.reps === 5)!.weightKg).toBe(100);
    expect(curve.find((p) => p.reps === 8)!.weightKg).toBe(100);
    expect(curve.find((p) => p.reps === 9)).toBeUndefined();
  });

  it('keeps the heaviest at each rep count', () => {
    const curve = strengthCurve(
      [
        workout('2026-09-01', {}, [set({ weightKg: 120, reps: 3 })]),
        workout('2026-09-08', {}, [set({ weightKg: 90, reps: 10 })]),
      ],
      'bench',
    );
    expect(curve.find((p) => p.reps === 3)!.weightKg).toBe(120);
    expect(curve.find((p) => p.reps === 10)!.weightKg).toBe(90);
  });

  it('ignores warm-ups and is sorted by reps', () => {
    const curve = strengthCurve(
      [workout('2026-09-01', {}, [set({ weightKg: 200, reps: 2, kind: 'warmup' }), set({ weightKg: 80, reps: 5 })])],
      'bench',
    );
    expect(Math.max(...curve.map((p) => p.weightKg))).toBe(80);
    expect(curve.map((p) => p.reps)).toEqual([...curve.map((p) => p.reps)].sort((a, b) => a - b));
  });

  it('is empty for a lift never done', () => {
    expect(strengthCurve([workout('2026-09-01')], 'squat')).toEqual([]);
  });
});

describe('csv', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(null)).toBe('');
  });

  it('defuses a leading character a spreadsheet would execute', () => {
    // A note in someone's training log should not become a live formula.
    for (const risky of ['=SUM(A1)', '+1', '-1+1', '@cmd']) {
      const cell = csvCell(risky);
      expect(cell.startsWith('"\'')).toBe(true);
    }
  });

  it('joins rows with CRLF, as the format specifies', () => {
    expect(csvRows([['a', 'b'], [1, 2]])).toBe('a,b\r\n1,2');
  });

  it('writes one section per table and skips empty ones', () => {
    const out = buildCsv([
      { name: 'Workouts', headers: ['date'], rows: [['2026-09-01']] },
      { name: 'Empty', headers: ['x'], rows: [] },
    ]);
    expect(out).toContain('# Workouts');
    expect(out).not.toContain('# Empty');
  });

  it('names the file by date', () => {
    expect(csvFilename(new Date('2026-09-20T10:00:00Z'))).toBe('forgefit-export-2026-09-20.csv');
  });
});

describe('import validation', () => {
  const snapshots = Object.fromEntries(
    (Object.keys(STORE_KEYS) as StoreKey[])
      .filter((k) => !UNEXPORTED_STORES.includes(k))
      .map((k) => [k, { items: [{ id: 1 }, { id: 2 }] }]),
  ) as never;

  it('accepts a document this app produced', () => {
    const doc = buildExport(snapshots, new Date('2026-09-20T10:00:00Z'));
    const report = inspectImport(doc);
    expect(report.ok).toBe(true);
    expect(report.version).toBe(EXPORT_VERSION);
    expect(report.exportedAt).toBe('2026-09-20T10:00:00.000Z');
    expect(report.counts.every((c) => c.records === 2)).toBe(true);
  });

  it('rejects anything that is not one of ours', () => {
    for (const bad of [null, 'a string', 42, [], {}, { app: 'SomethingElse', version: 1 }]) {
      expect(inspectImport(bad).ok).toBe(false);
      expect(inspectImport(bad).problems.length).toBeGreaterThan(0);
    }
  });

  it('rejects a versionless file rather than guessing at its shape', () => {
    expect(inspectImport({ app: 'ForgeFit', workouts: [] }).ok).toBe(false);
  });

  it('rejects a valid but empty export', () => {
    const report = inspectImport({ app: 'ForgeFit', version: 2, exportedAt: 'x' });
    expect(report.ok).toBe(false);
    expect(report.problems[0]).toMatch(/no records/);
  });

  it('reports keys it does not recognise instead of ignoring them', () => {
    const doc = { ...(buildExport(snapshots) as object), somethingNew: [1, 2] };
    expect(inspectImport(doc).unknownKeys).toEqual(['somethingNew']);
  });

  it('never offers to restore the session credentials', () => {
    const doc = buildExport(snapshots);
    expect(inspectImport(doc).counts.map((c) => c.key)).not.toContain('auth');
  });

  it('refuses a file from a newer build', () => {
    // A restore that quietly drops fields is worse than one that will not run.
    expect(canImport(EXPORT_VERSION + 1, EXPORT_VERSION)).toBe(false);
    expect(canImport(EXPORT_VERSION, EXPORT_VERSION)).toBe(true);
    expect(canImport(1, EXPORT_VERSION)).toBe(true);
    expect(canImport(null, EXPORT_VERSION)).toBe(false);
  });
});

describe('restore mapping', () => {
  it('covers every exportable store, so a new one cannot be silently skipped', () => {
    const exportable = (Object.keys(STORE_KEYS) as StoreKey[]).filter((k) => !UNEXPORTED_STORES.includes(k));
    for (const key of exportable) {
      expect(typeof RESTORE_MAP[key as Exclude<StoreKey, 'auth'>]).toBe('function');
    }
    expect(Object.keys(RESTORE_MAP).sort()).toEqual([...exportable].sort());
  });

  it('renames the fields the export renamed on the way out', () => {
    expect(RESTORE_MAP.profile({ coachSettings: { personality: 'savage' } })).toEqual({
      coach: { personality: 'savage' },
    });
    expect(RESTORE_MAP.workouts({ personalRecords: { bench: 100 } })).toEqual({ prs: { bench: 100 } });
    expect(RESTORE_MAP.coach({ conversation: [{ id: 't' }] })).toEqual({ turns: [{ id: 't' }] });
  });

  it('never restores the subscription tier', () => {
    // A file is trivially editable; restoring entitlement from one is a free
    // upgrade.
    const out = RESTORE_MAP.profile({ profile: { name: 'A' }, subscription: { tier: 'pro' } });
    expect(out).not.toHaveProperty('subscription');
    expect(out).toHaveProperty('profile');
  });

  it('never restores photos, whose paths the export redacted', () => {
    const out = RESTORE_MAP.logs({
      weight: [{ date: '2026-01-01' }],
      photos: [{ id: 'p', uri: '[stored on device]' }],
    });
    expect(out).not.toHaveProperty('photos');
    expect(out).toHaveProperty('weight');
  });

  it('wraps the arrays the export writes bare', () => {
    expect(RESTORE_MAP.reminders([{ id: 'r' }] as never)).toEqual({ reminders: [{ id: 'r' }] });
    expect(RESTORE_MAP.routines([{ id: 'rt' }] as never)).toEqual({ routines: [{ id: 'rt' }] });
  });

  it('drops keys the store does not have rather than writing them through', () => {
    const out = RESTORE_MAP.gyms({ claims: [], kits: {}, somethingElse: 1 })!;
    expect(Object.keys(out).sort()).toEqual(['claims', 'kits']);
  });

  it('returns an empty object for a snapshot with nothing usable in it', () => {
    expect(RESTORE_MAP.programs({ nonsense: true })).toEqual({});
  });

  it('every deliberate omission is explained to the user', () => {
    for (const row of NOT_RESTORED) {
      expect(row.what.length).toBeGreaterThan(3);
      expect(row.why.length).toBeGreaterThan(20);
    }
    expect(NOT_RESTORED.map((r) => r.what)).toEqual(expect.arrayContaining(['Subscription tier', 'Progress photos']));
  });
});

describe('remainingLabel', () => {
  it('names what each badge is counting', () => {
    expect(remainingLabel('bestDisciplineScore', 12)).toBe('12 points to go');
    expect(remainingLabel('workoutsCompleted', 3)).toBe('3 workouts to go');
    expect(remainingLabel('currentDailyStreak', 4)).toBe('4 days to go');
    expect(remainingLabel('gymsClaimed', 2)).toBe('2 gyms to go');
  });

  it('gets the singular right', () => {
    expect(remainingLabel('prsSet', 1)).toBe('1 PR to go');
    expect(remainingLabel('progressPhotos', 1)).toBe('1 photo to go');
  });

  it('covers every metric in the catalog', () => {
    for (const a of ACHIEVEMENT_CATALOG) {
      expect(remainingLabel(a.metric, 2)).toMatch(/^2 \w+ to go$/);
    }
  });
});

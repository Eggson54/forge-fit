import { CLEARED_ON_DELETE, STORE_KEYS, UNEXPORTED_STORES, type StoreKey } from '../domain/storeKeys';
import { buildExport, exportFilename, type ExportSnapshots } from '../domain/exportShape';

/** A snapshot per exportable store, each distinguishable in the output. */
const snapshots = Object.fromEntries(
  (Object.keys(STORE_KEYS) as StoreKey[])
    .filter((k) => !UNEXPORTED_STORES.includes(k))
    .map((k) => [k, { marker: k }]),
) as ExportSnapshots;

describe('data export shape', () => {
  const doc = buildExport(snapshots, new Date('2026-09-16T10:00:00Z'));

  it('includes a section for every persisted store', () => {
    // The export drifted once: routines, the coach thread, plans and personal
    // records were added after it was written and silently never appeared.
    for (const key of Object.keys(STORE_KEYS) as StoreKey[]) {
      expect(Object.prototype.hasOwnProperty.call(doc, key)).toBe(true);
    }
  });

  it('carries the content it was handed for each exportable store', () => {
    for (const key of Object.keys(STORE_KEYS) as StoreKey[]) {
      if (UNEXPORTED_STORES.includes(key)) continue;
      expect(doc[key]).toEqual({ marker: key });
    }
  });

  it('never exports session credentials', () => {
    // Auth holds the session, not the athlete's records. A copy of it landing
    // wherever the file goes is a different kind of problem entirely.
    for (const key of UNEXPORTED_STORES) expect(doc[key]).toBeNull();
  });

  it('identifies itself and when it was made', () => {
    expect(doc.app).toBe('ForgeFit');
    expect(typeof doc.version).toBe('number');
    expect(doc.exportedAt).toBe('2026-09-16T10:00:00.000Z');
  });

  it('serialises cleanly', () => {
    expect(() => JSON.stringify(doc)).not.toThrow();
  });

  it('ignores snapshots for stores that are not persisted', () => {
    const extra = buildExport({ ...snapshots, notAStore: { marker: 'nope' } } as ExportSnapshots);
    expect(Object.prototype.hasOwnProperty.call(extra, 'notAStore')).toBe(false);
  });

  it('names the file by date', () => {
    expect(exportFilename(new Date('2026-09-16T10:00:00Z'))).toBe('forgefit-export-2026-09-16.json');
  });
});

/**
 * Store-level coverage is not enough on its own: `logs` holds seven different
 * record types and a new one added inside it would pass every test above while
 * never reaching the file. This lists what that section must carry.
 */
describe('the logs section', () => {
  const LOG_RECORD_TYPES = [
    'nutrition',
    'water',
    'weight',
    'sleep',
    'steps',
    'measurements',
    'photos',
    'savedMeals',
  ] as const;

  it('names every kind of record the log store keeps', () => {
    // Read the assembler's source rather than running it, so this stays a pure
    // test: importing the stores would pull in React Native.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src = require('fs').readFileSync(`${__dirname}/../services/dataExport.ts`, 'utf8');
    const section = src.slice(src.indexOf('logs: {'), src.indexOf('workouts: {'));
    for (const kind of LOG_RECORD_TYPES) {
      expect(section).toContain(`${kind}:`);
    }
  });
});

describe('CLEARED_ON_DELETE', () => {
  it('covers every store but the session', () => {
    // The hand-written version of this list had fallen twelve stores behind,
    // so blood results, cycle days and journal entries survived a deletion
    // that told the user everything was gone.
    const expected = (Object.keys(STORE_KEYS) as StoreKey[]).filter((k) => k !== 'auth');
    expect([...CLEARED_ON_DELETE].sort()).toEqual(expected.sort());
  });

  it('leaves the session alone', () => {
    // Deleting it from under deleteAccount() would cut off the request doing
    // the cloud-side deletion.
    expect(CLEARED_ON_DELETE).not.toContain('auth');
  });

  it('names a real storage key for everything it lists', () => {
    for (const key of CLEARED_ON_DELETE) expect(typeof STORE_KEYS[key]).toBe('string');
  });
});

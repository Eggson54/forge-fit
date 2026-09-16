import { STORE_KEYS, UNEXPORTED_STORES, type StoreKey } from '../domain/storeKeys';
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

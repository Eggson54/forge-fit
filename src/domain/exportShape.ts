import { STORE_KEYS, type StoreKey } from './storeKeys';

/**
 * One snapshot per persisted store, as the export sees them. Typed loosely on
 * purpose: this module's job is the *shape* of the document, not the contents
 * of each store.
 */
export type ExportSnapshots = Record<Exclude<StoreKey, 'auth'>, unknown>;

export type ExportDocument = Record<StoreKey, unknown> & {
  exportedAt: string;
  app: string;
  version: number;
};

export const EXPORT_VERSION = 2;

/**
 * Assemble the export document from store snapshots.
 *
 * Keyed by store so the shape is checkable: a test walks every persisted store
 * and fails if one is missing. The export drifted once already — routines, the
 * coach thread, training plans and personal records were all added after it was
 * written and none of them appeared in the file. Nothing about the resulting
 * JSON looks wrong, which is exactly what makes that kind of omission
 * dangerous.
 */
export function buildExport(snapshots: ExportSnapshots, exportedAt: Date = new Date()): ExportDocument {
  const doc = {
    exportedAt: exportedAt.toISOString(),
    app: 'ForgeFit',
    version: EXPORT_VERSION,
    // Session credentials are not the athlete's records; see UNEXPORTED_STORES.
    auth: null,
  } as ExportDocument;

  for (const key of Object.keys(STORE_KEYS) as StoreKey[]) {
    if (key === 'auth') continue;
    doc[key] = snapshots[key as Exclude<StoreKey, 'auth'>];
  }
  return doc;
}

/** A stable, human-readable filename for the export. */
export function exportFilename(now: Date = new Date()): string {
  return `forgefit-export-${now.toISOString().slice(0, 10)}.json`;
}

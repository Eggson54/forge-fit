import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EXPORT_VERSION } from '../domain/exportShape';
import { canImport, inspectImport, type ImportReport } from '../domain/importShape';
import { STORE_KEYS, UNEXPORTED_STORES, type StoreKey } from '../domain/storeKeys';
import { RESTORE_MAP } from '../domain/restoreMap';

/**
 * Restoring an export.
 *
 * This writes over everything, so it is written to be interruptible in the
 * least harmful order and to refuse rather than improvise. It never touches
 * the auth store: a restore should not swap out who is signed in.
 *
 * Zustand's persist middleware reads from storage at creation, so the app has
 * to be restarted for a restore to take effect. Saying so is the honest
 * alternative to rehydrating every store by hand and getting one wrong.
 */
export interface RestoreResult {
  ok: boolean;
  /** Stores actually written. */
  restored: StoreKey[];
  message: string;
}

export function readImportFile(text: string): { report: ImportReport; doc: unknown } {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      report: { ok: false, problems: ['That file is not readable JSON.'], version: null, exportedAt: null, counts: [], unknownKeys: [] },
      doc: null,
    };
  }
  return { report: inspectImport(parsed), doc: parsed };
}

export async function restoreFromExport(doc: unknown): Promise<RestoreResult> {
  const report = inspectImport(doc);
  if (!report.ok) {
    return { ok: false, restored: [], message: report.problems[0] ?? 'That file cannot be restored.' };
  }
  if (!canImport(report.version, EXPORT_VERSION)) {
    return {
      ok: false,
      restored: [],
      message: `That file was made by a newer version of ForgeFit. Update the app and try again — restoring it here would silently drop whatever this build does not understand.`,
    };
  }

  const source = doc as Record<string, unknown>;
  const restored: StoreKey[] = [];

  for (const key of Object.keys(STORE_KEYS) as StoreKey[]) {
    // Never the session: a restore should not change who is signed in.
    if (UNEXPORTED_STORES.includes(key)) continue;
    const snapshot = source[key];
    if (snapshot == null || typeof snapshot !== 'object') continue;

    // Through the explicit map, never the raw snapshot — the export shape and
    // the persisted shape have drifted, and writing one as the other loses
    // fields silently. See domain/restoreMap.ts.
    const restorer = RESTORE_MAP[key as Exclude<StoreKey, 'auth'>];
    const state = restorer(snapshot as Record<string, unknown>);
    if (!state || Object.keys(state).length === 0) continue;

    await AsyncStorage.setItem(STORE_KEYS[key], JSON.stringify({ state, version: 0 }));
    restored.push(key);
  }

  return {
    ok: true,
    restored,
    message:
      Platform.OS === 'web'
        ? `Restored ${restored.length} sections. Reload the page to see them.`
        : `Restored ${restored.length} sections. Close and reopen ForgeFit to see them.`,
  };
}

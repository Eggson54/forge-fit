import { Platform } from 'react-native';
import type { TrackPoint } from '../domain/track';
import {
  META_NAME,
  assemble,
  orderChunks,
  type RecordingMeta,
  type RecoveredRecording,
} from '../domain/crashRecovery';

export type { RecordingMeta, RecoveredRecording };

/**
 * A recording that survives the app dying.
 *
 * Until this existed, a live recording lived only in the recorder store: kill
 * the app, take a call that pushes it out of memory, or run out of battery,
 * and an hour of running was gone. That is the worst failure this app can
 * have — every other bug costs a number, this one costs the session.
 *
 * **Why chunks.** `expo-file-system` has no append. Rewriting one growing
 * file every few seconds means an hour's run — three thousand points — is
 * re-serialised and re-written hundreds of times, and the cost climbs as the
 * run gets longer, so the last mile is the most expensive to protect. Instead
 * each flush writes a *new* numbered file and never touches it again: the
 * cost per flush is the size of one chunk, constant from the first minute to
 * the last, and a chunk that is already on disk cannot be corrupted by a
 * later crash mid-write.
 *
 * Recovery reads the chunks back in order and stops at the first one that
 * will not parse — a crash during a write leaves at most the final chunk
 * truncated, which costs the last few seconds rather than the whole run.
 */

const DIR = 'recording';

/** Points per chunk. Thirty seconds of one-per-second fixes. */
const CHUNK_POINTS = 30;
/** And a time bound, so a slow fix rate still gets written out. */
const FLUSH_AFTER_MS = 20_000;

interface FsModule {
  documentDirectory: string | null;
  getInfoAsync: (uri: string) => Promise<{ exists: boolean }>;
  readAsStringAsync: (uri: string) => Promise<string>;
  writeAsStringAsync: (uri: string, contents: string) => Promise<void>;
  deleteAsync: (uri: string, options?: { idempotent?: boolean }) => Promise<void>;
  makeDirectoryAsync: (uri: string, options?: { intermediates?: boolean }) => Promise<void>;
  readDirectoryAsync: (uri: string) => Promise<string[]>;
}

let fs: FsModule | null | undefined;
function load(): FsModule | null {
  if (fs !== undefined) return fs;
  try {
    // Lazily required so a build without the native module still runs and
    // simply records without the safety net.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-file-system') as FsModule;
    fs = mod.documentDirectory ? mod : null;
  } catch {
    fs = null;
  }
  return fs;
}

function dirUri(): string | null {
  const m = load();
  return m?.documentDirectory ? `${m.documentDirectory}${DIR}/` : null;
}

let buffer: TrackPoint[] = [];
let chunkIndex = 0;
let lastFlush = 0;
let writing = false;

export const crashLog = {
  /** Whether the safety net is available at all on this platform and build. */
  available(): boolean {
    // Web has no durable per-origin file store worth the complexity here, and
    // nobody records a run in a browser. Saying so beats pretending.
    return Platform.OS !== 'web' && dirUri() !== null;
  },

  async begin(meta: Omit<RecordingMeta, 'version'>): Promise<void> {
    const m = load();
    const dir = dirUri();
    if (!m || !dir) return;

    buffer = [];
    chunkIndex = 0;
    lastFlush = Date.now();

    try {
      await m.deleteAsync(dir, { idempotent: true });
      await m.makeDirectoryAsync(dir, { intermediates: true });
      await m.writeAsStringAsync(`${dir}${META_NAME}`, JSON.stringify({ ...meta, version: 1 }));
    } catch {
      // A recorder that cannot write its safety net still records. It must not
      // refuse to start because of it.
    }
  },

  /**
   * Hand over the newest fixes.
   *
   * Cheap and synchronous from the caller's side: it buffers, and only touches
   * the disk when a chunk is full or the time bound has passed. Returns
   * immediately either way — nothing about recording waits on a write.
   */
  add(points: TrackPoint[]): void {
    if (!this.available()) return;
    buffer.push(...points);
    const due = buffer.length >= CHUNK_POINTS || Date.now() - lastFlush >= FLUSH_AFTER_MS;
    if (due) void this.flush();
  },

  async flush(): Promise<void> {
    const m = load();
    const dir = dirUri();
    if (!m || !dir || buffer.length === 0 || writing) return;

    // One write at a time. Two overlapping flushes would both claim the same
    // chunk index and one would silently overwrite the other.
    writing = true;
    const chunk = buffer;
    const index = chunkIndex;
    buffer = [];
    chunkIndex += 1;
    lastFlush = Date.now();

    try {
      await m.writeAsStringAsync(`${dir}${String(index).padStart(5, '0')}.json`, JSON.stringify(chunk));
    } catch {
      // Put the points back so the next flush tries again rather than dropping
      // them: a full disk should cost a delay, not a mile.
      buffer = [...chunk, ...buffer];
      chunkIndex = index;
    } finally {
      writing = false;
    }
  },

  /** Clear the log. Called once the recording is safely in the store. */
  async clear(): Promise<void> {
    const m = load();
    const dir = dirUri();
    buffer = [];
    chunkIndex = 0;
    if (!m || !dir) return;
    try {
      await m.deleteAsync(dir, { idempotent: true });
    } catch {
      /* Nothing useful to do; the next begin() wipes it anyway. */
    }
  },

  /**
   * Anything left over from a previous run of the app.
   *
   * Returns null when there is nothing, or when what is there is too small to
   * be worth offering — being asked to recover four seconds of standing on a
   * doorstep is worse than being asked nothing.
   */
  async recover(): Promise<RecoveredRecording | null> {
    const m = load();
    const dir = dirUri();
    if (!m || !dir) return null;

    try {
      const info = await m.getInfoAsync(dir);
      if (!info.exists) return null;

      const names = await m.readDirectoryAsync(dir);
      if (!names.includes(META_NAME)) return null;

      const metaText = await m.readAsStringAsync(`${dir}${META_NAME}`);
      const chunks = await Promise.all(
        orderChunks(names).map(async (name) => ({
          name,
          // A chunk that will not even read is treated exactly like one that
          // will not parse: `assemble` stops there and says the tail is gone.
          text: await m.readAsStringAsync(`${dir}${name}`).catch(() => ''),
        })),
      );

      const found = assemble(metaText, chunks);
      // Nothing usable means nothing worth keeping on disk either.
      if (!found) await this.clear();
      return found;
    } catch {
      return null;
    }
  },
};

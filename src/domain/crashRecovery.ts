import type { TrackPoint } from './track';

/**
 * Putting a crashed recording back together.
 *
 * Kept apart from the file-system service so it can be tested without a
 * device: the decisions here — what order the chunks go in, when to stop, and
 * when a leftover is too small to be worth offering — are the ones that
 * decide whether somebody gets their run back or a confusing prompt.
 */

export interface RecordingMeta {
  id: string;
  type: string;
  startedAt: number;
  version: 1;
}

export interface RecoveredRecording {
  meta: RecordingMeta;
  points: TrackPoint[];
  /** True when a chunk would not parse, so the tail is missing. */
  truncated: boolean;
}

/** Below this, a leftover is somebody standing on a doorstep. Not worth asking about. */
export const MIN_RECOVERABLE_POINTS = 10;

export const META_NAME = 'meta.json';

/** Chunk file names, in the order they were written. */
export function orderChunks(names: string[]): string[] {
  return names
    .filter((n) => n !== META_NAME && /^\d+\.json$/.test(n))
    // Numeric rather than lexical: zero-padding makes them agree today, and
    // a run long enough to overflow the padding would silently reorder.
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

export function parseMeta(text: string): RecordingMeta | null {
  try {
    const meta = JSON.parse(text) as RecordingMeta;
    if (!meta || meta.version !== 1) return null;
    if (typeof meta.id !== 'string' || typeof meta.type !== 'string') return null;
    if (typeof meta.startedAt !== 'number' || !Number.isFinite(meta.startedAt)) return null;
    return meta;
  } catch {
    return null;
  }
}

function looksLikePoint(p: unknown): p is TrackPoint {
  if (!p || typeof p !== 'object') return false;
  const q = p as Record<string, unknown>;
  return typeof q.lat === 'number' && typeof q.lon === 'number' && typeof q.t === 'number';
}

/**
 * Reassemble, stopping at the first chunk that will not parse.
 *
 * A crash during a write leaves at most the final chunk half-written.
 * Everything before it is complete, so the right answer is to keep that and
 * say the tail is gone — skipping the bad chunk and carrying on would splice
 * a gap into the middle of a route and quietly report it as continuous.
 */
export function assemble(metaText: string, chunks: { name: string; text: string }[]): RecoveredRecording | null {
  const meta = parseMeta(metaText);
  if (!meta) return null;

  const byName = new Map(chunks.map((c) => [c.name, c.text]));
  const ordered = orderChunks(chunks.map((c) => c.name));

  const points: TrackPoint[] = [];
  let truncated = false;

  for (const name of ordered) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(byName.get(name) ?? '');
    } catch {
      truncated = true;
      break;
    }
    if (!Array.isArray(parsed) || !parsed.every(looksLikePoint)) {
      truncated = true;
      break;
    }
    points.push(...parsed);
  }

  if (points.length < MIN_RECOVERABLE_POINTS) return null;
  return { meta, points, truncated };
}

/** What to tell somebody about what was found. */
export function describeRecovery(found: RecoveredRecording, today = new Date()): string {
  const started = new Date(found.meta.startedAt);
  const sameDay = started.toISOString().slice(0, 10) === today.toISOString().slice(0, 10);
  const when = sameDay ? 'earlier today' : `on ${started.toISOString().slice(0, 10)}`;
  const tail = found.truncated
    ? ' The last few seconds did not finish writing and are gone.'
    : '';
  return `The app stopped during a ${found.meta.type} ${when}. ${found.points.length} fixes had already been written to disk, so the rest of it is still here.${tail}`;
}

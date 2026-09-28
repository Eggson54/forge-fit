/**
 * Merging location fixes that arrive in batches.
 *
 * In the foreground a fix arrives one at a time, in order. In the
 * background iOS holds them and hands them over in bunches — and a bunch can
 * overlap the last one, repeat a fix, or arrive with the newest first. Taken
 * as they come, a repeated fix is a zero-length leg that the moving-time
 * logic reads as standing still, and an out-of-order one is a leg drawn
 * backwards along the route, counted as distance twice.
 *
 * So a batch is sorted by time, anything not newer than the last accepted
 * point is dropped, and so is anything that is not a coordinate at all.
 */

export interface TimedFix {
  lat: number;
  lon: number;
  /** Milliseconds since epoch. */
  t: number;
}

export function acceptFixes<F extends TimedFix>(lastT: number | null, incoming: readonly F[]): F[] {
  const usable = incoming
    .filter(
      (f) =>
        Number.isFinite(f.lat) &&
        Number.isFinite(f.lon) &&
        Number.isFinite(f.t) &&
        Math.abs(f.lat) <= 90 &&
        Math.abs(f.lon) <= 180,
    )
    .slice()
    .sort((a, b) => a.t - b.t);

  const out: F[] = [];
  let cursor = lastT ?? Number.NEGATIVE_INFINITY;
  for (const f of usable) {
    // Strictly newer. Equal timestamps are the same fix delivered twice.
    if (f.t <= cursor) continue;
    out.push(f);
    cursor = f.t;
  }
  return out;
}

export type RecordingMode = 'background' | 'screen-on';

/**
 * What to tell somebody about a recording, given how it is running.
 *
 * Null for the case that needs no explanation. The other case is the one
 * that loses a run if it goes unsaid: without background location, iOS stops
 * delivering fixes the moment the screen locks, and the athlete finds out
 * two kilometres later.
 */
export function recordingModeNote(mode: RecordingMode | null, reason: 'expo-go' | 'declined' | 'unsupported' | null): string | null {
  if (mode !== 'screen-on') return null;
  const why =
    reason === 'expo-go'
      ? 'Expo Go cannot record with the screen locked.'
      : reason === 'declined'
        ? 'Location is set to “While Using”, not “Always”.'
        : 'This build cannot record with the screen locked.';
  return `${why} The screen will stay on while you record — locking it stops the recording.`;
}

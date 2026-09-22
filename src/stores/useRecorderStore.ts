import { create } from 'zustand';
import { uid } from '../lib/uid';
import { todayISO } from '../domain/date';
import { trackStats, type TrackPoint, type TrackStats } from '../domain/track';
import { location, type StopWatching } from '../services/location';

/**
 * The live recorder.
 *
 * Deliberately *not* persisted through zustand's middleware, and deliberately
 * the only store in the app that is not. A recording is a stream of a fix per
 * second; writing the whole array to AsyncStorage on every one of them would
 * serialise an ever-growing JSON blob sixty times a minute and eventually
 * drop frames on the screen the athlete is looking at. Instead the points sit
 * in memory while recording and are handed to the activity store once, on
 * save.
 *
 * The cost of that choice is honest and worth stating: killing the app
 * mid-activity loses the recording. A crash-safe version needs an append-only
 * file rather than a state store, which is the right fix and not this one.
 */

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'paused' | 'denied' | 'unavailable';

interface RecorderStore {
  state: RecorderState;
  points: TrackPoint[];
  /** The activity kind being recorded, as a CardioType. */
  type: string;
  startedAt: number | null;
  /** Accumulated milliseconds across pauses. */
  pausedMs: number;
  lastPauseAt: number | null;
  /** The most recent fix's own accuracy, so the UI can say "searching". */
  accuracy: number | null;
  error: string | null;

  setType: (type: string) => void;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  discard: () => void;
  /** Stops the receiver and returns what was recorded. */
  finish: () => { id: string; date: string; type: string; points: TrackPoint[]; stats: TrackStats } | null;
  stats: () => TrackStats;
  elapsedMs: () => number;
}

let unwatch: StopWatching | null = null;

export const useRecorderStore = create<RecorderStore>((set, get) => ({
  state: 'idle',
  points: [],
  type: 'run',
  startedAt: null,
  pausedMs: 0,
  lastPauseAt: null,
  accuracy: null,
  error: null,

  setType: (type) => set({ type }),

  start: async () => {
    if (get().state === 'recording') return;
    set({ state: 'requesting', error: null });

    const { status } = await location.request();
    if (status === 'denied') {
      set({ state: 'denied', error: 'Location permission is off. Recording a route needs it — nothing else in the app does.' });
      return;
    }
    if (status !== 'granted') {
      set({ state: 'unavailable', error: 'This build cannot reach the GPS. Recording needs a development build, not Expo Go.' });
      return;
    }

    unwatch?.();
    unwatch = await location.watch((fix) => {
      // Fixes that arrive while paused are dropped rather than stored. Storing
      // them and filtering later would make a pause at a café look like a very
      // slow lap of the café.
      if (get().state !== 'recording') return;
      set((s) => ({
        accuracy: fix.accuracyMeters,
        points: [
          ...s.points,
          {
            lat: fix.lat,
            lon: fix.lon,
            t: fix.t,
            ...(fix.altitudeMeters != null ? { ele: fix.altitudeMeters } : null),
            ...(fix.accuracyMeters != null ? { acc: fix.accuracyMeters } : null),
          },
        ],
      }));
    });

    set({ state: 'recording', startedAt: Date.now(), pausedMs: 0, lastPauseAt: null, points: [] });
  },

  pause: () => {
    if (get().state !== 'recording') return;
    set({ state: 'paused', lastPauseAt: Date.now() });
  },

  resume: () => {
    const { state, lastPauseAt, pausedMs } = get();
    if (state !== 'paused') return;
    set({
      state: 'recording',
      pausedMs: pausedMs + (lastPauseAt ? Date.now() - lastPauseAt : 0),
      lastPauseAt: null,
    });
  },

  discard: () => {
    unwatch?.();
    unwatch = null;
    set({ state: 'idle', points: [], startedAt: null, pausedMs: 0, lastPauseAt: null, accuracy: null, error: null });
  },

  finish: () => {
    const { points, type } = get();
    unwatch?.();
    unwatch = null;

    const stats = trackStats(points);
    set({ state: 'idle', points: [], startedAt: null, pausedMs: 0, lastPauseAt: null, accuracy: null });

    // A recording with two fixes is a recording of standing up. Returning null
    // rather than saving it keeps the history free of entries nobody made.
    if (points.length < 5 || stats.distanceM < 20) return null;

    return { id: uid('act_'), date: todayISO(), type, points, stats };
  },

  stats: () => trackStats(get().points),

  elapsedMs: () => {
    const { startedAt, pausedMs, lastPauseAt, state } = get();
    if (!startedAt) return 0;
    const now = state === 'paused' && lastPauseAt ? lastPauseAt : Date.now();
    return Math.max(0, now - startedAt - pausedMs);
  },
}));

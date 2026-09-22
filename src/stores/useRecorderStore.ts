import { create } from 'zustand';
import { uid } from '../lib/uid';
import { todayISO } from '../domain/date';
import { trackStats, type TrackPoint, type TrackStats } from '../domain/track';
import { location, type StopWatching } from '../services/location';
import { crashLog, type RecoveredRecording } from '../services/crashLog';

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
 * The points are also streamed to `crashLog`, which writes them to disk in
 * chunks. That is the safety net: killing the app mid-activity used to lose
 * the whole recording, and now costs at most the last few seconds.
 */

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'paused' | 'denied' | 'unavailable';

/**
 * How slow counts as stopped, for auto-pause.
 *
 * 0.6 m/s is slower than a stroll. Set any higher and a genuine walk break
 * in the middle of a long run stops being recorded as part of the run, which
 * is the thing people complain about in every app that does this.
 */
const AUTO_PAUSE_MS = 0.6;

/** Seconds below that speed before it takes effect. */
const AUTO_PAUSE_AFTER_S = 8;

export interface Lap {
  index: number;
  /** Index into `points` where this lap began. */
  startIndex: number;
  startedAt: number;
  endedAt: number;
  distanceM: number;
  seconds: number;
}

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
  laps: Lap[];
  /** Where the current lap started in `points`. */
  lapStartIndex: number;
  autoPause: boolean;
  /** True while auto-pause is holding, as opposed to a deliberate pause. */
  autoPaused: boolean;

  setType: (type: string) => void;
  /** A recording left behind by a previous run of the app, if there is one. */
  recovered: RecoveredRecording | null;
  checkForRecovery: () => Promise<void>;
  dismissRecovery: () => Promise<void>;
  adoptRecovery: () => { id: string; date: string; type: string; points: TrackPoint[]; stats: TrackStats; laps: Lap[] } | null;
  setAutoPause: (on: boolean) => void;
  /** Close the current lap and start another. Returns the lap just closed. */
  lap: () => Lap | null;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  discard: () => void;
  /** Stops the receiver and returns what was recorded. */
  finish: () => { id: string; date: string; type: string; points: TrackPoint[]; stats: TrackStats; laps: Lap[] } | null;
  stats: () => TrackStats;
  elapsedMs: () => number;
}

let unwatch: StopWatching | null = null;
/**
 * When the receiver first reported standing still, in fix time.
 *
 * Module-level rather than in the store because it changes on nearly every
 * fix and nothing renders from it — putting it in state would re-render the
 * recording screen once a second for no visible reason.
 */
let stillSinceRef: number | null = null;

export const useRecorderStore = create<RecorderStore>((set, get) => ({
  state: 'idle',
  points: [],
  type: 'run',
  startedAt: null,
  pausedMs: 0,
  lastPauseAt: null,
  accuracy: null,
  error: null,
  laps: [],
  lapStartIndex: 0,
  autoPause: true,
  autoPaused: false,

  recovered: null,

  checkForRecovery: async () => {
    if (get().state !== 'idle') return;
    set({ recovered: await crashLog.recover() });
  },

  dismissRecovery: async () => {
    await crashLog.clear();
    set({ recovered: null });
  },

  setType: (type) => set({ type }),
  setAutoPause: (autoPause) => set({ autoPause, autoPaused: autoPause ? get().autoPaused : false }),

  lap: () => {
    const { points, lapStartIndex, laps, state } = get();
    if (state !== 'recording' && state !== 'paused') return null;
    const slice = points.slice(lapStartIndex);
    if (slice.length < 2) return null;

    const stats = trackStats(slice);
    const closed: Lap = {
      index: laps.length + 1,
      startIndex: lapStartIndex,
      startedAt: slice[0]!.t,
      endedAt: slice[slice.length - 1]!.t,
      distanceM: Math.round(stats.distanceM),
      seconds: Math.round(stats.elapsedS),
    };
    set({ laps: [...laps, closed], lapStartIndex: points.length - 1 });
    return closed;
  },

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
      const current = get();
      // Auto-pause lifts itself the moment real movement returns, which is
      // why a fix arriving while auto-paused is still processed. A fix during
      // a *deliberate* pause is dropped — see below.
      if (current.state === 'paused' && !current.autoPaused) return;
      if (current.state !== 'recording' && !current.autoPaused) return;

      if (current.autoPause) {
        const moving = typeof fix.speedMs === 'number' ? fix.speedMs >= AUTO_PAUSE_MS : null;
        if (moving === true && current.autoPaused) {
          set({ state: 'recording', autoPaused: false, pausedMs: current.pausedMs + (current.lastPauseAt ? Date.now() - current.lastPauseAt : 0), lastPauseAt: null });
        } else if (moving === false && current.state === 'recording') {
          const stillSince = stillSinceRef;
          if (stillSince == null) {
            stillSinceRef = fix.t;
          } else if ((fix.t - stillSince) / 1000 >= AUTO_PAUSE_AFTER_S) {
            set({ state: 'paused', autoPaused: true, lastPauseAt: Date.now() });
          }
        }
        if (moving !== false) stillSinceRef = null;
      }

      if (get().state !== 'recording') return;
      const point: TrackPoint = {
        lat: fix.lat,
        lon: fix.lon,
        t: fix.t,
        ...(fix.altitudeMeters != null ? { ele: fix.altitudeMeters } : null),
        ...(fix.accuracyMeters != null ? { acc: fix.accuracyMeters } : null),
      };
      // Handed to the disk log before it reaches state, so a crash between
      // the two loses nothing that was ever shown on screen.
      crashLog.add([point]);
      set((s) => ({ accuracy: fix.accuracyMeters, points: [...s.points, point] }));
    });

    stillSinceRef = null;
    const id = uid('act_');
    await crashLog.begin({ id, type: get().type, startedAt: Date.now() });
    set({ state: 'recording', startedAt: Date.now(), pausedMs: 0, lastPauseAt: null, points: [], laps: [], lapStartIndex: 0, autoPaused: false, recovered: null });
  },

  pause: () => {
    if (get().state !== 'recording') return;
    stillSinceRef = null;
    set({ state: 'paused', autoPaused: false, lastPauseAt: Date.now() });
  },

  resume: () => {
    const { state, lastPauseAt, pausedMs } = get();
    if (state !== 'paused') return;
    stillSinceRef = null;
    set({
      state: 'recording',
      autoPaused: false,
      pausedMs: pausedMs + (lastPauseAt ? Date.now() - lastPauseAt : 0),
      lastPauseAt: null,
    });
  },

  discard: () => {
    unwatch?.();
    unwatch = null;
    stillSinceRef = null;
    void crashLog.clear();
    set({ state: 'idle', points: [], startedAt: null, pausedMs: 0, lastPauseAt: null, accuracy: null, error: null, laps: [], lapStartIndex: 0, autoPaused: false });
  },

  finish: () => {
    const { points, type, laps, lapStartIndex } = get();
    unwatch?.();
    unwatch = null;
    stillSinceRef = null;
    // Cleared only once the caller has the points in hand. Clearing before
    // this returns would make a crash during the hand-off lose the run.
    void crashLog.clear();

    // Close whatever lap was running, so the last one is not silently lost.
    const tail = points.slice(lapStartIndex);
    const closedLaps = tail.length >= 2
      ? [...laps, {
          index: laps.length + 1,
          startIndex: lapStartIndex,
          startedAt: tail[0]!.t,
          endedAt: tail[tail.length - 1]!.t,
          distanceM: Math.round(trackStats(tail).distanceM),
          seconds: Math.round(trackStats(tail).elapsedS),
        }]
      : laps;

    const stats = trackStats(points);
    set({ state: 'idle', points: [], startedAt: null, pausedMs: 0, lastPauseAt: null, accuracy: null, laps: [], lapStartIndex: 0, autoPaused: false });

    // A recording with two fixes is a recording of standing up. Returning null
    // rather than saving it keeps the history free of entries nobody made.
    if (points.length < 5 || stats.distanceM < 20) return null;

    return { id: uid('act_'), date: todayISO(), type, points, stats, laps: closedLaps };
  },

  /** Adopt a recovered recording so it can be reviewed and saved as normal. */
  adoptRecovery: () => {
    const found = get().recovered;
    if (!found) return null;
    const stats = trackStats(found.points);
    set({ recovered: null });
    void crashLog.clear();
    if (found.points.length < 5 || stats.distanceM < 20) return null;
    return {
      id: found.meta.id,
      date: new Date(found.meta.startedAt).toISOString().slice(0, 10),
      type: found.meta.type,
      points: found.points,
      stats,
      laps: [] as Lap[],
    };
  },

  stats: () => trackStats(get().points),

  elapsedMs: () => {
    const { startedAt, pausedMs, lastPauseAt, state } = get();
    if (!startedAt) return 0;
    const now = state === 'paused' && lastPauseAt ? lastPauseAt : Date.now();
    return Math.max(0, now - startedAt - pausedMs);
  },
}));

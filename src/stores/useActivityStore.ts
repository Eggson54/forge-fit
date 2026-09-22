import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { uid } from '../lib/uid';
import { todayISO } from '../domain/date';
import { elevationProfile, simplify, trackStats, type ElevationSample, type TrackPoint } from '../domain/track';
import { bestEffortsIn, type BestEffort } from '../domain/bestEfforts';
import {
  boardFor,
  disciplineOf,
  matchSegment,
  orderSegments,
  segmentFromTrace,
  type Segment,
  type SegmentBoard,
  type SegmentEffort,
} from '../domain/segments';
import type { ISODate, ISODateTime, UUID } from '../domain/types';
import { jsonStorage, STORE_KEYS } from './persist';

/**
 * Recorded outdoor activities, and the segments carved out of them.
 *
 * Two decisions worth reading before changing anything here:
 *
 *  - **Traces are simplified before they are stored.** An hour's run is three
 *    thousand fixes; twenty of them is a 60,000-point array going through
 *    JSON.stringify on every write. At a three-metre tolerance the drawn line
 *    is indistinguishable and the stored size is a tenth. The measurements
 *    are taken from the *full* trace first and saved alongside, so nothing is
 *    lost except points that sat on a straight line.
 *
 *  - **Best efforts and segment matches are computed once, on save.** Both
 *    are linear in the number of points but they run against every segment in
 *    the library, and recomputing them on every render of a history screen is
 *    how a list gets slow.
 */

export interface StoredActivity {
  id: UUID;
  date: ISODate;
  startedAt: ISODateTime;
  /** A CardioType. */
  type: string;
  name: string;
  /** Thinned for storage; measurements were taken before thinning. */
  points: TrackPoint[];
  /**
   * Altitude against distance, sampled from the full trace.
   *
   * Separate from `points` because thinning is by ground shape: a straight
   * climb keeps two points and would otherwise lose its whole profile.
   */
  elevation: ElevationSample[];
  distanceM: number;
  elapsedS: number;
  movingS: number;
  ascentM: number;
  descentM: number;
  avgHr: number | null;
  maxHr: number | null;
  efforts: BestEffort[];
  notes?: string;
  effort?: number;
}

interface ActivityState {
  activities: StoredActivity[];
  segments: Segment[];
  segmentEfforts: SegmentEffort[];

  save: (input: {
    type: string;
    points: TrackPoint[];
    name?: string;
    notes?: string;
    effort?: number;
    date?: ISODate;
  }) => StoredActivity | null;
  rename: (id: UUID, name: string) => void;
  annotate: (id: UUID, patch: { notes?: string; effort?: number }) => void;
  remove: (id: UUID) => void;

  createSegment: (activityId: UUID, startIndex: number, endIndex: number, name: string) => Segment | null;
  hideSegment: (id: UUID, hidden: boolean) => void;
  removeSegment: (id: UUID) => void;

  byId: (id: UUID) => StoredActivity | null;
  visibleSegments: () => Segment[];
  board: (segmentId: UUID) => SegmentBoard;
  reset: () => void;
}

/** Points are thinned to this tolerance before storage. See the note above. */
const STORE_TOLERANCE_M = 3;

function defaultName(type: string, date: ISODate): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : hour < 21 ? 'Evening' : 'Night';
  const kind = type.charAt(0).toUpperCase() + type.slice(1);
  void date;
  return `${part} ${kind}`;
}

export const useActivityStore = create<ActivityState>()(
  persist(
    (set, get) => ({
      activities: [],
      segments: [],
      segmentEfforts: [],

      save: (input) => {
        const stats = trackStats(input.points);
        if (stats.distanceM < 20 || input.points.length < 5) return null;

        const date = input.date ?? todayISO();
        const activity: StoredActivity = {
          id: uid('act_'),
          date,
          startedAt: new Date(input.points[0]?.t ?? Date.now()).toISOString(),
          type: input.type,
          name: input.name?.trim() || defaultName(input.type, date),
          points: simplify(input.points, STORE_TOLERANCE_M),
          elevation: elevationProfile(input.points),
          distanceM: Math.round(stats.distanceM),
          elapsedS: Math.round(stats.elapsedS),
          movingS: Math.round(stats.movingS),
          ascentM: stats.ascentM,
          descentM: stats.descentM,
          avgHr: stats.avgHr,
          maxHr: stats.maxHr,
          // Efforts come from the full trace: thinning removes the points that
          // sat on a straight line, which is exactly where a fast kilometre is.
          efforts: bestEffortsIn(input.points),
          notes: input.notes,
          effort: input.effort,
        };

        const discipline = disciplineOf(input.type);
        const newEfforts: SegmentEffort[] = discipline
          ? get()
              .segments.filter((s) => s.discipline === discipline)
              .flatMap((s) =>
                matchSegment(s, input.points).map((m) => ({
                  segmentId: s.id,
                  activityId: activity.id,
                  activityName: activity.name,
                  date,
                  seconds: Math.round(m.seconds * 10) / 10,
                  startIndex: m.startIndex,
                  endIndex: m.endIndex,
                  avgHr: m.avgHr,
                })),
              )
          : [];

        set((s) => ({
          activities: [activity, ...s.activities],
          segmentEfforts: [...newEfforts, ...s.segmentEfforts],
        }));
        return activity;
      },

      rename: (id, name) =>
        set((s) => ({
          activities: s.activities.map((a) => (a.id === id ? { ...a, name: name.trim() || a.name } : a)),
          // The name is denormalised onto efforts so a board does not have to
          // join; keep the two in step rather than letting them drift.
          segmentEfforts: s.segmentEfforts.map((e) =>
            e.activityId === id ? { ...e, activityName: name.trim() || e.activityName } : e,
          ),
        })),

      annotate: (id, patch) =>
        set((s) => ({ activities: s.activities.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),

      remove: (id) =>
        set((s) => ({
          activities: s.activities.filter((a) => a.id !== id),
          // Efforts from a deleted activity go with it. Leaving them would put
          // a personal best on a board with nothing behind it to open.
          segmentEfforts: s.segmentEfforts.filter((e) => e.activityId !== id),
        })),

      createSegment: (activityId, startIndex, endIndex, name) => {
        const activity = get().activities.find((a) => a.id === activityId);
        if (!activity) return null;
        const discipline = disciplineOf(activity.type);
        if (!discipline) return null;

        const segment = segmentFromTrace(activity.points, startIndex, endIndex, {
          id: uid('seg_'),
          name,
          activityId,
          discipline,
          createdAt: new Date().toISOString(),
        });
        if (!segment) return null;

        // Backfill: every activity already recorded is matched against the new
        // segment, so creating one out of a hill you have climbed all year
        // gives you the year's history rather than starting from today.
        const backfilled: SegmentEffort[] = get()
          .activities.filter((a) => disciplineOf(a.type) === discipline)
          .flatMap((a) =>
            matchSegment(segment, a.points).map((m) => ({
              segmentId: segment.id,
              activityId: a.id,
              activityName: a.name,
              date: a.date,
              seconds: Math.round(m.seconds * 10) / 10,
              startIndex: m.startIndex,
              endIndex: m.endIndex,
              avgHr: m.avgHr,
            })),
          );

        set((s) => ({ segments: [segment, ...s.segments], segmentEfforts: [...backfilled, ...s.segmentEfforts] }));
        return segment;
      },

      hideSegment: (id, hidden) =>
        set((s) => ({ segments: s.segments.map((x) => (x.id === id ? { ...x, hidden } : x)) })),

      removeSegment: (id) =>
        set((s) => ({
          segments: s.segments.filter((x) => x.id !== id),
          segmentEfforts: s.segmentEfforts.filter((e) => e.segmentId !== id),
        })),

      byId: (id) => get().activities.find((a) => a.id === id) ?? null,
      visibleSegments: () => orderSegments(get().segments, get().segmentEfforts),
      board: (segmentId) => boardFor(segmentId, get().segmentEfforts),

      reset: () => set({ activities: [], segments: [], segmentEfforts: [] }),
    }),
    { name: STORE_KEYS.activities, storage: jsonStorage() },
  ),
);

import {
  CARDIO_KINDS,
  WEEKLY_MINUTES_REFERENCE,
  cardioInWeek,
  cardioKind,
  displayDistance,
  formatCadence,
  formatPace,
  formatSpeed,
  speedPerHour,
  paceMinutesPer,
  readCardioWeek,
  totalCardio,
  weeklyCardioMinutes,
  type CardioSession,
} from '../domain/cardio';
import { RESTORE_MAP } from '../domain/restoreMap';

const session = (over: Partial<CardioSession> = {}): CardioSession => ({
  id: Math.random().toString(36).slice(2),
  date: '2026-09-20',
  type: 'run',
  minutes: 30,
  source: 'manual',
  loggedAt: '2026-09-20T09:00:00.000Z',
  ...over,
});

describe('pace', () => {
  it('is minutes per mile in imperial and per km in metric', () => {
    const s = session({ minutes: 30, distanceKm: 5 });
    // 5 km is 3.107 miles, so 30 minutes is ~9:39/mi and 6:00/km.
    expect(formatPace(paceMinutesPer(s, 'imperial'), 'imperial')).toBe('9:39 /mi');
    expect(formatPace(paceMinutesPer(s, 'metric'), 'metric')).toBe('6:00 /km');
  });

  it('has no pace without a distance, rather than infinity', () => {
    expect(paceMinutesPer(session({ distanceKm: undefined }), 'metric')).toBeNull();
    expect(paceMinutesPer(session({ distanceKm: 0 }), 'metric')).toBeNull();
    expect(formatPace(null, 'metric')).toBeNull();
  });

  it('has no pace without a duration either', () => {
    expect(paceMinutesPer(session({ minutes: 0, distanceKm: 5 }), 'metric')).toBeNull();
  });

  it('never prints sixty seconds', () => {
    // 5.999... minutes/km must round to 6:00, not 5:60.
    expect(formatPace(5.9999, 'metric')).toBe('6:00 /km');
  });
});

describe('displayDistance', () => {
  it('converts and rounds for display', () => {
    expect(displayDistance(5, 'imperial')).toEqual({ value: 3.11, unit: 'mi' });
    expect(displayDistance(5, 'metric')).toEqual({ value: 5, unit: 'km' });
  });

  it('is null when nothing was recorded, so the row stays empty', () => {
    expect(displayDistance(undefined, 'metric')).toBeNull();
    expect(displayDistance(0, 'metric')).toBeNull();
  });
});

describe('totalCardio', () => {
  it('adds up what is there', () => {
    const t = totalCardio([
      session({ minutes: 30, distanceKm: 5, calories: 300 }),
      session({ minutes: 45, distanceKm: 12, calories: 400 }),
    ]);
    expect(t).toEqual({ sessions: 2, minutes: 75, distanceKm: 17, calories: 700, sessionsWithCalories: 2 });
  });

  it('never invents a calorie figure for a session that did not record one', () => {
    const t = totalCardio([session({ calories: 300 }), session({ calories: undefined })]);
    expect(t.calories).toBe(300);
    // And says how many contributed, so the UI can hedge rather than imply 2.
    expect(t.sessionsWithCalories).toBe(1);
    expect(t.sessions).toBe(2);
  });

  it('is zero across the board for an empty week', () => {
    expect(totalCardio([])).toEqual({ sessions: 0, minutes: 0, distanceKm: 0, calories: 0, sessionsWithCalories: 0 });
  });
});

describe('cardioInWeek', () => {
  const week = ['2026-09-20', '2026-09-21', '2026-09-22'];

  it('keeps only the dates in the week, newest first', () => {
    const out = cardioInWeek(
      [session({ date: '2026-09-20' }), session({ date: '2026-09-22' }), session({ date: '2026-09-13' })],
      week,
    );
    expect(out.map((s) => s.date)).toEqual(['2026-09-22', '2026-09-20']);
  });

  it('keeps several sessions on one day — a run and a walk are two things', () => {
    const out = cardioInWeek([session({ type: 'run' }), session({ type: 'walk' })], week);
    expect(out).toHaveLength(2);
  });
});

describe('weeklyCardioMinutes', () => {
  it('leaves an empty week in the series as a zero', () => {
    const series = weeklyCardioMinutes(
      [session({ date: '2026-09-20', minutes: 40 })],
      [['2026-09-06'], ['2026-09-13'], ['2026-09-20']],
    );
    expect(series).toEqual([0, 0, 40]);
  });
});

describe('readCardioWeek', () => {
  it('says nothing was logged rather than reporting zero against a target', () => {
    const r = readCardioWeek(0, 0);
    expect(r.headline).toMatch(/No conditioning/i);
    expect(r.ratio).toBe(0);
  });

  it('frames the reference as a number to know, not a rule', () => {
    const r = readCardioWeek(90, 3);
    expect(r.detail).toMatch(/not a rule to obey/i);
    expect(r.detail).toContain('60');
  });

  it('acknowledges passing the reference without overclaiming', () => {
    const r = readCardioWeek(WEEKLY_MINUTES_REFERENCE + 10, 4);
    expect(r.ratio).toBe(1);
    expect(r.detail).toMatch(/reference/i);
  });

  it('gets its singulars right', () => {
    expect(readCardioWeek(30, 1).headline).toContain('1 session');
    expect(readCardioWeek(60, 2).headline).toContain('2 sessions');
  });
});

describe('cardioKind', () => {
  it('has a kind for every type it advertises', () => {
    for (const k of CARDIO_KINDS) {
      expect(cardioKind(k.type).label).toBe(k.label);
    }
  });

  it('falls back rather than throwing on an unknown type from an old export', () => {
    expect(cardioKind('jetpack' as never).label).toBe('Other');
  });
});

describe('cardio survives a restore', () => {
  it('is carried by the logs restore map', () => {
    const restored = RESTORE_MAP.logs({ cardio: [session()], nutrition: [] });
    expect(restored?.cardio).toHaveLength(1);
  });
});

describe('cadence', () => {
  it('speaks a run in pace and a ride in speed', () => {
    const run = session({ type: 'run', minutes: 30, distanceKm: 5 });
    const ride = session({ type: 'ride', minutes: 55, distanceKm: 22.9 });
    expect(formatCadence(run, 'imperial')).toBe('9:39 /mi');
    expect(formatCadence(ride, 'imperial')).toMatch(/mph$/);
  });

  it('gets the speed arithmetic right', () => {
    // 20 km in 60 minutes is 20 km/h.
    expect(formatSpeed(speedPerHour(session({ minutes: 60, distanceKm: 20 }), 'metric'), 'metric')).toBe('20 km/h');
  });

  it('has neither without a distance', () => {
    expect(formatCadence(session({ type: 'ride', distanceKm: undefined }), 'metric')).toBeNull();
    expect(formatCadence(session({ type: 'run', distanceKm: undefined }), 'metric')).toBeNull();
  });

  it('gives every kind a cadence, so no row can fall through', () => {
    for (const k of CARDIO_KINDS) {
      expect(['pace', 'speed']).toContain(k.cadence);
    }
  });
});

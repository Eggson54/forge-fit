import {
  RECOVERY_CAVEAT,
  RECOVERY_LABEL,
  lastTrained,
  mostOverdue,
  readRecovery,
  recoveryBoard,
  recoveryFraction,
  recoveryState,
} from '../domain/recovery';
import type { MuscleGroup, SetEntry, Workout } from '../domain/types';

const TODAY = '2026-09-21';

const set = (over: Partial<SetEntry> = {}): SetEntry => ({
  id: Math.random().toString(36).slice(2),
  weightKg: 60,
  reps: 8,
  rpe: null,
  completed: true,
  ...over,
});

const session = (date: string, muscles: MuscleGroup[], over: Partial<Workout> = {}): Workout => ({
  id: `${date}-${muscles.join('-')}`,
  name: 'Session',
  status: 'completed',
  date,
  startedAt: `${date}T18:00:00.000Z`,
  completedAt: `${date}T19:00:00.000Z`,
  durationSeconds: 3600,
  exercises: muscles.map((m, i) => ({
    id: `${date}-${m}-${i}`,
    exerciseId: `ex_${m}`,
    name: m,
    primaryMuscle: m,
    restSeconds: 90,
    sets: [set(), set(), set()],
  })),
  focus: muscles,
  ...over,
});

describe('lastTrained', () => {
  it('takes the most recent date per muscle', () => {
    const last = lastTrained([
      session('2026-09-10', ['chest']),
      session('2026-09-18', ['chest', 'triceps']),
    ]);
    expect(last.chest).toBe('2026-09-18');
    expect(last.triceps).toBe('2026-09-18');
  });

  it('is not fooled by insertion order', () => {
    const last = lastTrained([session('2026-09-18', ['back']), session('2026-09-10', ['back'])]);
    expect(last.back).toBe('2026-09-18');
  });

  it('ignores an exercise where nothing was completed', () => {
    const skipped = session('2026-09-18', ['quads']);
    skipped.exercises[0]!.sets = [set({ completed: false }), set({ completed: false })];
    expect(lastTrained([skipped]).quads).toBeUndefined();
  });
});

describe('recoveryState', () => {
  it('reads the day of, the window after, and the long wait', () => {
    expect(recoveryState(0)).toBe('today');
    expect(recoveryState(1)).toBe('recovering');
    expect(recoveryState(2)).toBe('ready');
    expect(recoveryState(7)).toBe('ready');
    expect(recoveryState(8)).toBe('overdue');
    expect(recoveryState(null)).toBe('untrained');
  });

  it('has a label for every state it can return', () => {
    for (const days of [0, 1, 2, 30, null]) {
      expect(RECOVERY_LABEL[recoveryState(days)]).toBeTruthy();
    }
  });
});

describe('recoveryBoard', () => {
  it('puts the longest wait first and today last', () => {
    const board = recoveryBoard(
      [session(TODAY, ['chest']), session('2026-09-05', ['quads'])],
      TODAY,
    );
    const chest = board.findIndex((r) => r.muscle === 'chest');
    const quads = board.findIndex((r) => r.muscle === 'quads');
    expect(quads).toBeLessThan(chest);
  });

  it('sorts a muscle with no history above any wait', () => {
    const board = recoveryBoard([session('2026-08-01', ['chest'])], TODAY);
    expect(board[0]!.daysSince).toBeNull();
  });

  it('counts this week separately from the wait', () => {
    const board = recoveryBoard(
      [session('2026-09-20', ['chest']), session('2026-09-19', ['chest'])],
      TODAY,
    );
    const chest = board.find((r) => r.muscle === 'chest')!;
    expect(chest.daysSince).toBe(1);
    expect(chest.setsThisWeek).toBeGreaterThanOrEqual(6);
  });

  it('leaves an old session out of the weekly count but keeps it as the last date', () => {
    const board = recoveryBoard([session('2026-08-20', ['back'])], TODAY);
    const back = board.find((r) => r.muscle === 'back')!;
    expect(back.setsThisWeek).toBe(0);
    expect(back.lastDate).toBe('2026-08-20');
    expect(back.state).toBe('overdue');
  });

  it('gives every tracked muscle a row even with no history at all', () => {
    const board = recoveryBoard([], TODAY);
    expect(board.length).toBeGreaterThan(5);
    expect(board.every((r) => r.state === 'untrained')).toBe(true);
  });

  it('never reports a negative wait for a session dated ahead of today', () => {
    const board = recoveryBoard([session('2026-09-25', ['chest'])], TODAY);
    expect(board.find((r) => r.muscle === 'chest')!.daysSince).toBe(0);
  });
});

describe('readRecovery', () => {
  it('says nothing at all rather than something empty with no history', () => {
    expect(readRecovery(recoveryBoard([], TODAY))).toBeNull();
  });

  it('names what has been waiting', () => {
    const board = recoveryBoard([session(TODAY, ['chest'])], TODAY);
    const line = readRecovery(board)!;
    expect(line).toMatch(/nothing on record/i);
  });

  it('reads back the number of days when there is a date behind it', () => {
    const all: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'forearms'];
    const board = recoveryBoard(
      [session('2026-09-20', all), session('2026-09-01', ['quads'])],
      TODAY,
    );
    // Everything was trained yesterday, so nothing is overdue.
    expect(readRecovery(board)).toMatch(/recovery window/i);
  });

  it('calls out what is recovered when nothing is overdue', () => {
    const all: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'forearms'];
    const board = recoveryBoard([session('2026-09-17', all)], TODAY);
    expect(readRecovery(board)).toMatch(/available/i);
  });

  it('writes a list in English rather than with a trailing comma', () => {
    const board = recoveryBoard([session('2026-09-17', ['chest'])], TODAY);
    const line = readRecovery(board)!;
    expect(line).not.toMatch(/,\s*$/);
    expect(line).toContain(' and ');
  });
});

describe('mostOverdue', () => {
  it('returns only what is actually waiting, and no more than asked', () => {
    const board = recoveryBoard([session('2026-09-20', ['chest'])], TODAY);
    const worst = mostOverdue(board, 2);
    expect(worst).toHaveLength(2);
    expect(worst.every((r) => r.muscle !== 'chest')).toBe(true);
  });

  it('is empty when everything is inside its window', () => {
    const all: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'forearms'];
    expect(mostOverdue(recoveryBoard([session('2026-09-20', all)], TODAY))).toHaveLength(0);
  });
});

describe('recoveryFraction', () => {
  it('fills as the days pass and stops at full', () => {
    expect(recoveryFraction(0)).toBe(0);
    expect(recoveryFraction(1)).toBe(0.5);
    expect(recoveryFraction(2)).toBe(1);
    expect(recoveryFraction(40)).toBe(1);
  });

  it('reads empty for a muscle with no history, not full', () => {
    // Full is arguably true and says the wrong thing next to "Not trained".
    expect(recoveryFraction(null)).toBe(0);
  });
});

describe('the caveat', () => {
  it('admits what it cannot see', () => {
    expect(RECOVERY_CAVEAT).toMatch(/sore/i);
    expect(RECOVERY_CAVEAT).toMatch(/not an instruction/i);
  });
});

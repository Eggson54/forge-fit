import type { Goal, ReminderType } from './types';

export interface StarterReminder {
  type: ReminderType;
  time: string;
  /** Day indices, 0 = Sunday. */
  days: number[];
  /** Why this one is suggested — shown so the set does not look arbitrary. */
  reason: string;
}

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];

/**
 * A suggested opening set of reminders, keyed to the user's goal.
 *
 * An empty reminders screen with nine equally-weighted "add" buttons is a
 * decision, not a feature: most people close it and never come back. These are
 * defaults to accept and then edit, not a plan to follow — nothing here is
 * advice about what to eat, weigh or take.
 */
export function starterReminders(goal: Goal, trainingDaysPerWeek: number): StarterReminder[] {
  // Spread training days from Monday outwards, so 3 days lands Mon/Wed/Fri
  // rather than Mon/Tue/Wed.
  const days = trainingDayIndices(trainingDaysPerWeek);

  const workout: StarterReminder = {
    type: 'workout',
    time: '18:00',
    days,
    reason: `Matches the ${trainingDaysPerWeek} training days in your profile.`,
  };

  const byGoal: Record<Goal, StarterReminder[]> = {
    lose_fat: [
      workout,
      { type: 'meal', time: '13:00', days: EVERY_DAY, reason: 'Midday is where most untracked calories go missing.' },
      { type: 'weight', time: '07:30', days: EVERY_DAY, reason: 'Morning weigh-ins are the most comparable to each other.' },
    ],
    build_muscle: [
      workout,
      { type: 'protein', time: '20:00', days: EVERY_DAY, reason: 'An evening check leaves time to close the gap.' },
      { type: 'sleep', time: '22:30', days: EVERY_DAY, reason: 'Recovery is where the training actually lands.' },
    ],
    recomposition: [
      workout,
      { type: 'protein', time: '20:00', days: EVERY_DAY, reason: 'An evening check leaves time to close the gap.' },
      { type: 'progress_photo', time: '09:00', days: [0], reason: 'Recomp barely moves the scale — photos show it instead.' },
    ],
    gain_weight: [
      workout,
      { type: 'meal', time: '10:30', days: EVERY_DAY, reason: 'A mid-morning prompt is the easiest meal to add.' },
      { type: 'protein', time: '20:00', days: EVERY_DAY, reason: 'An evening check leaves time to close the gap.' },
    ],
    maintain: [
      workout,
      { type: 'weight', time: '07:30', days: [1, 4], reason: 'Twice a week is enough to catch drift early.' },
      { type: 'water', time: '11:00', days: WEEKDAYS, reason: 'Desk days are where hydration slips.' },
    ],
    athletic_performance: [
      workout,
      { type: 'sleep', time: '22:30', days: EVERY_DAY, reason: 'Sleep is the largest single lever on performance.' },
      { type: 'steps', time: '16:00', days: EVERY_DAY, reason: 'Keeps daily movement up between sessions.' },
    ],
  };

  return byGoal[goal] ?? byGoal.build_muscle;
}

/**
 * Evenly spaced training days starting Monday. Six days rests Sunday; seven
 * takes the whole week.
 */
export function trainingDayIndices(perWeek: number): number[] {
  const n = Math.max(1, Math.min(7, Math.round(perWeek)));
  if (n >= 7) return EVERY_DAY;
  const picks: number[] = [];
  for (let i = 0; i < n; i += 1) {
    // Positions 0..5 across Mon–Sat, then shifted into 1..6 day indices.
    picks.push(1 + Math.round((i * 5) / Math.max(1, n - 1 || 1)));
  }
  if (n === 1) return [1];
  return Array.from(new Set(picks)).sort((a, b) => a - b);
}

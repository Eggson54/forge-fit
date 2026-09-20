import type { ISODate } from './types';

export interface WeekDay {
  date: ISODate;
  trained: boolean;
  isToday: boolean;
  isFuture: boolean;
}

/**
 * How many sessions are still possible: today plus whatever is left of the
 * week, minus any of those days already trained. The pressure line on the home
 * screen is only honest if it counts the days you can still train in, not the
 * days remaining on the calendar.
 */
export function daysStillAvailable(days: WeekDay[]): number {
  return days.filter((d) => (d.isFuture || d.isToday) && !d.trained).length;
}

export type PaceTone = 'good' | 'warn' | 'neutral';

/**
 * The sentence under the week strip.
 *
 * It never says "you failed": once the target is out of reach it says what the
 * best remaining week looks like, because the person reading it still has days
 * to train and four sessions is not nothing because five was the plan.
 */
export function weekPace(done: number, target: number, available: number): { text: string; tone: PaceTone } {
  const remaining = Math.max(0, target - done);
  const dayWord = available === 1 ? 'day' : 'days';

  if (remaining === 0) {
    return { text: `Week's work is done — ${done} of ${target}.`, tone: 'good' };
  }
  if (remaining > available) {
    return {
      text:
        available === 0
          ? `Week's over. ${done} of ${target} logged.`
          : `${remaining} to go with ${available} ${dayWord} left — ${done + available} of ${target} is the ceiling now.`,
      tone: 'warn',
    };
  }
  if (remaining === available) {
    return {
      text: `${remaining} left and ${available} ${dayWord} to do ${remaining === 1 ? 'it' : 'them'} in. No slack.`,
      tone: 'warn',
    };
  }
  return { text: `${remaining} to go, ${available} ${dayWord} to choose from.`, tone: 'neutral' };
}

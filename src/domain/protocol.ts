import { addDaysISO } from './date';
import type { ISODate, Protocol, ProtocolFrequency, ProtocolLog } from './types';

/**
 * Expected doses per day, by the schedule the user set. This is arithmetic on
 * their own stated frequency — the app never proposes a frequency, a dose or a
 * cycle, and 'custom' deliberately has no rate because only the user knows it.
 */
const RATE_PER_DAY: Record<ProtocolFrequency, number | null> = {
  daily: 1,
  eod: 0.5,
  weekly: 1 / 7,
  '2x_week': 2 / 7,
  '3x_week': 3 / 7,
  custom: null,
};

export const FREQUENCY_LABEL: Record<ProtocolFrequency, string> = {
  daily: 'Daily',
  eod: 'Every other day',
  weekly: 'Weekly',
  '2x_week': '2×/week',
  '3x_week': '3×/week',
  custom: 'Custom',
};

/** Days of the window the protocol has actually been running for. */
export function activeDaysInWindow(startedAt: ISODate, windowDays: number, today: ISODate): number {
  const windowStart = addDaysISO(today, -(windowDays - 1));
  const from = startedAt > windowStart ? startedAt : windowStart;
  if (from > today) return 0;
  const days = Math.round((Date.parse(`${today}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / 86_400_000) + 1;
  return Math.max(0, days);
}

/** Doses the user's own schedule implies over the window. Null for 'custom'. */
export function expectedDoses(protocol: Protocol, windowDays: number, today: ISODate): number | null {
  const rate = RATE_PER_DAY[protocol.frequency];
  if (rate == null) return null;
  const days = activeDaysInWindow(protocol.startedAt, windowDays, today);
  return Math.round(days * rate);
}

export interface Adherence {
  taken: number;
  expected: number | null;
  /** taken / expected, capped at 1. Null when the schedule implies no number. */
  ratio: number | null;
}

/**
 * Adherence against the schedule, not against the log.
 *
 * Counting taken-days over *logged* days reads 100% for anyone who only opens
 * the app on the days they actually took something — which is most people, and
 * exactly the case the number is supposed to catch.
 */
export function adherence(
  protocol: Protocol,
  logs: ProtocolLog[],
  windowDays: number,
  today: ISODate,
): Adherence {
  const windowStart = addDaysISO(today, -(windowDays - 1));
  const taken = logs.filter((l) => l.protocolId === protocol.id && l.taken && l.date >= windowStart && l.date <= today).length;
  const expected = expectedDoses(protocol, windowDays, today);
  if (expected == null) return { taken, expected: null, ratio: null };
  if (expected === 0) return { taken, expected, ratio: null };
  return { taken, expected, ratio: Math.min(1, taken / expected) };
}

import type { ISODate } from './types';
import type { VitalsDay } from './vitals';

/**
 * Normalising an Open Wearables response into this app's own shapes.
 *
 * Open Wearables (github.com/the-momentum/open-wearables, MIT) is a
 * self-hosted service that puts Garmin, Whoop, Oura, Polar, Suunto, Fitbit,
 * Withings, Samsung and the rest behind one API. It does not remove the need
 * for each vendor's developer credentials — those still go in *its* config —
 * but it removes eight OAuth flows, eight data mappings and eight sync loops
 * from this app, which is the part that would actually have taken months.
 *
 * Everything below is written against the schemas in that repository rather
 * than from memory, and every field is treated as optional because the
 * service is explicit that coverage varies by provider: a Whoop user has a
 * recovery score and no VO2 max, an Oura user has neither, and a row that
 * assumes otherwise turns a gap into a zero. A zero is a measurement.
 */

// --------------------------------------------------------- their shapes ----

/** Their pagination envelope. Every list endpoint returns this. */
export interface Paginated<T> {
  data: T[];
  pagination?: { next_cursor?: string | null; has_more?: boolean };
}

export interface SourceMetadata {
  provider: string;
  source?: string | null;
  device?: string | null;
}

export interface OwSleepSummary {
  date: string;
  source: SourceMetadata;
  start_time?: string | null;
  end_time?: string | null;
  duration_minutes?: number | null;
  total_duration_minutes?: number | null;
  time_in_bed_minutes?: number | null;
  efficiency_percent?: number | null;
  stages?: {
    awake_minutes?: number | null;
    light_minutes?: number | null;
    deep_minutes?: number | null;
    rem_minutes?: number | null;
  } | null;
  interruptions_count?: number | null;
}

export interface OwActivitySummary {
  date: string;
  source: SourceMetadata;
  steps?: number | null;
  distance_meters?: number | null;
  elevation_meters?: number | null;
  active_calories_kcal?: number | null;
  total_calories_kcal?: number | null;
  active_minutes?: number | null;
  heart_rate?: { avg_bpm?: number | null; max_bpm?: number | null; min_bpm?: number | null } | null;
}

export interface OwRecoverySummary {
  date: string;
  source: SourceMetadata;
  resting_heart_rate_bpm?: number | null;
  avg_hrv_sdnn_ms?: number | null;
  avg_hrv_rmssd_ms?: number | null;
  avg_spo2_percent?: number | null;
  sleep_efficiency_percent?: number | null;
}

// ----------------------------------------------------------- our shapes ----

export interface NormalisedSleep {
  date: ISODate;
  minutes: number;
  /** 1-5, derived from efficiency when the provider reports it. */
  quality: number | null;
  stages: { awake: number; light: number; deep: number; rem: number } | null;
  provider: string;
}

export interface NormalisedDay {
  date: ISODate;
  steps: number | null;
  activeKcal: number | null;
  distanceM: number | null;
  provider: string;
}

/** A date string from their API, trimmed to the day this app keys on. */
function isoDate(value: string | null | undefined): ISODate | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/** Their nullable numbers, with NaN and negatives treated as absent. */
function num(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Sleep efficiency as this app's 1-5 quality rating.
 *
 * Efficiency is time asleep over time in bed, and it clusters high — under
 * 75% is genuinely disturbed, over 92% is excellent. A linear map across
 * 0-100 would put almost every night at 4 or 5 and make the rating useless,
 * so the bands are where the distribution actually is.
 */
export function qualityFromEfficiency(efficiency: number | null | undefined): number | null {
  const e = num(efficiency);
  if (e == null || e === 0) return null;
  if (e >= 92) return 5;
  if (e >= 87) return 4;
  if (e >= 80) return 3;
  if (e >= 72) return 2;
  return 1;
}

export function normaliseSleep(rows: OwSleepSummary[]): NormalisedSleep[] {
  const out: NormalisedSleep[] = [];

  for (const row of rows) {
    const date = isoDate(row.date);
    if (!date) continue;

    // `duration_minutes` excludes naps and is the figure this app's sleep
    // score is built on. Falling back to the total would silently count an
    // afternoon nap as part of the night.
    const minutes = num(row.duration_minutes) ?? num(row.total_duration_minutes);
    if (minutes == null || minutes <= 0) continue;

    const s = row.stages;
    const stages =
      s && [s.awake_minutes, s.light_minutes, s.deep_minutes, s.rem_minutes].some((v) => num(v) != null)
        ? {
            awake: num(s.awake_minutes) ?? 0,
            light: num(s.light_minutes) ?? 0,
            deep: num(s.deep_minutes) ?? 0,
            rem: num(s.rem_minutes) ?? 0,
          }
        : null;

    out.push({
      date,
      minutes: Math.round(minutes),
      quality: qualityFromEfficiency(row.efficiency_percent),
      stages,
      provider: row.source?.provider ?? 'unknown',
    });
  }

  return dedupeByDate(out);
}

export function normaliseActivity(rows: OwActivitySummary[]): NormalisedDay[] {
  const out: NormalisedDay[] = [];

  for (const row of rows) {
    const date = isoDate(row.date);
    if (!date) continue;

    const steps = num(row.steps);
    const activeKcal = num(row.active_calories_kcal);
    const distanceM = num(row.distance_meters);
    // A row with nothing in it is a day the service knows about and has no
    // data for. Storing it would overwrite whatever the phone recorded.
    if (steps == null && activeKcal == null && distanceM == null) continue;

    out.push({
      date,
      steps: steps == null ? null : Math.round(steps),
      activeKcal: activeKcal == null ? null : Math.round(activeKcal),
      distanceM: distanceM == null ? null : Math.round(distanceM),
      provider: row.source?.provider ?? 'unknown',
    });
  }

  return dedupeByDate(out);
}

/**
 * Recovery rows as this app's vitals days.
 *
 * HRV needs care. Their API exposes SDNN and RMSSD in separate fields and is
 * explicit that they are different measurements — Whoop reports RMSSD, Apple
 * reports SDNN, and the two are not interchangeable. This app's baselines are
 * built on whatever it has been given consistently, so mixing them would make
 * a change of provider look like a change in the athlete. SDNN is preferred,
 * and a day carrying only RMSSD is marked so the reading can say which.
 */
export function normaliseRecovery(rows: OwRecoverySummary[]): (VitalsDay & { hrvKind: 'sdnn' | 'rmssd' | null })[] {
  const out: (VitalsDay & { hrvKind: 'sdnn' | 'rmssd' | null })[] = [];

  for (const row of rows) {
    const date = isoDate(row.date);
    if (!date) continue;

    const sdnn = num(row.avg_hrv_sdnn_ms);
    const rmssd = num(row.avg_hrv_rmssd_ms);
    const hrv = sdnn ?? rmssd;
    const rhr = num(row.resting_heart_rate_bpm);
    const spo2 = num(row.avg_spo2_percent);
    if (hrv == null && rhr == null && spo2 == null) continue;

    out.push({
      date,
      ...(rhr != null ? { restingHeartRate: Math.round(rhr) } : null),
      ...(hrv != null ? { hrvMs: Math.round(hrv * 10) / 10 } : null),
      ...(spo2 != null ? { oxygenSaturationPct: Math.round(spo2 * 10) / 10 } : null),
      source: 'health',
      hrvKind: sdnn != null ? 'sdnn' : rmssd != null ? 'rmssd' : null,
    });
  }

  return dedupeByDate(out);
}

/**
 * One row per day, keeping the first.
 *
 * Their endpoints can return several rows for a date when more than one
 * device wrote that day, ordered by the priority configured in the service.
 * Taking the first honours that ordering; summing or averaging would blend
 * a watch and a phone into a number neither of them measured.
 */
function dedupeByDate<T extends { date: ISODate }>(rows: T[]): T[] {
  const seen = new Set<ISODate>();
  const out: T[] = [];
  for (const row of rows) {
    if (seen.has(row.date)) continue;
    seen.add(row.date);
    out.push(row);
  }
  return out;
}

// ------------------------------------------------------------- coverage ----

export interface ProviderCoverage {
  provider: string;
  days: number;
  first: ISODate;
  last: ISODate;
}

/**
 * Which providers actually supplied anything, and over what span.
 *
 * Shown rather than a list of what *could* be connected: somebody who linked
 * a Whoop six months ago and has not worn it deserves to see that, not a
 * green tick.
 */
export function coverageOf(rows: { date: ISODate; provider: string }[]): ProviderCoverage[] {
  const byProvider = new Map<string, ISODate[]>();
  for (const row of rows) {
    const list = byProvider.get(row.provider) ?? [];
    list.push(row.date);
    byProvider.set(row.provider, list);
  }

  return [...byProvider.entries()]
    .map(([provider, dates]) => {
      const sorted = [...dates].sort();
      return { provider, days: sorted.length, first: sorted[0]!, last: sorted[sorted.length - 1]! };
    })
    .sort((a, b) => b.days - a.days);
}

export const PROVIDER_LABEL: Record<string, string> = {
  apple: 'Apple Health',
  samsung: 'Samsung Health',
  garmin: 'Garmin',
  health_connect: 'Health Connect',
  google_health: 'Google Health',
  polar: 'Polar',
  suunto: 'Suunto',
  whoop: 'WHOOP',
  strava: 'Strava',
  oura: 'Oura',
  fitbit: 'Fitbit',
  ultrahuman: 'Ultrahuman',
  sensorbio: 'Sensorbio',
  withings: 'Withings',
  unknown: 'Unknown source',
  internal: 'Entered here',
};

export function providerLabel(id: string): string {
  return PROVIDER_LABEL[id] ?? id.replace(/_/g, ' ');
}

export const WEARABLES_NOTE =
  'Open Wearables is a service you run, not one this app talks to on your behalf. Your data goes to your server and nowhere else, and the credentials each vendor issues live there rather than in this app.';

export const HRV_KIND_NOTE =
  'HRV comes in two flavours and they are not interchangeable: Apple reports SDNN, WHOOP reports RMSSD, and the numbers differ by a factor of two or more. Baselines here are built per signal, so switching devices does not read as a change in you.';

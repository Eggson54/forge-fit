import { Platform } from 'react-native';
import { health, type DailyHealth } from './health';
import { SOURCE_LABEL, type WorkoutSource } from '../domain/healthWorkouts';

/**
 * Apple Watch.
 *
 * There is no "connect to Apple Watch" API, and any app offering a button
 * that claims to do it is offering a toggle. A Watch pairs with the phone in
 * Apple's own Watch app, and what a third-party app can actually do is read
 * the data the Watch writes into HealthKit.
 *
 * So this detects rather than connects. Heart-rate variability, resting heart
 * rate and sleeping wrist temperature are, in practice, only written by a
 * Watch; finding recent samples of them is real evidence one is paired and
 * worn. Finding none is reported as "no Watch data in Health", which is the
 * true statement — the Watch might be in a drawer, or the permission might
 * have been declined, and the app cannot tell those apart.
 *
 * A watchOS companion app — live workout mirroring, set editing on the wrist,
 * complications — is a separate build target that has to be made in Xcode. It
 * cannot be shipped from a JavaScript bundle, and `companionInstalled` says so
 * rather than pretending.
 */

export interface WatchStatus {
  /** Watch-written samples found in Health within the look-back window. */
  detected: boolean;
  /** The day those samples came from. */
  lastSeenDate: string | null;
  /** Which signals were found; useful for saying what it can and cannot read. */
  signals: string[];
  /**
   * Every device or app found writing workouts to Health.
   *
   * Reported rather than reduced to a yes/no, because "no Apple Watch" and
   * "no wearable at all" are very different answers to somebody holding a
   * Garmin.
   */
  devices: WorkoutSource[];
  /** True only in a build that includes a watchOS target. */
  companionInstalled: boolean;
  /** Why there is nothing, in the words the screen shows. */
  reason: string | null;
}

const SIGNAL_LABEL: Record<string, string> = {
  hrvMs: 'heart rate variability',
  restingHeartRate: 'resting heart rate',
  wristTemperatureC: 'wrist temperature',
  oxygenSaturationPct: 'blood oxygen',
  activeEnergyKcal: 'active energy',
};

/**
 * Metrics used only as a weak fallback, and deliberately a short list.
 *
 * This used to include `restingHeartRate` and `hrvMs` and called the result
 * an Apple Watch. It is not: a Garmin, a WHOOP, a Polar and an Oura all
 * write resting heart rate into Health, so anybody wearing one of those was
 * told they had a Watch. Wrist temperature is the only one of the three that
 * is still, in practice, Apple-only — and even that is Series 8 and later,
 * so its absence proves nothing either.
 *
 * The reliable signal is which app wrote a workout, which `detect` uses
 * first; this is what is left when there are no workouts to look at.
 */
const WATCH_LEANING: (keyof DailyHealth)[] = ['wristTemperatureC'];

export const watch = {
  /**
   * Look back over the last few days for Watch-written samples.
   *
   * Several days rather than today, because today's resting heart rate is not
   * computed until the Watch has had enough of the day to compute it, and a
   * check run at 7am would otherwise report no Watch at all.
   */
  async detect(dates: string[]): Promise<WatchStatus> {
    if (Platform.OS !== 'ios') {
      return { detected: false, lastSeenDate: null, signals: [], devices: [], companionInstalled: false,
        reason: 'Apple Watch is iOS only.' };
    }
    if (!health.hasNativeModule) {
      return { detected: false, lastSeenDate: null, signals: [], devices: [], companionInstalled: false,
        reason: 'Needs a development build. Watch data arrives through HealthKit, which Expo Go cannot load.' };
    }

    /**
     * Who wrote the workouts is the reliable signal.
     *
     * Every app that syncs to Health stamps its workouts with its own source,
     * so this distinguishes a Watch from a Garmin from a WHOOP directly
     * instead of inferring it from which numbers happen to be present. The
     * previous version inferred, and told anyone wearing a Garmin that they
     * had an Apple Watch.
     */
    const sorted = [...dates].sort();
    const from = new Date(`${sorted[0] ?? dates[0]}T00:00:00`);
    const to = new Date(`${sorted[sorted.length - 1] ?? dates[0]}T23:59:59`);

    const workouts = await health.readWorkouts(from, to);
    if (workouts.length > 0) {
      const devices = [...new Set(workouts.map((w) => w.source))];
      const watchWorkout = workouts.find((w) => w.source === 'apple_watch');

      return {
        detected: watchWorkout != null,
        lastSeenDate: watchWorkout?.date ?? workouts[0]!.date,
        signals: [],
        devices,
        companionInstalled: watch.companionInstalled,
        reason: watchWorkout
          ? null
          : `No Apple Watch workouts in Health, but ${devices
              .map((d) => SOURCE_LABEL[d])
              .join(' and ')} ${devices.length === 1 ? 'is' : 'are'} writing to it. Everything ForgeFit reads from Health works the same either way.`,
      };
    }

    // No workouts at all. Fall back to the one metric that still leans
    // Apple-only, and say plainly that it is a guess.
    for (const date of dates) {
      const day = await health.readDay(date);
      const found = WATCH_LEANING.filter((k) => day[k] != null);
      if (found.length > 0) {
        const extra = (['oxygenSaturationPct', 'activeEnergyKcal', 'hrvMs', 'restingHeartRate'] as (keyof DailyHealth)[])
          .filter((k) => day[k] != null);
        return {
          detected: true,
          lastSeenDate: date,
          signals: [...found, ...extra].map((k) => SIGNAL_LABEL[k] ?? String(k)),
          devices: ['apple_watch'],
          companionInstalled: watch.companionInstalled,
          reason: null,
        };
      }
    }

    return {
      detected: false,
      lastSeenDate: null,
      signals: [],
      devices: [],
      companionInstalled: watch.companionInstalled,
      reason:
        'Nothing has written a workout or wrist temperature to Health in the last few days. Either no wearable is paired, it has not been worn, or Health permission was declined \u2014 the app cannot tell those apart.',
    };
  },

  /**
   * Whether this build carries a watchOS companion.
   *
   * Hard-coded false until a watchOS target exists in the project. Making it
   * configurable would only let it be turned on while remaining untrue.
   */
  get companionInstalled(): boolean {
    return false;
  },

  companionNote:
    'A wrist app — starting a session, editing sets, exercise previews, complications — is a separate watchOS target built in Xcode. It is not something a JavaScript bundle can install, so the app reads Watch data through Health instead and says so.',
};

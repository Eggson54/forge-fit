import { Platform } from 'react-native';
import { health, type DailyHealth } from './health';

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

/** The keys that effectively only a Watch writes. */
const WATCH_ONLY: (keyof DailyHealth)[] = ['hrvMs', 'restingHeartRate', 'wristTemperatureC'];

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
      return {
        detected: false,
        lastSeenDate: null,
        signals: [],
        companionInstalled: false,
        reason: 'Apple Watch is iOS only.',
      };
    }
    if (!health.hasNativeModule) {
      return {
        detected: false,
        lastSeenDate: null,
        signals: [],
        companionInstalled: false,
        reason:
          'Needs a development build. Watch data arrives through HealthKit, which Expo Go cannot load.',
      };
    }

    for (const date of dates) {
      const day = await health.readDay(date);
      const found = WATCH_ONLY.filter((k) => day[k] != null);
      if (found.length > 0) {
        const extra = (['oxygenSaturationPct', 'activeEnergyKcal'] as (keyof DailyHealth)[]).filter(
          (k) => day[k] != null,
        );
        return {
          detected: true,
          lastSeenDate: date,
          signals: [...found, ...extra].map((k) => SIGNAL_LABEL[k] ?? String(k)),
          companionInstalled: watch.companionInstalled,
          reason: null,
        };
      }
    }

    return {
      detected: false,
      lastSeenDate: null,
      signals: [],
      companionInstalled: watch.companionInstalled,
      reason:
        'No Watch-written data in Health for the last few days. Either no Watch is paired, it has not been worn, or Health permission was declined — the app cannot tell those apart.',
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

import { config } from './config';

/**
 * Ad abstraction. The concrete provider (AdMob via a dev build) plugs in here.
 * In Expo Go / when unconfigured, ads render as inert placeholders so layouts
 * are still testable.
 *
 * Policy enforced by callers via `shouldShow`:
 *  - Pro users NEVER see ads.
 *  - No ads during an active workout.
 *  - No ads on sensitive/health-detail screens.
 */
export type AdPlacement = 'home_feed' | 'nutrition_result' | 'section_break' | 'rewarded_ai';

export interface AdContext {
  isPro: boolean;
  inActiveWorkout: boolean;
}

export const ads = {
  get enabled() {
    return config.ads.enabled;
  },
  /** Central gate — the ONLY place ad visibility is decided. */
  shouldShow(placement: AdPlacement, ctx: AdContext): boolean {
    if (ctx.isPro) return false; // premium => no ads, ever
    if (ctx.inActiveWorkout) return false; // never interrupt training
    if (placement === 'rewarded_ai') return true; // opt-in only, user taps to watch
    return true;
  },
  /** Show a rewarded ad; resolves true if the user earned the reward. */
  async showRewarded(ctx: AdContext): Promise<boolean> {
    if (ctx.isPro) return true; // Pro gets the reward without an ad
    if (!config.ads.enabled) {
      // Dev/mock: simulate a completed rewarded view.
      await new Promise((r) => setTimeout(r, 300));
      return true;
    }
    // Real provider: present rewarded ad, resolve on reward callback.
    return true;
  },
};

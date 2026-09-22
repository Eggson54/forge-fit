import { lookupUrl, readProduct, type LookupResult, type OffResponse } from '../domain/productLookup';

/**
 * Looking a barcode up in Open Food Facts.
 *
 * No key and no account. The obligations are an honest User-Agent — so they
 * can see who is calling and get in touch if something misbehaves — and not
 * hammering a service that is run by volunteers on donations.
 *
 * Every failure comes back as a value rather than an exception, because the
 * caller already has a perfectly good path when this does not work: the
 * athlete types the label in, and the app remembers the code forever. The
 * lookup is an accelerator, never a dependency.
 */

const TIMEOUT_MS = 6000;

/** Identifies this app to Open Food Facts, per their SDK's own convention. */
const USER_AGENT = 'ForgeFit - Android/iOS - https://forgefit.app';

/**
 * Codes already asked about this session.
 *
 * A scanner fires repeatedly at the same barcode while the camera is pointed
 * at it. Without this, one tin produces a dozen identical requests to a
 * volunteer-run service in as many seconds.
 */
const seen = new Map<string, LookupResult>();

export const products = {
  /** Whether lookups are switched on for this build. */
  enabled(): boolean {
    return (process.env.EXPO_PUBLIC_FOOD_LOOKUP ?? 'on') !== 'off';
  },

  /** The base, overridable so a self-hosted mirror can be used instead. */
  base(): string {
    return process.env.EXPO_PUBLIC_FOOD_LOOKUP_URL || 'https://world.openfoodfacts.org';
  },

  forget(): void {
    seen.clear();
  },

  async lookup(barcode: string): Promise<LookupResult> {
    if (!this.enabled()) {
      return { kind: 'unreachable', reason: 'Product lookup is switched off for this build.' };
    }

    const cached = seen.get(barcode);
    if (cached) return cached;

    // A timeout, because the alternative is a spinner that never resolves in
    // a supermarket basement — which is exactly where this gets used.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(lookupUrl(barcode, this.base()), {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        // Not cached: a 500 today should not stop the same code working
        // tomorrow, where a genuine "no such product" is worth remembering.
        return { kind: 'unreachable', reason: `Open Food Facts answered ${response.status}.` };
      }

      const result = readProduct((await response.json()) as OffResponse, barcode);
      seen.set(barcode, result);
      return result;
    } catch (e) {
      const aborted = (e as Error)?.name === 'AbortError';
      return {
        kind: 'unreachable',
        reason: aborted
          ? 'Open Food Facts took too long to answer. Type the label in and the app will remember this code.'
          : 'Could not reach Open Food Facts. Type the label in and the app will remember this code.',
      };
    } finally {
      clearTimeout(timer);
    }
  },
};

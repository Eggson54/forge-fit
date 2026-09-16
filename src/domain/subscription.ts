import type { SubscriptionState } from './types';

/**
 * Whether a subscription currently grants Pro.
 *
 * The tier alone is not the entitlement. A lapsed subscription keeps its tier
 * in whatever was last read from the store — checking only `tier === 'pro'`
 * hands out Pro features to someone whose access expired last month, and the
 * expiry date is right there in the state that says so.
 *
 * A null `expiresAt` means no expiry is known: a lifetime entitlement, or a
 * store that does not report one. That is treated as active, because the
 * alternative is revoking access from a paying customer over missing metadata.
 */
export function isSubscriptionActive(subscription: SubscriptionState, now: Date = new Date()): boolean {
  if (subscription.tier !== 'pro') return false;
  if (!subscription.expiresAt) return true;
  const expiry = Date.parse(subscription.expiresAt);
  if (Number.isNaN(expiry)) return true;
  return expiry > now.getTime();
}

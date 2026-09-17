import { config } from './config';

/**
 * Privacy-conscious product analytics. We ONLY emit coarse product events, never
 * health values (weights, macros, doses, photos). When no analytics key is
 * configured, events are logged to the console in dev and dropped in prod.
 */
export type AnalyticsEvent =
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'workout_started'
  | 'workout_completed'
  | 'meal_logged'
  | 'food_scan_completed'
  | 'reminder_completed'
  | 'coach_message_viewed'
  | 'weekly_review_viewed'
  | 'paywall_viewed'
  | 'subscription_started'
  | 'subscription_cancelled'
  | 'protocol_logged'
  | 'gym_map_location_enabled'
  | 'gym_claimed';

// Allowlist of non-sensitive property keys. Anything else is stripped.
const ALLOWED_PROPS = new Set(['tier', 'source', 'personality', 'goal', 'duration_bucket', 'count_bucket', 'result']);

function sanitizeProps(props?: Record<string, unknown>): Record<string, unknown> {
  if (!props) return {};
  return Object.fromEntries(Object.entries(props).filter(([k]) => ALLOWED_PROPS.has(k)));
}

let enabled = config.analytics.enabled;

export const analytics = {
  track(event: AnalyticsEvent, props?: Record<string, unknown>): void {
    const clean = sanitizeProps(props);
    if (!enabled) {
      if (config.isDev) console.log(`[analytics] ${event}`, clean);
      return;
    }
    // Integration point for a real provider (PostHog/Amplitude). Fire-and-forget.
    try {
      // provider.capture(event, clean)
    } catch {
      /* never let analytics break the app */
    }
  },
  setEnabled(v: boolean) {
    enabled = v && config.analytics.enabled;
  },
  /** Bucket helpers keep raw values out of analytics. */
  durationBucket(minutes: number): string {
    if (minutes < 30) return '<30';
    if (minutes < 60) return '30-60';
    return '60+';
  },
};

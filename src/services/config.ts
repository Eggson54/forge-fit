/**
 * Central runtime configuration. Reads EXPO_PUBLIC_* env vars (safe to bundle —
 * these are publishable keys only; secrets live server-side). Every integration
 * degrades to a mock when its config is absent, so the app is fully functional
 * offline and in development.
 */
export const config = {
  supabase: {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    get enabled() {
      return Boolean(this.url && this.anonKey);
    },
  },
  ai: {
    apiUrl: process.env.EXPO_PUBLIC_AI_API_URL ?? '',
    get enabled() {
      return Boolean(this.apiUrl);
    },
  },
  revenueCat: {
    iosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '',
    androidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '',
    get enabled() {
      return Boolean(this.iosKey || this.androidKey);
    },
  },
  ads: {
    iosBanner: process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER ?? '',
    androidBanner: process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER ?? '',
    get enabled() {
      return Boolean(this.iosBanner || this.androidBanner);
    },
  },
  analytics: {
    key: process.env.EXPO_PUBLIC_ANALYTICS_KEY ?? '',
    get enabled() {
      return Boolean(this.key);
    },
  },
  strava: {
    clientId: process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID ?? '',
    // Token exchange happens on YOUR backend (never ship the client secret).
    exchangeUrl: process.env.EXPO_PUBLIC_STRAVA_EXCHANGE_URL ?? '',
    get enabled() {
      return Boolean(this.clientId && this.exchangeUrl);
    },
  },
  isDev: process.env.NODE_ENV !== 'production',
};

/** Free-tier limits enforced client-side (server should re-validate for AI). */
export const FREE_TIER_LIMITS = {
  aiFoodScansPerDay: 5,
  aiWorkoutGenerationsPerWeek: 1,
  maxReminders: 5,
  coachPersonalities: ['friendly', 'motivational'] as const,
};

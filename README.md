# ForgeFit — AI Fitness Coach

> "Your AI fitness coach that tracks everything and doesn't let you make excuses."

An original, production-oriented all-in-one fitness platform: AI calorie/food tracking, AI
workout generation, workout tracking with progressive overload, an aggressive-but-safe AI
accountability coach, weight & body tracking, progress photos, streaks/gamification, a discipline
score, protocol tracking, reminders, Apple Health integration hooks, and a free/Pro (ad-supported)
monetization model.

Built with **Expo (React Native) + TypeScript + Expo Router + Zustand + Supabase**. It is
**offline-first**: every feature works locally with no backend, and cleanly syncs/upgrades to
Supabase + a secure AI backend when configured.

---

## Why this stack

- **Expo + React Native + TypeScript** — one codebase for iOS/Android, fast iteration, OTA updates,
  and a huge native-module ecosystem (camera, notifications, secure store, health).
- **Expo Router** — file-based, typed navigation with native stack + tabs.
- **Zustand + AsyncStorage** — small, fast, offline-first state with persistence; no boilerplate.
- **Supabase** — Postgres + Auth + Row Level Security + Storage, so per-user health data is
  isolated at the database layer.
- **Service abstractions** for AI, ads, subscriptions, analytics, notifications and health, each
  with a mock so the app is fully testable without third-party accounts.

---

## Project layout

```
mobile/
├── app/                      # Expo Router routes (screens)
│   ├── _layout.tsx           # Root providers, splash, auth gate
│   ├── index.tsx             # Entry redirect (auth → onboarding → tabs)
│   ├── (auth)/               # sign-in, sign-up, forgot-password
│   ├── onboarding.tsx        # 11-step onboarding
│   ├── (tabs)/               # home, workout, nutrition, progress, profile
│   ├── workout/              # active session, generate, library, history, [id]
│   ├── nutrition/add.tsx     # search / manual / AI estimate
│   ├── coach.tsx             # interactive AI coach
│   ├── protocol/             # optional protocol tracker
│   ├── progress/             # weight, measurements, photos
│   ├── settings/             # coach, goals, notifications, privacy, subscription
│   ├── reminders.tsx, paywall.tsx, achievements.tsx, weekly-review.tsx, log.tsx
├── src/
│   ├── theme/                # dark-first design tokens (colors, type, spacing)
│   ├── domain/               # PURE business logic (unit-tested): discipline, overload,
│   │                         #   streaks, nutrition math, 1RM/volume, coach engine
│   ├── data/                 # exercise library + starter food DB
│   ├── services/             # supabase, auth, ai/, storage, notifications, ads,
│   │                         #   subscriptions, health, analytics, dataExport, config
│   ├── stores/               # Zustand stores (auth, profile, logs, workouts, …)
│   ├── components/           # UI kit (ui/) + app components (CoachCard, Icon, …)
│   └── __tests__/            # Jest domain tests
├── supabase/
│   ├── migrations/           # schema + RLS + storage bucket
│   └── functions/            # delete-account edge function
└── server/                   # reference secure AI backend (holds provider key)
```

---

## Running the app

```bash
cd mobile
npm install
npx expo start           # then press i / a, or scan the QR with Expo Go
```

The app runs **fully offline** out of the box (local accounts, mock AI, mock subscriptions,
placeholder ads). No environment variables are required for development.

### Run in a browser (no simulator)

ForgeFit also builds for the web via react-native-web, so it can be previewed in any browser:

```bash
npm run web                       # dev server
npx expo export --platform web    # static build in dist/ (host anywhere)
```

Native-only features (secure keychain, notifications, camera, Apple Health) degrade gracefully
on web; the core onboarding, dashboard, workout, nutrition, coach and progress flows all work.

### Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Start the Expo dev server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Jest domain/logic tests |
| `npm run ios` / `android` / `web` | Launch a platform |

---

## Environment variables

Copy `.env.example` → `.env`. **All are optional** — each integration falls back to a mock.

| Variable | Purpose | If blank |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` / `..._ANON_KEY` | Auth + cloud sync | Local-only mode |
| `EXPO_PUBLIC_AI_API_URL` | Your secure AI backend (see `/server`) | On-device mock AI |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `..._ANDROID_KEY` | Subscriptions | Mock purchases |
| `EXPO_PUBLIC_ADMOB_IOS_BANNER` / `..._ANDROID_BANNER` | Ads | Inert placeholders |
| `EXPO_PUBLIC_ANALYTICS_KEY` | Product analytics | Console (dev only) |

**No model provider keys ever live in the app.** `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` live only
in the `/server` deployment.

---

## Backend setup (optional)

### Supabase
1. Create a project, then run `supabase/migrations/0001_init.sql` and `0002_storage.sql`
   (SQL editor or `supabase db push`).
2. This creates every table with **Row Level Security** (owner-only access), auto-provisions a
   profile on sign-up, and a private `progress-photos` storage bucket.
3. Deploy the account-deletion function: `supabase functions deploy delete-account`.
4. Put the URL + anon key in `.env`.

### AI backend
```bash
cd server && npm install
ANTHROPIC_API_KEY=... npm start        # or OPENAI_API_KEY, or neither for the deterministic fallback
```
Point `EXPO_PUBLIC_AI_API_URL` at it. The backend authenticates the Supabase JWT, rate-limits per
user (free vs Pro), asks the model for **strict JSON**, and **validates/sanitizes** every response
(e.g. macro estimates are re-derived and clamped) before returning.

---

## Safety & privacy

- The app is a **fitness tracker and coach — not medical advice**. It never diagnoses, prescribes,
  or recommends doses/cycles/compounds. The protocol tracker is record-keeping only and is disabled
  by default.
- The AI coach can be blunt but **never** uses hate speech, threats, slurs, or body-shaming.
  Aggressive language is a toggle the user fully controls; disabling it softens every message.
- Health data is treated as sensitive: isolated per-user via RLS, never sold, never used for ad
  targeting. Analytics capture only coarse product events (never weights, macros, doses, or photos).
- Secure values (auth/local credentials) use the device keychain via `expo-secure-store`.

## Monetization

- **Free:** tracking, basic AI coach, basic analytics, 5 reminders, limited AI food scans, ads.
- **Pro (~$7.99/mo, configurable):** no ads, unlimited AI, advanced coaching/analytics/workouts,
  unlimited reminders. Ads never show during an active workout or to Pro users; the ad layer is a
  single policy gate (`services/ads.ts`) so a provider swap is one file.

---

## Tests

`npm test` runs the pure-logic suite (18 tests) covering unit conversions, calorie/macro targets &
safety floors, macro sanitization, 1RM/volume, progressive-overload recommendations, the discipline
score, streak transitions, and achievement unlocks — the app's core correctness, verifiable without
a device.

## What remains for production

- Native **dev build** (EAS) to activate: AdMob banners, RevenueCat billing, Apple/Health Connect
  (interfaces are already wired — see `services/health.ts`, `ads.ts`, `subscriptions.ts`).
- Real EAS `projectId`, bundle signing, and store metadata.
- Server deployment for `/server` + Supabase project provisioning and backups.
- Full cloud **sync engine** (the offline stores and schema are ready; add a sync reconciler).
- Legal: Terms & Privacy Policy pages, App Store health/data disclosures.

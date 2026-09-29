# What ForgeFit needs from you

Nothing here is needed to *run* the app. Every integration is written to
degrade to a mock or to an honest "not connected" screen, so you can walk
the whole thing today with no account anywhere. This is the list for
turning the real ones on, in the order that makes the app most useful
soonest.

Two rules the codebase holds to, and you should hold to as well:

- **Anything named `EXPO_PUBLIC_*` is compiled into the app bundle.** Anyone
  who downloads the app can read it. Only publishable identifiers belong
  there.
- **Every real secret sits behind a server you run.** Strava's client
  secret, the model provider key and the Supabase service-role key are all
  server-side, and the app talks to your endpoint rather than the vendor.

## Find out where you already are

```
cd forge-fit
npm run doctor
```

It reads your `.env` files and prints, for each of the integrations below,
whether it is configured, not configured, or — the one that matters —
**half** configured. Nothing on this list breaks the app by being absent;
every one of them falls back to something usable and the report says what
that fallback is. What does break the app is having two of the three
variables an integration needs, because nothing degrades gracefully into
half a Strava connection. It just fails the moment somebody uses it.

The doctor never contacts any of these services. A key can be present and
wrong, and proving otherwise would need every one of them reachable from
wherever you happen to be running it. What it can tell you for certain is
what you have not filled in, and what you have filled in with
`your-project-here`.

It exits non-zero only for a half-configured integration or a leftover
placeholder, so it is safe to run in CI without failing every build that
has not configured AdMob.

---

## 1. Supabase — accounts, sync, account deletion

**Free. Do this one first: several things below depend on it.**

Create a project at supabase.com, then Project Settings → API:

| Variable | Where |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `anon` / publishable key |

Apply **every** migration in `supabase/migrations`, including `0003_social.sql`.
That one adds following, kudos, clubs and shared activities, and it is the
only place in this schema where one user can read another's row — so it is
worth reading before you run it. Health data is not reachable through it:
the public identity is a separate table with no health columns in it, and
`profiles` stays owner-only and untouched.

The anon key is *meant* to be public. What protects the data is Row Level
Security, which `supabase/migrations/0001_init.sql` sets up — every table
is keyed to `auth.uid()` so one account cannot read another's rows. Apply
it with `supabase db push`, then `0002_storage.sql` for progress photos.

Then deploy the delete-account function, which is what makes "delete my
account and everything in it" actually true:

```
supabase functions deploy delete-account
```

Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` into deployed functions for you. **The
service-role key bypasses Row Level Security entirely** — it must never
appear in the app, in a browser, or in any `EXPO_PUBLIC_*` variable.

### Google sign-in — no key in the app

Configured in the Supabase dashboard, not in `.env`.

1. Google Cloud Console → APIs & Services → Credentials → **OAuth client
   ID → Web application**. You need the *web* client even for a mobile
   app, because the app signs in through Supabase rather than through
   Google directly.
2. Authorised redirect URI:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. Paste the client ID and secret into Supabase → Authentication →
   Providers → Google.
4. Supabase → Authentication → URL Configuration → Redirect URLs, add:
   `forgefit://auth-callback`

The app uses the PKCE flow, so the callback arrives as `?code=` and is
exchanged for a session. `/settings/diagnostics` prints the exact
redirect URI this build sends, which is worth checking against step 4
rather than assuming.

### Apple sign-in — no key in the app either

1. Apple Developer → Certificates, Identifiers & Profiles → your App ID
   `com.forgefit.app` → enable **Sign In with Apple**.
2. Create a **Services ID** and a **Sign in with Apple key** (`.p8`).
3. Supabase → Authentication → Providers → Apple: Services ID, Team ID,
   Key ID, and the `.p8` contents.

On iOS the app uses the native button and sends Apple's identity token
straight to Supabase — nothing goes through a browser. Apple returns the
user's name **only on the very first authorization**, so the app captures
it then and writes it to the profile; there is no second chance short of
the user removing the app from their Apple ID settings.

**Both of these need a development build.** Apple Sign In and HealthKit
are native, so they cannot run in Expo Go:

```
npx expo prebuild && npx expo run:ios
```

---

## 2. Strava — runs and rides, imported

**Free.** https://www.strava.com/settings/api

| Variable | Where it goes | Value |
|---|---|---|
| `EXPO_PUBLIC_STRAVA_CLIENT_ID` | app bundle | Client ID (public — it appears in the authorize URL anyway) |
| `STRAVA_CLIENT_SECRET` | **server only** | Client Secret |
| `STRAVA_CLIENT_ID` | **server only** | the same Client ID |
| `EXPO_PUBLIC_STRAVA_EXCHANGE_URL` | app bundle | `https://<your-deployment>/api/strava/exchange` |
| `ALLOWED_ORIGINS` | server only, optional | comma-separated origins; blank means same-origin |

The exchange endpoint already exists in this repo at
`api/strava/exchange.mjs`, with `api/strava/refresh.mjs` alongside it for
token renewal. They are the only place the client secret lives. Set the
Authorization Callback Domain in Strava's settings to your deployment's
host.

---

## 3. Apple Health and Apple Watch — no keys at all

These need **entitlements, not credentials**, and `app.json` already
declares them: the HealthKit plugin, `com.apple.developer.healthkit`,
and background delivery. What you need to do is enable **HealthKit** on
the App ID in the Apple Developer portal, then build:

```
npx expo prebuild && npx expo run:ios
```

There is no simulator path here — HealthKit returns nothing useful in the
simulator and a Watch has to be a real paired Watch. `/settings/diagnostics`
calls each layer for real and reports which one is missing, rather than
guessing.

---

## 4. RevenueCat — subscriptions

**Free under ~$2.5k/month of tracked revenue.** app.revenuecat.com

| Variable | Where |
|---|---|
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | Project → API keys → Apple public SDK key |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | the Google Play public SDK key |

These are the *public* SDK keys — the secret key stays in the dashboard.
You will also need products configured in App Store Connect and Google
Play Console; RevenueCat's own setup guide covers that better than a
paragraph here can. Blank keys leave the paywall in mock mode, where
nothing is ever charged.

---

## 5. AdMob — the free tier's banners

**Free.** apps.admob.com

| Variable | Where |
|---|---|
| `EXPO_PUBLIC_ADMOB_IOS_BANNER` | the iOS banner **ad unit id** |
| `EXPO_PUBLIC_ADMOB_ANDROID_BANNER` | the Android banner ad unit id |

Unit ids, not the account id. Two constraints the app enforces and you
should not undo: **no ads during an active workout**, and **no health
data is ever used for targeting**. Blank ids render inert placeholders.

---

## 6. Your AI backend — the coach

The `server/` folder is a small Express app that holds the model key and
answers five routes: food estimates (including from a photo), coach
messages, generated workouts, the weekly review and the weight-trend
summary. The app talks to it; the app never holds a model key.

**To run it**, anywhere that runs Node 20+ — Render, Railway and Fly all
host this kind of app; check their current pricing:

```
cd server
npm install
npm start          # or set the host's start command to this
```

Then set `EXPO_PUBLIC_AI_API_URL` in the app to wherever it is running.
`npm test` in `server/` runs its tests without calling any model, so it
costs nothing.

**What it needs, on the server:**

- `ANTHROPIC_API_KEY` from console.anthropic.com. This is the only one that
  costs money, and the only one that does photo estimates. (`OPENAI_API_KEY`
  still works for the text routes if you prefer it.)
- `SUPABASE_JWT_SECRET` — below. Set it before anybody else uses the app.
- `TRUST_PROXY_HOPS=1` on Render, Railway, Fly or Heroku. It tells the
  server which address in `X-Forwarded-For` your host wrote, as opposed to
  one a caller made up. Without it, everyone who is not signed in shares a
  single rate-limit bucket: safe, but strict.
- `AI_MODEL`, optionally. Blank means `claude-opus-5-5`, Anthropic's current
  default. `claude-sonnet-5-5` costs half as much per token and is a
  reasonable fit for short structured answers like these — that is your
  call to make, which is why it is a setting rather than a default.

**What it will not do**, by design:

- Answer a dosing, sourcing, medical or injury question, or tell anybody
  about a compound. The app handles all of those on the phone and never
  sends them; the server only ever receives an *intent* like "push me" or
  "where am I weakest", never the athlete's own words.
- Pass off a failure as an answer. A bad key, a rate limit, an overloaded
  API or a refused request is a 503, and the app falls back to its
  on-device coach — which is rule-based and says so.
- Let one caller run up the bill. Every route has a daily budget per
  person, and there is a per-minute cap across all of them. The numbers are
  in `server/limits.mjs`. They live in memory, so they are per server
  process: run several copies and each one counts separately.

Blank `EXPO_PUBLIC_AI_API_URL` leaves the on-device coach running, which is
rule-based and tells the user so.

### Checking sessions — set this before you ship

Set `SUPABASE_URL` on that server (the same value as
`EXPO_PUBLIC_SUPABASE_URL`). It is how the backend checks that a session
was really issued by your Supabase project: it reads the project's public
signing keys from `/auth/v1/.well-known/jwks.json`, which is where newer
Supabase projects publish them.

If your project is on Supabase's older shared-secret keys, also set
`SUPABASE_JWT_SECRET` (Project Settings → API → JWT Settings). Setting the
secret alone is not enough on a newer project: its sessions are signed with
an asymmetric key, and a server that only knows the secret treats every one
of them as anonymous.

With neither, the backend cannot verify anything, so it believes nothing a
caller tells it about themselves: every request is anonymous, on the free
rate limit, bucketed by network address. That is a safe state and the
server prints a warning at startup saying it is in it — but it also means
no subscriber ever gets their higher limit.

The alternative, which this repo used to do, is worse than it sounds.
Trusting an unverified token means trusting the `sub` it claims, and `sub`
is what the rate limiter buckets on — so a caller could send a different
one on every request and never hit a limit at all. Trusting `tier` on top
of that meant anybody could write `"tier": "pro"` into an unsigned token
and help themselves to the thousand-a-day limit on your model bill. Both
are closed now, and `server/auth.test.mjs` is a set of tests that stay
closed.

One thing to watch if you add a `tier` claim: populate it from
`app_metadata`, never `user_metadata`. Supabase lets a user write their own
`user_metadata`, so a tier taken from there is a self-service upgrade, and
a correct signature over it does not help.

---

## 7. Open Wearables — Garmin, WHOOP, Oura and the rest

**Free and open source (MIT), and you run it.**
github.com/the-momentum/open-wearables

A self-hosted FastAPI service that puts a dozen device makers behind one
API with normalised data and webhooks. It is worth being precise about what
it does and does not save you:

- **It does not remove the developer accounts.** Garmin, WHOOP, Oura, Polar,
  Suunto, Fitbit, Withings and Strava each still issue a client ID and
  secret, and those go in *its* `.env` — `GARMIN_CLIENT_ID`,
  `WHOOP_CLIENT_SECRET` and so on. Some of those programmes have an approval
  step; WHOOP's in particular is not open to everyone.
- **It removes the work.** Eight OAuth flows, eight data mappings, eight sync
  loops and eight sets of API changes to keep up with become one client in
  this app. That is the part that would otherwise have taken months.
- **Nothing goes to a third party.** It runs on your machine with
  `docker compose up`, and your health data never leaves infrastructure you
  control. That is the reason to prefer it over a hosted aggregator.

| Variable | Where it goes |
|---|---|
| `EXPO_PUBLIC_OPEN_WEARABLES_SUMMARY_URL` | app bundle — `https://<your-deployment>/api/wearables/summary` |
| `OPEN_WEARABLES_URL` | **server only** — your Open Wearables deployment |
| `OPEN_WEARABLES_API_KEY` | **server only** — from its developer portal |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | **server only** — so the functions can ask Supabase who is calling |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** — the `/link` function writes the account link with it |

Apply `supabase/migrations/0004_wearable_links.sql` too. Nobody types an id
anywhere: the first time someone taps a device, the backend creates their
wearables profile, records which account it belongs to, and from then on
reads only that one — worked out from their session, never from anything
the app sends. Wearables therefore need a real Supabase account, not a
phone-only one.

The split is forced, not stylistic. Their SDK endpoint mints a user-scoped
token that looks like the thing a mobile app should use — but their summary
routes depend on `ApiKeyDep`, and `get_current_developer_optional` returns
`None` for any token carrying `scope: "sdk"`. So an SDK token is refused on
exactly the routes that hold the data, and the only credential those routes
accept is the master API key, which grants **every** user's data on the
deployment. That cannot go in a mobile bundle, so the reads are proxied.

I built the SDK-token version first and it would have returned 401 on every
call. Reading their auth code is what caught it.

It also closes two gaps this app had: **sleep stages**, which HealthKit
exposes but the adapter here does not read, and **WHOOP**, which has no
consumer API route at all.

---

## 8. USDA FoodData Central — the reference food database

**Free, and the key is free.** api.data.gov → a key in about a minute.

This is the US government's laboratory-analysed nutrient database, and it
is what Open Food Facts is worst at: OFF knows what is in a packet with a
barcode on it, FDC knows what is in a chicken breast. Searching foods in
the app queries it once you have this set.

| Variable | Where it goes |
|---|---|
| `EXPO_PUBLIC_USDA_FOOD_URL` | app bundle — `https://<your-deployment>/api/food/usda` |
| `USDA_FDC_API_KEY` | **server only** — from api.data.gov |

The split is forced, not stylistic. FDC rate limits **per key**, not per
user, so a key compiled into the app bundle would be one hourly allowance
shared by everybody — any single user could exhaust it for the rest, and
since anyone can unzip an app, strangers could spend it outright.

Blank and USDA search is simply off: the 128 bundled staples, your own
saved foods and barcode scanning all still work.

---

## 9. Photo food estimates — no new key

Attaching a photo to an AI estimate uses the same `EXPO_PUBLIC_AI_API_URL`
server as the coach (§6), which needs a route that accepts
`{ description?, imageBase64? }` and returns
`{ name, servingLabel, macros, confidence, note }`. Images are downscaled
to 1024px and JPEG-compressed before sending, because a phone frame is
3–8 MB and most vision pricing is per image.

With no AI server configured the app says plainly that it cannot look at
the photo, rather than returning a plausible-looking guess.

---

## 10. Gym search — optional

`EXPO_PUBLIC_GYM_API_URL` points at your own proxy for a points-of-interest
source (Overpass, Mapbox, Google Places — your choice; the credential
lives on the proxy). The app carries no maps key of its own. Blank, and
the Iron Map falls back to its bundled list.

---

## 11. Analytics — optional

`EXPO_PUBLIC_ANALYTICS_KEY`. Blank means events are logged to the console
in development and dropped in production. Health values are never sent as
event properties.

---

## Not needed at all

Worth saying explicitly, because these are the ones people expect to need:

- **A food database, to get started.** Open Food Facts needs no key and no
  account, and it is wired in: scan a barcode and the app looks it up, fills
  the form, and asks you to check it against the packet.
  `EXPO_PUBLIC_FOOD_LOOKUP=off` turns it off. USDA (§8) adds laboratory
  reference data for whole foods and does want a free key. Neither is a
  dependency — 128 staples ship with the app and anything they cannot find
  you type once.
- **Apple Health / Apple Watch** — entitlements, not credentials (§3).
- **Google or Apple sign-in** — configured in the Supabase dashboard,
  nothing in the app bundle (§1).
- **Oura, Garmin, Fitbit, Whoop, Polar, Suunto, Withings, Samsung** — no key
  goes in this app for any of them. Two routes: on iOS their data already
  arrives through Apple Health, and for everything else there is
  **Open Wearables** (§7), which is one integration instead of eight.

---

## The shortest useful path

1. Supabase URL + anon key, migrations applied → accounts and sync.
2. Strava client ID + secret on your server → runs and rides.
3. An Apple Developer account, then `eas build --profile development
   --platform ios` → HealthKit, which is the Watch, Garmin, sleep and every
   passive signal. **No Mac needed**: EAS compiles on Apple hardware in the
   cloud and installs to your iPhone over the air. `BUILDING.md` is the
   whole procedure.

That is three services, two of them free, and it lights up most of the
app. Everything after it is monetisation and polish.

Run `npm run doctor` after each step to see what it changed.

If you wear something that is not an Apple Watch, add Open Wearables (§7)
as a fourth. It is the only route to WHOOP at all, and the only one to
Garmin and Oura that does not mean writing each integration yourself.

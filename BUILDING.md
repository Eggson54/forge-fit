# Building ForgeFit without a Mac

Everything here runs on Windows or Linux. The iOS compile happens on Expo's
macOS build servers; you never touch Xcode.

What you need:

- **An Apple Developer Program membership**, $99/year. This one is genuinely
  unavoidable — it is what signs a build so it can be installed on a real
  iPhone, and there is no free path to that without Xcode on a Mac.
- **An Expo account**, free. expo.dev.
- **Your iPhone.** The things worth testing — HealthKit, Apple Sign In, the
  barcode scanner, background location, the Watch — do not exist in the
  Simulator in any useful form. There is no substitute for the device.
- **Your Apple Watch**, for the watch app.

---

## One-time setup

```bash
npm install -g eas-cli
cd mobile

eas login          # your Expo account
eas init           # creates the project, writes extra.eas.projectId into app.json
```

`eas init` is what fills in the project id that was deliberately left out of
`app.json` — a placeholder there produces a confusing "project not found"
rather than a useful error, so there isn't one.

Then register the phone you want to install on:

```bash
eas device:create
```

This prints a link (and a QR code). Open it **on the iPhone**, install the
profile it offers, and the device is registered against your Apple Developer
account. Builds made with the `development` or `preview` profile can then be
installed on it.

---

## Your Apple Team ID

Needed once, for the watch app. Find it at
[developer.apple.com/account](https://developer.apple.com/account) under
Membership — a ten-character string like `A1B2C3D4E5`.

Put it in `app.json`:

```json
{
  "expo": {
    "ios": {
      "appleTeamId": "A1B2C3D4E5"
    }
  }
}
```

Without it the watch target still builds, but signing it is fiddlier than it
needs to be.

---

## The three build profiles

| Profile | What it is | When |
|---|---|---|
| `development` | A dev client — the app plus a JS bundle loaded from your machine | Day-to-day work. Change JS, reload, no rebuild. |
| `preview` | A standalone build, installed directly | Handing it to someone, or checking a native change. |
| `production` | A store build | TestFlight and the App Store. |

### Day-to-day: the development build

Build it once:

```bash
eas build --profile development --platform ios
```

It takes 10–25 minutes and queues behind other people on the free tier. When
it finishes, EAS gives you a link — open it on the iPhone and install.

After that you do not rebuild for JavaScript changes:

```bash
npx expo start --dev-client
```

Scan the QR code with the phone. Every JS change reloads in seconds. You only
need a new build when native configuration changes — a new native package, a
permission string, an entitlement, anything in `app.json`'s `plugins`.

### Sharing it

```bash
eas build --profile preview --platform ios
```

Installs directly on any device registered with `eas device:create`. Good for
a handful of people.

### TestFlight and the App Store

```bash
eas build --profile production --platform ios
eas submit --platform ios --latest
```

`eas submit` uploads to App Store Connect. TestFlight distribution is then
done in App Store Connect in the browser — again, no Mac.

`appVersionSource: "remote"` in `eas.json` means EAS owns the build number and
increments it for you, so `app.json` does not need editing before every
submission.

---

## Android

Identical, minus the Apple account:

```bash
eas build --profile preview --platform android
```

That produces an APK you can sideload. The `production` profile produces an
`.aab` for Play.

---

## The watch app

`targets/watch/` holds a watchOS app, linked into the Xcode project at build
time by `@bacons/apple-targets`. It builds through EAS like everything else —
`eas build --profile development --platform ios` produces an iOS app with the
watch app embedded, and installing it on the phone offers to install the watch
app on the paired Watch.

**The honest caveat.** SwiftUI without Xcode means no previews, no simulator
and no debugger: a mistake shows up as a failed EAS build 15 minutes later,
with a compiler error in the log. That is a slow loop but a workable one for a
small app, and the watch app is deliberately small.

See `targets/watch/README.md` for what it does and how it talks to the phone.

---

## What it costs

- Apple Developer Program: **$99/year**, unavoidable.
- Expo: the free tier builds iOS, with a queue and a monthly build limit. Paid
  tiers buy priority and concurrency, not capability. Start free.
- Google Play, if you ship Android: **$25**, one-off.

---

## When something fails

`eas build:list` shows recent builds; each has a full log in the browser. The
useful ones:

- **"No suitable application records were found"** — the bundle identifier in
  `app.json` (`com.forgefit.app`) does not exist in App Store Connect yet.
  Create the app there first, or let `eas submit` create it.
- **Provisioning failures** — `eas credentials` walks through regenerating
  certificates and profiles. Letting EAS manage them is much easier than not.
- **A native build failure after adding a package** — nearly always a config
  plugin that needs a native rebuild. Rebuild the development profile rather
  than reloading JS.

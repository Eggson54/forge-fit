# Trying ForgeFit on your iPhone with Expo Go

Five minutes, free, no Apple Developer account, no Mac.

## What you need

- **Expo Go** from the App Store on your iPhone.
- **Node.js 20 or newer** on any computer — Windows is fine. nodejs.org, the
  LTS button.
- This repository on that computer.

## Once

```
cd mobile
npm install
```

## Every time

```
npm run phone
```

A QR code appears in the terminal. Open the **Camera** app on your iPhone,
point it at the code, and tap the banner. Expo Go opens and loads the app.
The first load takes a minute; after that it is quick.

If your phone and computer are on the same Wi-Fi, `npm run phone:wifi` is
faster. `npm run phone` goes through a tunnel, which works from anywhere
— different networks, a work laptop behind a firewall — at the cost of
speed.

## If the QR code opens the wrong thing

Use `npm run phone`, not `npx expo start`. This project includes
`expo-dev-client` for the full build, and with that installed a plain
`expo start` produces a QR code for a **development build** — which you do
not have — instead of for Expo Go. The scripts pass `--go` to force Expo Go.
That is the whole difference, and it is an easy one to trip over.

## If Expo Go says the project is incompatible

Expo Go only runs one SDK version at a time: whichever is newest. This
project is on SDK 57. If Expo Go on your phone is older, update it from the
App Store. If it is newer, this project needs upgrading — say so.

## What works in Expo Go, and what does not

Nearly everything: workouts, food logging, barcode scanning, recording a
route with GPS, privacy zones, route planning, challenges, photos, the
coach, progress, the journal, and exporting your data.

**Not in Expo Go**, because each needs native code Expo Go does not ship:

- **Apple Health** — so no Apple Watch data, no Garmin through Health, and
  the sleep score falls back to hours you type in.
- **The Apple Watch app.**

The app says so on the relevant screens rather than failing. For those you
need the real build, which is `BUILDING.md` — still no Mac, but it does need
the $99 Apple Developer account.

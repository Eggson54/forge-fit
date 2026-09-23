# The ForgeFit watch app

A watchOS app that records a workout on the wrist and saves it to Apple
Health. It is linked into the Xcode project at build time by
`@bacons/apple-targets`, so it builds through EAS like everything else and
never needs Xcode locally.

## What it does

Pick Run, Ride, Walk or Lift; it starts an `HKWorkoutSession`, shows elapsed
time, heart rate, active calories and distance, and on End writes the workout
to HealthKit.

## How it reaches the phone

**Through HealthKit, and only through HealthKit.** There is no
WatchConnectivity, no shared App Group and no message queue in this target.

That is the significant design decision here, so it is worth stating why.
WatchConnectivity is the part of a watch app that goes wrong: it is
asynchronous, it fails quietly when the phone is out of range or in Airplane
mode, and the failure shows up as a workout that never arrived, hours later,
with nothing to point at. HealthKit already syncs Watch to phone by itself,
the ForgeFit app already reads from it (`src/services/health.ts`), and it
works when the phone is at home on a charger — which is exactly when somebody
goes for a run with only a Watch.

So the data path is:

```
Watch app → HealthKit (on the Watch) → iCloud/device sync → HealthKit (on the phone) → ForgeFit
```

What that costs: the phone sees the workout when HealthKit gets round to
syncing rather than the instant End is pressed, and live numbers are not
mirrored to the phone mid-session. Neither matters for what this does. If a
later version needs live mirroring — a lifting session with set-by-set
feedback, say — that is the point at which WatchConnectivity earns its
complexity, and not before.

## Files

| File | What |
|---|---|
| `expo-target.config.js` | Target type, frameworks, entitlements, deployment target |
| `Info.plist` | `WKApplication`, Health usage strings, the `workout-processing` background mode |
| `ForgeFitWatchApp.swift` | `@main`, and the screen chosen from the session phase |
| `WorkoutManager.swift` | `HKWorkoutSession` + `HKLiveWorkoutBuilder` |
| `StartView.swift` | Activity picker |
| `SessionView.swift` | The mid-run screen and the controls page |

The bundle identifier, display name and companion-app identifier are supplied
as build settings by the config plugin and are deliberately **not** repeated
in `Info.plist` — two sources for one value is how they end up disagreeing.

## Building it

Nothing special:

```bash
eas build --profile development --platform ios
```

The iOS app comes out with the watch app embedded. Installing it on the phone
offers to install the watch app on the paired Watch.

Set `ios.appleTeamId` in `app.json` first — see `../../BUILDING.md`.

## This Swift has never been compiled

Worth being blunt about, because the rest of this repository is held to a
different standard.

Everything else here is verified before it is committed: the TypeScript is
type-checked, linted and unit-tested, and the screens are rendered in a
headless browser and looked at. None of that is possible for this target from
a Linux container — there is no Swift toolchain, and even with one there is no
watchOS SDK for it. So these six files are written against the HealthKit and
SwiftUI APIs as documented, and **the first EAS build is where they are
actually checked.**

Expect to fix a compile error or two on the first run. That is a deliberate
trade rather than an oversight: a Swift mistake fails loudly at build time
with a file and a line number, which is cheap. The thing this project has
refused to do is write against an API whose *responses* cannot be seen — a
wrong guess there produces plausible numbers that are silently incorrect, and
that is not cheap at all.

## Debugging without Xcode

The loop is slow — push, build, install, try it:

```bash
eas build --profile development --platform ios
eas build:list          # find it
```

Compiler errors appear in the build log in the browser, with file and line.

A crash on the Watch itself is harder: with no debugger attached, the useful
source is the phone's Settings → Privacy & Security → Analytics &
Improvements → Analytics Data, where crash logs from the paired Watch land
under `ForgeFitWatch-…`. They can be shared off the phone.

Keeping each change small is the main defence. A build that changes one thing
tells you what broke; a build that changes five does not.

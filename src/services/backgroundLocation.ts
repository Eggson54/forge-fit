import { Platform } from 'react-native';
import { isRunningInExpoGo, requireOptionalNativeModule } from 'expo';
import type { StreamFix } from './location';

/**
 * Recording that survives a locked screen.
 *
 * `watchPositionAsync` is foreground location: iOS stops delivering it the
 * moment the phone locks, which is the moment a runner puts it in a pocket.
 * app.json has declared the background location mode for a long time; nothing
 * used it. This does, through a TaskManager task — the one API iOS keeps
 * feeding while the app is off screen.
 *
 * Two traps, both of which have already cost a crash in this codebase:
 *
 * - expo-task-manager calls requireNativeModule('ExpoTaskManager') the
 *   moment it is loaded, and throws if the module is absent. A lazy require
 *   inside try/catch does not contain that: Metro's guardedLoadModule reports
 *   it as fatal before the catch runs. So the native half is looked for first,
 *   with requireOptionalNativeModule, which returns null instead of throwing.
 * - defineTask has to run when the bundle loads, not when a recording
 *   starts, because that is when iOS looks for it. This module is imported
 *   from the root layout for exactly that reason.
 *
 * Where background recording is not possible — Expo Go, a refused "Always"
 * permission, an Android build without the service — `start` says so and the
 * recorder falls back to foreground location with the screen held on.
 */

export const RECORDING_TASK = 'forgefit-route-recording';

type Batch = (fixes: StreamFix[]) => void;

interface NativeLocation {
  coords: { latitude: number; longitude: number; accuracy?: number | null; altitude?: number | null; speed?: number | null };
  timestamp?: number;
}

interface TaskManagerModule {
  defineTask: (name: string, task: (body: { data: unknown; error: { message: string } | null }) => void | Promise<void>) => void;
  isTaskDefined: (name: string) => boolean;
}

interface LocationModule {
  getBackgroundPermissionsAsync: () => Promise<{ granted: boolean; canAskAgain: boolean }>;
  requestBackgroundPermissionsAsync: () => Promise<{ granted: boolean; canAskAgain: boolean }>;
  startLocationUpdatesAsync: (name: string, options: Record<string, unknown>) => Promise<void>;
  stopLocationUpdatesAsync: (name: string) => Promise<void>;
  hasStartedLocationUpdatesAsync: (name: string) => Promise<boolean>;
  Accuracy: { BestForNavigation: number };
  ActivityType: { Fitness: number };
}

let listener: Batch | null = null;

const toFix = (l: NativeLocation): StreamFix => ({
  lat: l.coords.latitude,
  lon: l.coords.longitude,
  t: l.timestamp ?? Date.now(),
  accuracyMeters: l.coords.accuracy ?? null,
  altitudeMeters: l.coords.altitude ?? null,
  speedMs: l.coords.speed ?? null,
});

function loadTaskManager(): TaskManagerModule | null {
  if (Platform.OS === 'web') return null;
  if (!requireOptionalNativeModule('ExpoTaskManager')) return null;
  // Only reached once the native module is known to exist, so this cannot
  // throw for the reason described above.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-task-manager') as TaskManagerModule;
}

function loadLocation(): LocationModule | null {
  if (!requireOptionalNativeModule('ExpoLocation')) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-location') as LocationModule;
}

const TaskManager = loadTaskManager();

// At module scope, deliberately. See the note above.
if (TaskManager && !TaskManager.isTaskDefined(RECORDING_TASK)) {
  TaskManager.defineTask(RECORDING_TASK, ({ data, error }) => {
    if (error) return;
    const locations = (data as { locations?: NativeLocation[] } | null)?.locations ?? [];
    if (locations.length === 0) return;
    if (listener) {
      listener(locations.map(toFix));
      return;
    }
    // Updates with nobody listening: the recording that asked for them is
    // gone. Stopping them is better than running the GPS flat out for no
    // one — that is a battery drained overnight by a run that ended at six.
    void stopBackgroundRecording();
  });
}

export type BackgroundStart =
  | { mode: 'background' }
  | { mode: 'screen-on'; reason: 'expo-go' | 'declined' | 'unsupported' };

/**
 * Start background updates, or say why not.
 *
 * Asks for "Always" only here, at the moment somebody has pressed record —
 * which is the one moment the reason for asking is obvious to them.
 */
export async function startBackgroundRecording(onBatch: Batch): Promise<BackgroundStart> {
  // Expo Go ships the modules but not the background mode in its own
  // Info.plist, so asking for "Always" there would be a permission prompt
  // for something that then fails.
  if (isRunningInExpoGo()) return { mode: 'screen-on', reason: 'expo-go' };
  if (!TaskManager) return { mode: 'screen-on', reason: 'unsupported' };
  const Location = loadLocation();
  if (!Location) return { mode: 'screen-on', reason: 'unsupported' };

  try {
    let permission = await Location.getBackgroundPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await Location.requestBackgroundPermissionsAsync();
    }
    if (!permission.granted) return { mode: 'screen-on', reason: 'declined' };

    listener = onBatch;
    await Location.startLocationUpdatesAsync(RECORDING_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1000,
      distanceInterval: 0,
      // Tells iOS this is a workout, which changes how it filters and when
      // it would otherwise decide the phone has stopped moving.
      activityType: Location.ActivityType.Fitness,
      // iOS will otherwise pause updates at a red light and not always
      // resume them. Auto-pause is done here, by the app, where it is tested.
      pausesUpdatesAutomatically: false,
      // The blue pill in the status bar: honest about the GPS being on.
      showsBackgroundLocationIndicator: true,
      // Android requires a visible notification for this, and it is the
      // right thing to show anyway.
      foregroundService: {
        notificationTitle: 'Recording your route',
        notificationBody: 'ForgeFit is tracking distance and pace.',
      },
    });
    return { mode: 'background' };
  } catch {
    listener = null;
    return { mode: 'screen-on', reason: 'unsupported' };
  }
}

export async function stopBackgroundRecording(): Promise<void> {
  listener = null;
  const Location = loadLocation();
  if (!Location) return;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(RECORDING_TASK)) {
      await Location.stopLocationUpdatesAsync(RECORDING_TASK);
    }
  } catch {
    /* Already stopped, or never started. */
  }
}

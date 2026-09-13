import { Platform, Share } from 'react-native';
import { useGamificationStore } from '../stores/useGamificationStore';
import { useLogStore } from '../stores/useLogStore';
import { useProfileStore } from '../stores/useProfileStore';
import { useProtocolStore } from '../stores/useProtocolStore';
import { useReminderStore } from '../stores/useReminderStore';
import { useWorkoutStore } from '../stores/useWorkoutStore';

/** Collect all user data into a single JSON object (portable export). */
export function collectUserData(): Record<string, unknown> {
  return {
    exportedAt: new Date().toISOString(),
    app: 'ForgeFit',
    version: 1,
    profile: useProfileStore.getState().profile,
    targets: useProfileStore.getState().targets,
    coach: useProfileStore.getState().coach,
    logs: {
      nutrition: useLogStore.getState().nutrition,
      water: useLogStore.getState().water,
      weight: useLogStore.getState().weight,
      sleep: useLogStore.getState().sleep,
      steps: useLogStore.getState().steps,
      measurements: useLogStore.getState().measurements,
      // Photo URIs are device-local; we export references, not image bytes.
      photos: useLogStore.getState().photos.map((p) => ({ ...p, uri: '[local]' })),
    },
    workouts: useWorkoutStore.getState().workouts,
    customExercises: useWorkoutStore.getState().customExercises,
    reminders: useReminderStore.getState().reminders,
    protocols: useProtocolStore.getState().protocols,
    protocolLogs: useProtocolStore.getState().logs,
    gamification: {
      streaks: useGamificationStore.getState().streaks,
      achievements: useGamificationStore.getState().achievements.filter((a) => a.unlockedAt),
    },
  };
}

/** Share/export the user's data. Returns true if the OS share sheet handled it. */
export async function exportUserData(): Promise<boolean> {
  const json = JSON.stringify(collectUserData(), null, 2);
  try {
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-console
      console.log('ForgeFit export:\n', json);
      return false;
    }
    await Share.share({ title: 'ForgeFit data export', message: json });
    return true;
  } catch {
    return false;
  }
}

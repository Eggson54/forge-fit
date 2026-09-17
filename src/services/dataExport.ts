import { Platform, Share } from 'react-native';
import { useCoachStore } from '../stores/useCoachStore';
import { useGamificationStore } from '../stores/useGamificationStore';
import { useGymStore } from '../stores/useGymStore';
import { useIntegrationStore } from '../stores/useIntegrationStore';
import { useLogStore } from '../stores/useLogStore';
import { useProfileStore } from '../stores/useProfileStore';
import { useProgramStore } from '../stores/useProgramStore';
import { useProtocolStore } from '../stores/useProtocolStore';
import { useReminderStore } from '../stores/useReminderStore';
import { useRoutineStore } from '../stores/useRoutineStore';
import { useWorkoutStore } from '../stores/useWorkoutStore';
import { buildExport, exportFilename, type ExportDocument } from '../domain/exportShape';

/** Read every store and assemble the portable export document. */
export function collectUserData(): ExportDocument {
  const profile = useProfileStore.getState();
  const logs = useLogStore.getState();
  const workouts = useWorkoutStore.getState();
  const gamification = useGamificationStore.getState();
  const integrations = useIntegrationStore.getState();

  return buildExport({
    profile: {
      profile: profile.profile,
      targets: profile.targets,
      coachSettings: profile.coach,
      disciplineWeights: profile.disciplineWeights,
      subscription: profile.subscription,
    },
    logs: {
      nutrition: logs.nutrition,
      water: logs.water,
      weight: logs.weight,
      sleep: logs.sleep,
      steps: logs.steps,
      measurements: logs.measurements,
      savedMeals: logs.savedMeals,
      // Photo bytes live on the device; exporting references keeps the file a
      // readable document rather than tens of megabytes of base64.
      photos: logs.photos.map((p) => ({ ...p, uri: '[stored on device]' })),
    },
    workouts: {
      workouts: workouts.workouts,
      customExercises: workouts.customExercises,
      personalRecords: workouts.prs,
    },
    gamification: {
      streaks: gamification.streaks,
      bestDisciplineScore: gamification.bestDisciplineScore,
      achievements: gamification.achievements.filter((a) => a.unlockedAt),
    },
    reminders: useReminderStore.getState().reminders,
    protocols: {
      protocols: useProtocolStore.getState().protocols,
      logs: useProtocolStore.getState().logs,
    },
    coach: { conversation: useCoachStore.getState().turns },
    programs: { enrolment: useProgramStore.getState().enrolment },
    routines: useRoutineStore.getState().routines,
    gyms: {
      // The claims carry their own venue snapshot, so the export stays a
      // complete record of the collection on its own.
      claims: useGymStore.getState().claims,
    },
    integrations: {
      appleWatchConnected: integrations.appleWatchConnected,
      stravaConnected: integrations.stravaConnected,
      stravaAthlete: integrations.stravaAthlete,
      activities: integrations.activities,
    },
  });
}

/**
 * Share or download the user's data. Returns true if the platform handled it.
 *
 * On web this produces an actual file rather than logging to a console the user
 * cannot see — an export nobody can retrieve is not an export.
 */
export { exportFilename };

export async function exportUserData(): Promise<boolean> {
  const json = JSON.stringify(collectUserData(), null, 2);
  try {
    if (Platform.OS === 'web') {
      return downloadOnWeb(json, exportFilename());
    }
    await Share.share({ title: 'ForgeFit data export', message: json });
    return true;
  } catch {
    return false;
  }
}

function downloadOnWeb(json: string, filename: string): boolean {
  // Guarded because this also runs under SSR and in tests, where there is no
  // document to hang an anchor off.
  const doc = typeof document === 'undefined' ? null : document;
  if (!doc || typeof URL?.createObjectURL !== 'function') return false;

  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = doc.createElement('a');
  link.href = url;
  link.download = filename;
  doc.body.appendChild(link);
  link.click();
  doc.body.removeChild(link);
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

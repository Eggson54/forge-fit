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
import { buildCsv, csvFilename } from '../domain/csv';
import { setKind } from '../domain/sets';
import { MEASUREMENT_SITES } from '../domain/measurements';

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
      kits: useGymStore.getState().kits,
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

/**
 * The same records as a spreadsheet.
 *
 * Only the tables a person would actually open in Excel — sets, food, weight,
 * measurements, gym claims. A CSV of the coach conversation or the integration
 * flags would be columns nobody reads, and JSON already carries everything for
 * a restore.
 */
export function collectCsv(): string {
  const logs = useLogStore.getState();
  const workouts = useWorkoutStore.getState();
  const gyms = useGymStore.getState();
  const gymsById = gyms.gymsById();

  const setRows: unknown[][] = [];
  for (const w of workouts.workouts) {
    if (w.status !== 'completed') continue;
    for (const ex of w.exercises) {
      ex.sets.forEach((s, i) => {
        setRows.push([
          w.date,
          w.name,
          w.gym?.name ?? '',
          w.effort ?? '',
          ex.name,
          i + 1,
          setKind(s),
          s.weightKg ?? '',
          s.reps ?? '',
          s.rpe ?? '',
          s.completed ? 'yes' : 'no',
          s.isPr ? 'yes' : '',
          ex.notes ?? '',
        ]);
      });
    }
  }

  return buildCsv([
    {
      name: 'Sets',
      headers: [
        'date', 'workout', 'gym', 'session effort', 'exercise', 'set',
        'kind', 'weight kg', 'reps', 'rpe', 'completed', 'pr', 'exercise note',
      ],
      rows: setRows,
    },
    {
      name: 'Food',
      headers: ['date', 'meal', 'item', 'servings', 'serving', 'calories', 'protein g', 'carbs g', 'fat g', 'estimate'],
      rows: logs.nutrition.map((n) => [
        n.date, n.slot, n.name, n.quantity, n.servingLabel,
        n.macros.calories, n.macros.proteinG, n.macros.carbsG, n.macros.fatG,
        n.isEstimate ? 'yes' : 'no',
      ]),
    },
    { name: 'Weight', headers: ['date', 'weight kg'], rows: logs.weight.map((w) => [w.date, w.weightKg]) },
    { name: 'Water', headers: ['date', 'ounces'], rows: logs.water.map((w) => [w.date, w.amountOz]) },
    { name: 'Sleep', headers: ['date', 'minutes', 'quality'], rows: logs.sleep.map((s) => [s.date, s.minutes, s.quality ?? '']) },
    { name: 'Steps', headers: ['date', 'steps', 'source'], rows: logs.steps.map((s) => [s.date, s.steps, s.source]) },
    {
      // One row per date with a column per site, matching how the log is
      // stored and how a spreadsheet wants to chart it.
      name: 'Measurements',
      headers: ['date', ...MEASUREMENT_SITES.map((site) => `${site.label.toLowerCase()} cm`)],
      rows: logs.measurements.map((m) => [
        m.date,
        ...MEASUREMENT_SITES.map((site) => m[site.key] ?? ""),
      ]),
    },
    {
      name: 'Gyms',
      headers: ['gym', 'claimed', 'visits', 'points'],
      rows: gyms.claims.map((c) => [
        gymsById[c.gymId]?.name ?? c.gymId,
        c.claimedAt.slice(0, 10),
        c.visits.length,
        c.pointsEarned,
      ]),
    },
  ]);
}

export async function exportUserCsv(): Promise<boolean> {
  const csv = collectCsv();
  if (!csv) return false;
  try {
    if (Platform.OS === 'web') {
      return downloadOnWeb(csv, csvFilename(), 'text/csv');
    }
    await Share.share({ title: 'ForgeFit CSV export', message: csv });
    return true;
  } catch {
    return false;
  }
}

function downloadOnWeb(json: string, filename: string, mime = 'application/json'): boolean {
  // Guarded because this also runs under SSR and in tests, where there is no
  // document to hang an anchor off.
  const doc = typeof document === 'undefined' ? null : document;
  if (!doc || typeof URL?.createObjectURL !== 'function') return false;

  const url = URL.createObjectURL(new Blob([json], { type: mime }));
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

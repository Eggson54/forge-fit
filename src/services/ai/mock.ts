import { answerCoachQuestion, weeklyReviewSummary } from '../../domain/coach';
import { routeCoachRequest } from '../../domain/coachRouting';
import { sanitizeMacros } from '../../domain/nutrition';
import { EXERCISE_LIBRARY } from '../../data/exercises';
import { FOOD_DB } from '../../data/foods';
import type { Equipment, MuscleGroup } from '../../domain/types';
import { displayWeight, groupThousands } from '../../domain/units';
import type {
  AIService,
  CoachMessageRequest,
  CoachMessageResult,
  FoodAnalysisRequest,
  FoodAnalysisResult,
  ProgressAnalysisRequest,
  ProgressAnalysisResult,
  WeeklyReviewRequest,
  WeeklyReviewResult,
  WorkoutGenRequest,
  WorkoutGenResult,
} from './types';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Deterministic, on-device AI implementation. Produces realistic structured
 * output using the local exercise/food data and the domain logic, so every AI
 * flow is testable with no backend. The real backend (client.ts) implements the
 * same interface.
 */
export class MockAIService implements AIService {
  readonly isMock = true;

  async analyzeFood(req: FoodAnalysisRequest): Promise<FoodAnalysisResult> {
    await delay(700);
    const desc = (req.description ?? '').toLowerCase();
    const match = FOOD_DB.find((f) => desc && f.name.toLowerCase().includes(desc.split(' ')[0] ?? ''));
    const base = match ?? FOOD_DB.find((f) => f.id === 'burrito_bowl')!;
    const { macros } = sanitizeMacros(base);

    // The mock has no vision model behind it and must not imply otherwise. An
    // image with no description is a request this mock genuinely cannot
    // answer, so it says so and returns its lowest confidence rather than
    // handing back a burrito bowl that looks like it was recognised.
    const blind = Boolean(req.imageBase64) && !desc;

    return {
      name: match ? match.name : req.description?.trim() || 'Estimated meal',
      servingLabel: base.servingLabel,
      macros,
      confidence: blind || !match ? 'low' : 'medium',
      isEstimate: true,
      note: blind
        ? 'No AI server is configured, so this build cannot actually look at the photo. These numbers are a placeholder — type what the meal was, or enter the macros yourself.'
        : 'This is an estimate. Tap any value to correct it before saving.',
    };
  }

  async generateWorkout(req: WorkoutGenRequest): Promise<WorkoutGenResult> {
    await delay(900);
    const focus: MuscleGroup[] = req.focus?.length ? req.focus : defaultFocus(req.goal === 'lose_fat');
    const equip = new Set<Equipment>(req.equipment.length ? req.equipment : ['bodyweight']);
    const usable = EXERCISE_LIBRARY.filter(
      (e) => equip.has(e.equipment) || equip.has('full_gym') || e.equipment === 'bodyweight',
    );

    const picks = focus
      .flatMap((m) => usable.filter((e) => e.primaryMuscle === m || e.secondaryMuscles.includes(m)))
      .filter((e, i, arr) => arr.findIndex((x) => x.id === e.id) === i);

    // Fit the session to the requested duration (~ 6 min per exercise incl. rest).
    const count = Math.max(3, Math.min(8, Math.round(req.durationMinutes / 8)));
    const compoundsFirst = picks.sort((a, b) => (a.category === 'compound' ? -1 : 1)).slice(0, count);

    const repRange: [number, number] = req.goal === 'build_muscle' ? [8, 12] : req.goal === 'athletic_performance' ? [3, 6] : [10, 15];
    const sets = req.experience === 'beginner' ? 3 : 4;

    return {
      name: `${focus.map(cap).join(' + ')}`,
      focus,
      estimatedMinutes: compoundsFirst.length * 8,
      exercises: compoundsFirst.map((e) => ({
        exerciseId: e.id,
        name: e.name,
        primaryMuscle: e.primaryMuscle,
        sets,
        reps: repRange,
        restSeconds: e.category === 'compound' ? 150 : 75,
      })),
      note: 'Generated from your equipment and goal. Adjust freely — this is a starting point, not a prescription.',
    };
  }

  async coachMessage(req: CoachMessageRequest): Promise<CoachMessageResult> {
    await delay(250);
    // Routing is shared with the server client, so refusals and computed
    // answers are identical whichever one is in use. See coachRouting.
    const route = routeCoachRequest(req);
    if (route.kind === 'answered') return route.result;
    const m = answerCoachQuestion(req.context, req.settings, route.intent);
    return { text: m.text, tone: m.tone };
  }

  async weeklyReview(req: WeeklyReviewRequest): Promise<WeeklyReviewResult> {
    await delay(600);
    const s = req.stats;
    return {
      summary: weeklyReviewSummary(s, req.settings),
      // The screen already shows every raw number as a tile, so the highlights
      // say what each one means rather than repeating it.
      highlights: weeklyHighlights(s),
      focusNextWeek:
        s.avgWaterOz < s.waterTargetOz * 0.9
          ? 'Hydration was your weakest link — make water the first win each morning.'
          : s.workoutsCompleted < s.workoutsPlanned
            ? 'Protect your training days on the calendar and treat them as non-negotiable.'
            : 'Keep the momentum — add a small progression to your main lifts.',
    };
  }

  async analyzeProgress(req: ProgressAnalysisRequest): Promise<ProgressAnalysisResult> {
    await delay(400);
    const series = req.weightSeriesKg;
    if (series.length < 2) {
      return { trend: 'flat', weeklyRateKg: 0, summary: 'Log a few more weigh-ins to see your trend.', onTrack: true };
    }
    const first = series[0]!;
    const last = series[series.length - 1]!;
    const days = Math.max(1, (Date.parse(last.date) - Date.parse(first.date)) / 86_400_000);
    const weeklyRateKg = ((last.value - first.value) / days) * 7;
    const trend = weeklyRateKg > 0.1 ? 'up' : weeklyRateKg < -0.1 ? 'down' : 'flat';
    const losing = req.goal === 'lose_fat';
    const gaining = req.goal === 'build_muscle' || req.goal === 'gain_weight';
    const onTrack = losing ? weeklyRateKg < 0 : gaining ? weeklyRateKg > 0 : Math.abs(weeklyRateKg) < 0.3;
    const rate = displayWeight(Math.abs(weeklyRateKg), req.units);
    return {
      trend,
      weeklyRateKg: Math.round(weeklyRateKg * 100) / 100,
      onTrack,
      summary: `You're ${trend === 'flat' ? 'holding steady' : trend === 'down' ? 'trending down' : 'trending up'} at about ${rate.value} ${rate.unit}/week. ${
        onTrack ? "That's aligned with your goal." : 'Consider adjusting intake or activity to match your goal.'
      }`,
    };
  }
}

function defaultFocus(cutting: boolean): MuscleGroup[] {
  return cutting ? ['full_body'] : ['chest', 'triceps'];
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Comparative read of the week: each line adds something the tiles do not show. */
function weeklyHighlights(s: WeeklyReviewRequest['stats']): string[] {
  const out: string[] = [];

  const missed = s.workoutsPlanned - s.workoutsCompleted;
  out.push(
    missed <= 0
      ? `Hit all ${s.workoutsPlanned} planned sessions.`
      : `Missed ${missed} of ${s.workoutsPlanned} planned sessions.`,
  );

  const proteinPct = s.proteinTargetG > 0 ? Math.round((s.avgProteinG / s.proteinTargetG) * 100) : 0;
  out.push(
    proteinPct >= 95
      ? `Protein averaged ${proteinPct}% of target — dialled in.`
      : `Protein averaged ${proteinPct}% of target, about ${Math.max(0, Math.round(s.proteinTargetG - s.avgProteinG))}g short a day.`,
  );

  const waterPct = s.waterTargetOz > 0 ? Math.round((s.avgWaterOz / s.waterTargetOz) * 100) : 0;
  out.push(waterPct >= 90 ? `Hydration held at ${waterPct}% of target.` : `Hydration slipped to ${waterPct}% of target.`);

  if (s.avgSteps > 0) {
    out.push(
      s.avgSteps >= 10000
        ? `Averaged ${groupThousands(Math.round(s.avgSteps))} steps a day outside training.`
        : `Daily steps averaged ${groupThousands(Math.round(s.avgSteps))} — room to move more on rest days.`,
    );
  }

  // Conditioning gets a line whether or not any was logged: a zero here is the
  // finding, not an absence of one.
  out.push(
    s.cardioSessions === 0
      ? 'No conditioning logged — the one thing a barbell does not cover.'
      : `${Math.round(s.cardioMinutes)} minutes of conditioning across ${s.cardioSessions} ${
          s.cardioSessions === 1 ? 'session' : 'sessions'
        }.`,
  );

  if (Math.abs(s.strengthChangePct) >= 0.5) {
    out.push(
      s.strengthChangePct > 0
        ? `Estimated strength is up ${s.strengthChangePct.toFixed(1)}% week over week.`
        : `Estimated strength is down ${Math.abs(s.strengthChangePct).toFixed(1)}% — watch recovery.`,
    );
  } else {
    out.push('Strength held steady week over week.');
  }

  return out;
}

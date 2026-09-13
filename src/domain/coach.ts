import type { CoachPersonality, CoachSettings } from './types';

/**
 * On-device coach message engine.
 *
 * This is the deterministic fallback that runs with zero network and also
 * defines the SAFETY envelope the server AI must stay within. Rules:
 *  - Never hate speech, threats, slurs, or body-shaming.
 *  - Aggression is a stylistic dial, never abuse.
 *  - If the user disables aggressive language, savage/no_mercy are softened.
 */

export interface CoachContext {
  disciplineScore: number; // 0-100 today
  dailyStreak: number;
  workoutPlanned: boolean;
  workoutCompleted: boolean;
  proteinRemainingG: number;
  waterRemainingOz: number;
  stepsRemaining: number;
  missedWorkoutsThisWeek: number;
  hoursIdleSinceWake?: number;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
}

export interface CoachMessage {
  text: string;
  tone: 'praise' | 'nudge' | 'push' | 'reflect';
  personality: CoachPersonality;
}

type Phrasing = Record<CoachPersonality, string>;

/** Pick phrasing for the personality, honoring the "no aggressive language" flag. */
function phrase(p: Phrasing, settings: CoachSettings): string {
  const effective: CoachPersonality =
    !settings.allowAggressiveLanguage && (settings.personality === 'savage' || settings.personality === 'no_mercy')
      ? 'motivational'
      : settings.personality;
  return p[effective];
}

/**
 * Choose the most relevant coaching message for the current context.
 * Priority: celebrate strong days, then address the single biggest gap.
 */
export function selectCoachMessage(ctx: CoachContext, settings: CoachSettings): CoachMessage {
  if (!settings.enabled) {
    return { text: 'Coach is off. Turn it on in Settings when you want accountability.', tone: 'reflect', personality: settings.personality };
  }

  const p = settings.personality;

  // 1. Repeated missed workouts — reflective, never shaming.
  if (ctx.missedWorkoutsThisWeek >= 3) {
    return {
      personality: p,
      tone: 'reflect',
      text: phrase(
        {
          friendly: `You've missed ${ctx.missedWorkoutsThisWeek} workouts this week. No guilt — let's figure out what's actually getting in the way.`,
          motivational: `${ctx.missedWorkoutsThisWeek} missed workouts this week. Let's reset today and rebuild the habit, one session.`,
          savage: `You've skipped ${ctx.missedWorkoutsThisWeek} workouts this week. Excuses are stacking up faster than plates. What's the real blocker?`,
          no_mercy: `${ctx.missedWorkoutsThisWeek} missed workouts. That's a pattern, not bad luck. Decide right now that today is different.`,
        },
        settings,
      ),
    };
  }

  // 2. Big win — full day handled.
  if (ctx.disciplineScore >= 90 && (!ctx.workoutPlanned || ctx.workoutCompleted)) {
    return {
      personality: p,
      tone: 'praise',
      text: phrase(
        {
          friendly: `Outstanding day — ${ctx.disciplineScore}% discipline. You should feel good about this.`,
          motivational: ctx.dailyStreak > 1 ? `${ctx.dailyStreak} straight days. Keep the streak alive.` : `${ctx.disciplineScore}% today. This is what consistency looks like.`,
          savage: `${ctx.disciplineScore}%. Now that's a day. Don't get comfortable — do it again tomorrow.`,
          no_mercy: `${ctx.disciplineScore}% and the work's done. Good. This is the standard now, not the exception.`,
        },
        settings,
      ),
    };
  }

  // 3. Workout still pending.
  if (ctx.workoutPlanned && !ctx.workoutCompleted) {
    const idle = ctx.hoursIdleSinceWake && ctx.hoursIdleSinceWake >= 6;
    return {
      personality: p,
      tone: 'push',
      text: phrase(
        {
          friendly: `Your workout is still waiting. Even 20 focused minutes counts — want to start?`,
          motivational: `Nutrition's on track. Now go finish the workout and make it a complete day.`,
          savage: idle
            ? `You've had enough time to scroll your phone. Get your workout done.`
            : `The workout won't do itself. Warm up and get after it.`,
          no_mercy: idle
            ? `Hours gone, workout untouched. Stop negotiating with yourself and start.`
            : `Planned workout, zero sets logged. Fix that now.`,
        },
        settings,
      ),
    };
  }

  // 4. Protein short.
  if (ctx.proteinRemainingG > 25) {
    return {
      personality: p,
      tone: 'nudge',
      text: phrase(
        {
          friendly: `You're ${ctx.proteinRemainingG}g short on protein. A shake or some chicken would close the gap.`,
          motivational: `${ctx.proteinRemainingG}g of protein to go. Muscle is built in the details — hit your number.`,
          savage: `${ctx.proteinRemainingG}g short on protein. That's not "close enough." Go eat.`,
          no_mercy: `Protein's ${ctx.proteinRemainingG}g under. You know the target. Close it before bed.`,
        },
        settings,
      ),
    };
  }

  // 5. Hydration.
  if (ctx.waterRemainingOz > 24) {
    return {
      personality: p,
      tone: 'nudge',
      text: phrase(
        {
          friendly: `${ctx.waterRemainingOz} oz of water left today. Grab a glass now.`,
          motivational: `Hydration's your easy win — ${ctx.waterRemainingOz} oz to go. Knock it out.`,
          savage: `${ctx.waterRemainingOz} oz behind on water. This one's free. No excuse.`,
          no_mercy: `You're ${ctx.waterRemainingOz} oz down on water. Drink. Now.`,
        },
        settings,
      ),
    };
  }

  // 6. Default nudge based on time of day.
  return {
    personality: p,
    tone: 'nudge',
    text: phrase(
      {
        friendly: `You're doing the work. Keep chipping away today.`,
        motivational: `Small wins compound. Pick your next one and go.`,
        savage: `Decent so far. "Decent" isn't the goal though, is it?`,
        no_mercy: `Average effort gets average results. Raise the floor today.`,
      },
      settings,
    ),
  };
}

/**
 * Compose a weekly review narrative from aggregate stats. Deterministic; the
 * server AI can replace the summary sentence with a richer one.
 */
export interface WeeklyStats {
  workoutsCompleted: number;
  workoutsPlanned: number;
  avgProteinG: number;
  proteinTargetG: number;
  avgCalories: number;
  avgSteps: number;
  weightChangeKg: number;
  strengthChangePct: number;
  avgWaterOz: number;
  waterTargetOz: number;
}

export function weeklyReviewSummary(s: WeeklyStats, settings: CoachSettings): string {
  const strong: string[] = [];
  const weak: string[] = [];

  if (s.workoutsCompleted >= s.workoutsPlanned && s.workoutsPlanned > 0) strong.push('workout consistency');
  else if (s.workoutsPlanned - s.workoutsCompleted >= 2) weak.push('workout attendance');

  if (s.avgProteinG >= s.proteinTargetG * 0.95) strong.push('protein intake');
  else weak.push('protein');

  if (s.avgWaterOz >= s.waterTargetOz * 0.9) strong.push('hydration');
  else weak.push('hydration');

  const strongPart = strong.length ? `Your strongest area was ${strong[0]}` : 'You showed up';
  const weakPart = weak.length ? `, while ${weak[0]} needs attention next week.` : '.';

  const tone =
    settings.enabled && (settings.personality === 'savage' || settings.personality === 'no_mercy') && settings.allowAggressiveLanguage
      ? ' No coasting — raise the standard.'
      : ' Keep building.';

  return `${strongPart}${weakPart}${tone}`;
}

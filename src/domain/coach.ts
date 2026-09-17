import type { CoachPersonality, CoachSettings } from './types';
import { groupThousands } from './units';

/**
 * On-device coach message engine.
 *
 * This is the deterministic fallback that runs with zero network and also
 * defines the SAFETY envelope the server AI must stay within. Rules:
 *  - Never hate speech, threats, slurs, or body-shaming.
 *  - Aggression is a stylistic dial, never abuse.
 *  - If the user disables aggressive language, savage/no_mercy are softened.
 */

/**
 * Personalities that require Pro. Kept here rather than in the settings screen
 * so the gate and the runtime fallback cannot drift apart.
 */
export const PRO_PERSONALITIES: readonly CoachPersonality[] = ['savage', 'no_mercy'];

/** The free personality a gated one falls back to when Pro is not active. */
export const FALLBACK_PERSONALITY: CoachPersonality = 'motivational';

export function isProPersonality(p: CoachPersonality): boolean {
  return PRO_PERSONALITIES.includes(p);
}

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

/**
 * What the athlete actually asked. Without this every question collapsed to the
 * same branch of the priority cascade, so the coach answered "where am I
 * slacking?" and "what's my next win?" with identical text.
 *
 * The screen previously faked variety by inflating the numbers it passed in —
 * telling the engine the athlete had 30g more protein left than they did, to
 * steer it. An intent is the honest version of that: the context stays true and
 * the question decides which part of it to answer.
 */
export type CoachIntent = 'daily' | 'weakest' | 'push' | 'next_win' | 'on_track';

export interface CoachGap {
  key: 'workout' | 'protein' | 'water' | 'steps';
  label: string;
  /** Remaining amount, in that gap's own units. */
  remaining: number;
  text: string;
}

/**
 * Everything still open today, biggest first. Training outranks the rest: a
 * missed session cannot be made up with a glass of water.
 */
export function openGaps(ctx: CoachContext): CoachGap[] {
  const gaps: CoachGap[] = [];
  if (ctx.workoutPlanned && !ctx.workoutCompleted) {
    gaps.push({ key: 'workout', label: 'Training', remaining: 1, text: 'your workout is still unlogged' });
  }
  if (ctx.proteinRemainingG > 0) {
    gaps.push({ key: 'protein', label: 'Protein', remaining: ctx.proteinRemainingG, text: `${Math.round(ctx.proteinRemainingG)}g of protein to go` });
  }
  if (ctx.stepsRemaining > 0) {
    gaps.push({ key: 'steps', label: 'Steps', remaining: ctx.stepsRemaining, text: `${groupThousands(Math.round(ctx.stepsRemaining))} steps short` });
  }
  if (ctx.waterRemainingOz > 0) {
    gaps.push({ key: 'water', label: 'Water', remaining: ctx.waterRemainingOz, text: `${Math.round(ctx.waterRemainingOz)}oz of water left` });
  }
  return gaps;
}

/** The gap that is quickest to close — the one worth naming as a next win. */
export function easiestGap(ctx: CoachContext): CoachGap | null {
  const order: CoachGap['key'][] = ['water', 'protein', 'steps', 'workout'];
  const gaps = openGaps(ctx);
  return [...gaps].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))[0] ?? null;
}

/** Answer a specific question, or fall through to the daily priority cascade. */
export function answerCoachQuestion(
  ctx: CoachContext,
  settings: CoachSettings,
  intent: CoachIntent,
): CoachMessage {
  if (!settings.enabled || intent === 'daily') return selectCoachMessage(ctx, settings);

  const p = settings.personality;
  const gaps = openGaps(ctx);

  if (intent === 'weakest') {
    const worst = gaps[0];
    if (!worst) {
      return {
        personality: p,
        tone: 'praise',
        text: phrase(
          {
            friendly: "Nothing's slacking today — every target is met. Enjoy it.",
            motivational: 'Nothing to fix today. Every box is ticked.',
            savage: "Nothing's slipping today. Rare. Do it again tomorrow.",
            no_mercy: 'No gaps today. That is the standard, not a milestone.',
          },
          settings,
        ),
      };
    }
    const others = gaps.slice(1, 3).map((g) => g.label.toLowerCase());
    const also = others.length ? ` Also open: ${others.join(' and ')}.` : '';
    return {
      personality: p,
      tone: 'nudge',
      text: phrase(
        {
          friendly: `Biggest gap right now is ${worst.label.toLowerCase()} — ${worst.text}.${also}`,
          motivational: `${worst.label} is where you're losing the day: ${worst.text}.${also} Close it.`,
          savage: `You're slacking on ${worst.label.toLowerCase()}. ${capitalize(worst.text)}.${also} Fix it before you ask again.`,
          no_mercy: `${worst.label}. ${capitalize(worst.text)}.${also} You already knew that.`,
        },
        settings,
      ),
    };
  }

  if (intent === 'next_win') {
    const easiest = easiestGap(ctx);
    if (!easiest) {
      return {
        personality: p,
        tone: 'praise',
        text: phrase(
          {
            friendly: "Everything's done. The next win is tomorrow — protect your sleep tonight.",
            motivational: 'Day complete. Next win is showing up again tomorrow.',
            savage: "Everything's closed out. Next win: do it again without needing to be asked.",
            no_mercy: 'Nothing left today. Tomorrow is the next test.',
          },
          settings,
        ),
      };
    }
    return {
      personality: p,
      tone: 'nudge',
      text: phrase(
        {
          friendly: `Quickest win on the board: ${easiest.text}. That one's within reach right now.`,
          motivational: `Next win is ${easiest.label.toLowerCase()} — ${easiest.text}. Take it.`,
          savage: `Easiest thing you're leaving on the table: ${easiest.text}. Go get it.`,
          no_mercy: `${capitalize(easiest.text)}. Smallest gap on the board. No reason it's still open.`,
        },
        settings,
      ),
    };
  }

  if (intent === 'on_track') {
    const done = gaps.length === 0;
    const streak = ctx.dailyStreak > 1 ? ` ${ctx.dailyStreak}-day streak.` : '';
    return {
      personality: p,
      tone: done ? 'praise' : 'reflect',
      text: phrase(
        {
          friendly: done
            ? `Yes — ${ctx.disciplineScore}% discipline with everything closed out.${streak}`
            : `Partly. ${ctx.disciplineScore}% so far, with ${gaps.length} thing${gaps.length === 1 ? '' : 's'} still open.${streak}`,
          motivational: done
            ? `On track. ${ctx.disciplineScore}% and nothing left open.${streak}`
            : `${ctx.disciplineScore}% so far. ${gaps.length} still open — the day isn't finished yet.${streak}`,
          savage: done
            ? `${ctx.disciplineScore}% and clean. You're on track.`
            : `${ctx.disciplineScore}%. ${gaps.length} open. You're not on track yet — you're on pace to almost make it.`,
          no_mercy: done
            ? `${ctx.disciplineScore}%. On track. Hold it.`
            : `${ctx.disciplineScore}% with ${gaps.length} open. Answer that yourself at midnight.`,
        },
        settings,
      ),
    };
  }

  // 'push' — asked for directly, so it never defers to a calmer branch.
  return {
    personality: p,
    tone: 'push',
    text: phrase(
      {
        friendly: gaps.length
          ? `Right now: ${gaps[0]!.text}. Start with that — you don't have to finish everything at once.`
          : 'Everything is done. Rest is part of the work — take it.',
        motivational: gaps.length
          ? `Move. ${capitalize(gaps[0]!.text)}. Do it in the next ten minutes.`
          : 'Nothing left to chase today. Bank the recovery.',
        savage: gaps.length
          ? `Stop reading. ${capitalize(gaps[0]!.text)}. Ten minutes, starting now.`
          : "Everything's done. Go rest — you earned it, briefly.",
        no_mercy: gaps.length
          ? `${capitalize(gaps[0]!.text)}. Close the app and handle it.`
          : 'Nothing open. Rest, then do it again tomorrow.',
      },
      settings,
    ),
  };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

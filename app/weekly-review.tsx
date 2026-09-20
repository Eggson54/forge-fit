import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Card, Screen, SectionHeader, Text } from '../src/components/ui';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Icon, type IconName } from '../src/components/Icon';
import { DeltaStat } from '../src/components/DeltaStat';
import { colors, spacing } from '../src/theme';
import { addDaysISO, lastNDays, todayISO } from '../src/domain/date';
import { groupThousands, kgToLb } from '../src/domain/units';
import { strengthChangePct } from '../src/domain/strength';
import type { WeeklyStats } from '../src/domain/coach';
import { useLogStore } from '../src/stores/useLogStore';
import { useProfileStore } from '../src/stores/useProfileStore';
import { useWorkoutStore } from '../src/stores/useWorkoutStore';
import { ai } from '../src/services/ai';
import type { WeeklyReviewResult } from '../src/services/ai/types';
import { analytics } from '../src/services/analytics';

export default function WeeklyReview() {
  const profile = useProfileStore((s) => s.profile);
  const targets = useProfileStore((s) => s.targets);
  const coach = useProfileStore((s) => s.effectiveCoach());
  const logStore = useLogStore();
  const workouts = useWorkoutStore((s) => s.completedWorkouts());

  const [review, setReview] = useState<WeeklyReviewResult | null>(null);
  const [stats, setStats] = useState<WeeklyStats | null>(null);

  // null means "no lift was trained on both sides of the split", which is not
  // the same as no change and must not render as 0%.
  const strengthChange = useMemo(() => strengthChangePct(workouts), [workouts]);

  /**
   * The same numbers for the seven days before this week. A review that only
   * states this week is a summary — "155g of protein" says nothing without
   * "and last week was 132g".
   */
  const previous = useMemo(() => {
    const days = lastNDays(7, addDaysISO(todayISO(), -7));
    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const protein = days.map((d) => logStore.macrosForDate(d).proteinG).filter((p) => p > 0);
    const calories = days.map((d) => logStore.macrosForDate(d).calories).filter((c) => c > 0);
    const steps = days.map((d) => logStore.stepsForDate(d)).filter((v) => v > 0);
    return {
      // Null rather than zero: a week with nothing logged has no average, and
      // showing "down 155g" against an absence would be a lie.
      workouts: workouts.filter((w) => days.includes(w.date)).length,
      avgProteinG: protein.length ? avg(protein) : null,
      avgCalories: calories.length ? avg(calories) : null,
      avgSteps: steps.length ? avg(steps) : null,
      hasData: protein.length > 0 || calories.length > 0 || steps.length > 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workouts, logStore.nutrition, logStore.steps]);

  useEffect(() => {
    analytics.track('weekly_review_viewed');
    const days = lastNDays(7);
    const proteinVals = days.map((d) => logStore.macrosForDate(d).proteinG);
    const calorieVals = days.map((d) => logStore.macrosForDate(d).calories).filter((c) => c > 0);
    const stepVals = days.map((d) => logStore.stepsForDate(d)).filter((s) => s > 0);
    const waterVals = days.map((d) => logStore.waterForDate(d));

    const weekWorkouts = workouts.filter((w) => days.includes(w.date));


    const weightLogs = [...logStore.weight].sort((a, b) => (a.date < b.date ? -1 : 1));
    const weightChangeKg = weightLogs.length >= 2 ? weightLogs[weightLogs.length - 1]!.weightKg - weightLogs[0]!.weightKg : 0;

    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

    const s: WeeklyStats = {
      workoutsCompleted: weekWorkouts.length,
      workoutsPlanned: profile.trainingDaysPerWeek,
      avgProteinG: avg(proteinVals.filter((p) => p > 0)),
      proteinTargetG: targets.proteinG,
      avgCalories: avg(calorieVals),
      avgSteps: avg(stepVals),
      weightChangeKg,
      strengthChangePct: strengthChangePct(workouts) ?? 0,
      avgWaterOz: avg(waterVals.filter((w) => w > 0)),
      waterTargetOz: targets.waterOz,
    };
    setStats(s);
    ai.weeklyReview({ stats: s, settings: coach }).then(setReview);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const weightChangeDisplay = stats
    ? `${stats.weightChangeKg >= 0 ? '+' : ''}${(profile.units === 'imperial' ? kgToLb(stats.weightChangeKg) : stats.weightChangeKg).toFixed(1)} ${profile.units === 'imperial' ? 'lb' : 'kg'}`
    : '—';

  return (
    <Screen gradient>
      <ScreenHeader title="Weekly Review" />
      <Text variant="h1" style={{ marginBottom: spacing.md }}>
        This week
      </Text>

      {stats && (
        <>
          <Card style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
            <DeltaStat
              label="Workouts"
              value={`${stats.workoutsCompleted}/${stats.workoutsPlanned}`}
              accent={colors.primary}
              delta={previous.hasData ? stats.workoutsCompleted - previous.workouts : null}
            />
            <DeltaStat
              label="Avg protein"
              value={`${Math.round(stats.avgProteinG)}g`}
              accent={colors.protein}
              delta={previous.avgProteinG == null ? null : Math.round(stats.avgProteinG - previous.avgProteinG)}
              unit="g"
              noise={3}
            />
            <DeltaStat
              label="Avg cals"
              value={groupThousands(Math.round(stats.avgCalories))}
              accent={colors.calorie}
              delta={previous.avgCalories == null ? null : Math.round(stats.avgCalories - previous.avgCalories)}
              // Calories moving either way is neither good nor bad without the
              // goal, so the deficit direction decides.
              higherIsBetter={profile.goal === 'build_muscle' || profile.goal === 'gain_weight'}
              noise={80}
            />
          </Card>
          {/* Said once rather than on every tile, where it wrapped. */}
          <Text variant="caption" color={colors.textFaint} style={{ marginTop: -spacing.sm, marginBottom: spacing.md }}>
            {previous.hasData ? 'Change against the previous seven days.' : 'No logged data in the previous seven days to compare against.'}
          </Text>
          <Card style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
            <DeltaStat
              label="Avg steps"
              value={`${groupThousands(Math.round(stats.avgSteps))}`}
              accent={colors.steps}
              delta={previous.avgSteps == null ? null : Math.round(stats.avgSteps - previous.avgSteps)}
              noise={400}
            />
            <DeltaStat label="Weight" value={weightChangeDisplay} accent={colors.water} delta={null} />
            <DeltaStat
              label="Strength"
              value={strengthChange == null ? '—' : `${strengthChange >= 0 ? '+' : ''}${strengthChange.toFixed(1)}%`}
              accent={colors.lime}
              delta={null}
            />
          </Card>
        </>
      )}

      <Card tone="alt">
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginBottom: spacing.sm }}>
          <Icon name="bolt" size={18} color={colors.primary} />
          <Text variant="overline" color={colors.primary}>
            COACH SUMMARY
          </Text>
        </View>
        {review ? (
          <>
            <Text variant="h3" style={{ lineHeight: 26 }}>
              {review.summary}
            </Text>
            <View style={{ marginTop: spacing.md, gap: spacing.md }}>
              {review.highlights.map((h, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
                  <View style={{ marginTop: 3 }}>
                    <Icon name={highlightIcon(h)} size={14} color={colors.textFaint} strokeWidth={1.9} />
                  </View>
                  <Text variant="body" color={colors.textDim} style={{ flex: 1, minWidth: 0 }}>
                    {h}
                  </Text>
                </View>
              ))}
            </View>
            <SectionHeader title="Focus next week" />
            <Text variant="body">{review.focusNextWeek}</Text>
          </>
        ) : (
          <Text variant="body" color={colors.textDim}>
            Analyzing your week…
          </Text>
        )}
      </Card>
    </Screen>
  );
}

/**
 * A glyph for a highlight line, matched on what it talks about. The coach
 * writes prose; the icon just gives the eye somewhere to land in a list.
 */
function highlightIcon(text: string): IconName {
  const t = text.toLowerCase();
  if (t.includes('session') || t.includes('workout')) return 'dumbbell';
  if (t.includes('protein')) return 'bolt';
  if (t.includes('hydrat') || t.includes('water')) return 'water';
  if (t.includes('step')) return 'steps';
  if (t.includes('strength') || t.includes('1rm')) return 'chart';
  if (t.includes('sleep')) return 'moon';
  if (t.includes('weight')) return 'scale';
  return 'check';
}

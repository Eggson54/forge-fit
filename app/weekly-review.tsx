import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Card, Screen, SectionHeader, StatTile, Text } from '../src/components/ui';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Icon } from '../src/components/Icon';
import { colors, spacing } from '../src/theme';
import { lastNDays } from '../src/domain/date';
import { kgToLb } from '../src/domain/units';
import { epley1RM } from '../src/domain/strength';
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

  useEffect(() => {
    analytics.track('weekly_review_viewed');
    const days = lastNDays(7);
    const proteinVals = days.map((d) => logStore.macrosForDate(d).proteinG);
    const calorieVals = days.map((d) => logStore.macrosForDate(d).calories).filter((c) => c > 0);
    const stepVals = days.map((d) => logStore.stepsForDate(d)).filter((s) => s > 0);
    const waterVals = days.map((d) => logStore.waterForDate(d));

    const weekWorkouts = workouts.filter((w) => days.includes(w.date));

    // Strength change: compare best e1RM first half vs second half of history
    const e1rms = workouts
      .map((w) => {
        let best = 0;
        for (const ex of w.exercises) for (const s of ex.sets) if (s.completed && s.weightKg && s.reps) best = Math.max(best, epley1RM(s.weightKg, s.reps));
        return best;
      })
      .filter((v) => v > 0);
    const strengthChangePct =
      e1rms.length >= 2 && e1rms[0] ? ((e1rms[e1rms.length - 1]! - e1rms[0]!) / e1rms[0]!) * 100 : 0;

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
      strengthChangePct,
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
          <Card style={{ flexDirection: 'row', marginBottom: spacing.md }}>
            <StatTile value={`${stats.workoutsCompleted}/${stats.workoutsPlanned}`} label="Workouts" accent={colors.primary} />
            <StatTile value={`${Math.round(stats.avgProteinG)}g`} label="Avg protein" accent={colors.protein} />
            <StatTile value={`${Math.round(stats.avgCalories)}`} label="Avg cals" accent={colors.calorie} />
          </Card>
          <Card style={{ flexDirection: 'row', marginBottom: spacing.lg }}>
            <StatTile value={`${Math.round(stats.avgSteps).toLocaleString()}`} label="Avg steps" accent={colors.steps} />
            <StatTile value={weightChangeDisplay} label="Weight" accent={colors.water} />
            <StatTile value={`${stats.strengthChangePct >= 0 ? '+' : ''}${stats.strengthChangePct.toFixed(1)}%`} label="Strength" accent={colors.lime} />
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
            <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
              {review.highlights.map((h, i) => (
                <Text key={i} variant="body" color={colors.textDim}>
                  • {h}
                </Text>
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

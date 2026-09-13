import React, { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { BarChart, Card, LineChart, Screen, SectionHeader, StatTile, Text, type Point } from '../../src/components/ui';
import { Icon } from '../../src/components/Icon';
import { colors, spacing } from '../../src/theme';
import { lastNDays } from '../../src/domain/date';
import { displayWeight, kgToLb } from '../../src/domain/units';
import { epley1RM } from '../../src/domain/strength';
import { useLogStore } from '../../src/stores/useLogStore';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';
import { useGamificationStore } from '../../src/stores/useGamificationStore';
import { ai } from '../../src/services/ai';
import type { ProgressAnalysisResult } from '../../src/services/ai/types';

export default function Progress() {
  const { width } = useWindowDimensions();
  const chartW = width - spacing.xl * 2 - spacing.lg * 2;

  const profile = useProfileStore((s) => s.profile);
  const weightLogs = useLogStore((s) => s.weight);
  const workouts = useWorkoutStore((s) => s.completedWorkouts());
  const streaks = useGamificationStore((s) => s.streaks);

  // Weight series (chronological)
  const weightSeries: Point[] = useMemo(
    () =>
      [...weightLogs]
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .slice(-14)
        .map((w) => ({ label: w.date.slice(5), value: profile.units === 'imperial' ? Math.round(kgToLb(w.weightKg) * 10) / 10 : w.weightKg })),
    [weightLogs, profile.units],
  );

  // Strength: best e1RM per completed workout over time
  const strengthSeries: Point[] = useMemo(() => {
    const sorted = [...workouts].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-14);
    return sorted.map((w) => {
      let best = 0;
      for (const ex of w.exercises)
        for (const s of ex.sets) if (s.completed && s.weightKg && s.reps) best = Math.max(best, epley1RM(s.weightKg, s.reps));
      return { label: w.date.slice(5), value: profile.units === 'imperial' ? Math.round(kgToLb(best)) : Math.round(best) };
    }).filter((p) => p.value > 0);
  }, [workouts, profile.units]);

  // Weekly workout consistency (last 8 weeks)
  const weeklyConsistency: Point[] = useMemo(() => {
    const weeks: Point[] = [];
    for (let i = 7; i >= 0; i--) {
      const end = new Date();
      end.setDate(end.getDate() - i * 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      const count = workouts.filter((w) => {
        const d = new Date(`${w.date}T00:00:00`);
        return d >= start && d <= end;
      }).length;
      weeks.push({ label: `${start.getMonth() + 1}/${start.getDate()}`, value: count });
    }
    return weeks;
  }, [workouts]);

  // Nutrition consistency: days in last 7 with logged calories
  const nutritionDays = useLogStore((s) => {
    const days = lastNDays(7);
    return days.map((d) => ({ label: d.slice(5), value: s.macrosForDate(d).calories > 0 ? 1 : 0 }));
  });
  const nutritionHitCount = nutritionDays.filter((d) => d.value === 1).length;

  const latest = weightLogs[0]?.weightKg ?? profile.weightKg ?? null;
  const startWeight = weightLogs[weightLogs.length - 1]?.weightKg ?? latest;
  const change = latest != null && startWeight != null ? latest - startWeight : 0;
  const changeDisp = displayWeight(Math.abs(change), profile.units);

  const [analysis, setAnalysis] = useState<ProgressAnalysisResult | null>(null);
  useEffect(() => {
    if (weightLogs.length < 2) return;
    ai.analyzeProgress({
      weightSeriesKg: [...weightLogs].sort((a, b) => (a.date < b.date ? -1 : 1)).map((w) => ({ date: w.date, value: w.weightKg })),
      goal: profile.goal,
      targetWeightKg: profile.targetWeightKg,
    }).then(setAnalysis);
  }, [weightLogs, profile.goal, profile.targetWeightKg]);

  return (
    <Screen gradient>
      <Text variant="h1" style={{ marginBottom: spacing.lg }}>
        Progress
      </Text>

      {/* Snapshot */}
      <Card style={{ flexDirection: 'row', marginBottom: spacing.md }}>
        <StatTile value={`${workouts.length}`} label="Workouts" accent={colors.primary} />
        <StatTile value={`${streaks.daily}`} label="Day streak" accent={colors.amber} />
        <StatTile value={`${change >= 0 ? '+' : '-'}${changeDisp.value}`} label={`Weight (${changeDisp.unit})`} accent={colors.protein} />
        <StatTile value={`${nutritionHitCount}/7`} label="Logged" accent={colors.water} />
      </Card>

      {analysis && (
        <Card tone="alt" style={{ marginBottom: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginBottom: 4 }}>
            <Icon name="bolt" size={16} color={colors.primary} />
            <Text variant="overline" color={colors.primary}>
              AI ANALYSIS · {analysis.onTrack ? 'ON TRACK' : 'ADJUST'}
            </Text>
          </View>
          <Text variant="body">{analysis.summary}</Text>
        </Card>
      )}

      <SectionHeader title="Weight" action="Log" onAction={() => router.push('/progress/weight')} />
      <Card>
        <LineChart data={weightSeries} width={chartW} color={colors.protein} />
      </Card>

      <SectionHeader title="Estimated strength (top e1RM)" />
      <Card>
        <LineChart data={strengthSeries} width={chartW} color={colors.primary} />
      </Card>

      <SectionHeader title="Workout consistency (8 weeks)" />
      <Card>
        <BarChart data={weeklyConsistency} width={chartW} color={colors.lime} targetLine={profile.trainingDaysPerWeek} />
        <Text variant="caption" color={colors.textFaint} center style={{ marginTop: spacing.sm }}>
          Dashed line = your weekly goal ({profile.trainingDaysPerWeek}/wk)
        </Text>
      </Card>

      <SectionHeader title="Nutrition consistency (7 days)" />
      <Card>
        <BarChart data={nutritionDays.map((d) => ({ ...d, value: d.value }))} width={chartW} color={colors.water} targetLine={1} />
      </Card>

      <SectionHeader title="More" />
      <Card>
        <MoreRow icon="camera" label="Progress Photos" onPress={() => router.push('/progress/photos')} />
        <MoreRow icon="progress" label="Body Measurements" onPress={() => router.push('/progress/measurements')} />
        <MoreRow icon="flame" label="Achievements & Streaks" onPress={() => router.push('/achievements')} />
        <MoreRow icon="bolt" label="Weekly AI Review" onPress={() => router.push('/weekly-review')} last />
      </Card>
    </Screen>
  );
}

function MoreRow({ icon, label, onPress, last }: { icon: React.ComponentProps<typeof Icon>['name']; label: string; onPress: () => void; last?: boolean }) {
  return (
    <View style={{ borderBottomWidth: last ? 0 : 0.5, borderBottomColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md }} onTouchEnd={onPress}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Icon name={icon} size={20} color={colors.text} />
          <Text variant="body">{label}</Text>
        </View>
        <Text color={colors.textFaint}>›</Text>
      </View>
    </View>
  );
}

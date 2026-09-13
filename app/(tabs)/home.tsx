import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { AdSlot, Button, Card, ProgressRing, Screen, SectionHeader, Text } from '../../src/components/ui';
import { Icon } from '../../src/components/Icon';
import { CoachCard } from '../../src/components/CoachCard';
import { colors, gradients, spacing } from '../../src/theme';
import { formatSleep, timeOfDay } from '../../src/domain/date';
import { displayWeight } from '../../src/domain/units';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { useLogStore } from '../../src/stores/useLogStore';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';
import { useGamificationStore } from '../../src/stores/useGamificationStore';
import { buildCoachContext, useDailySummary } from '../../src/stores/useDailySummary';
import { ai } from '../../src/services/ai';
import { analytics } from '../../src/services/analytics';
import type { CoachMessageResult } from '../../src/services/ai/types';

const GREETING: Record<ReturnType<typeof timeOfDay>, string> = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
  night: 'Still up',
};

export default function Home() {
  const profile = useProfileStore((s) => s.profile);
  const coachSettings = useProfileStore((s) => s.coach);
  const summary = useDailySummary();
  const streak = useGamificationStore((s) => s.streaks.daily);
  const addWater = useLogStore((s) => s.addWater);

  const [coachMsg, setCoachMsg] = useState<CoachMessageResult | null>(null);
  const [coachLoading, setCoachLoading] = useState(true);

  const loadCoach = useCallback(async () => {
    setCoachLoading(true);
    try {
      const ctx = buildCoachContext(summary);
      const msg = await ai.coachMessage({ context: ctx, settings: coachSettings });
      setCoachMsg(msg);
      analytics.track('coach_message_viewed', { personality: coachSettings.personality });
    } finally {
      setCoachLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.discipline.score, coachSettings.personality, coachSettings.aggression, coachSettings.enabled]);

  useEffect(() => {
    loadCoach();
  }, [loadCoach]);

  // Finalize today's outcome into streaks + achievements (idempotent per day).
  useEffect(() => {
    const g = useGamificationStore.getState();
    const proteinHit = summary.proteinG >= summary.proteinTarget * 0.9;
    const nutritionHit = summary.calories > 0 && Math.abs(summary.calories - summary.caloriesTarget) <= summary.caloriesTarget * 0.15;
    const hydrationHit = summary.waterOz >= summary.waterTarget * 0.9;
    g.recordDay({
      date: summary.date,
      workoutDone: summary.workoutCompleted,
      proteinHit,
      nutritionHit,
      hydrationHit,
      dayComplete: summary.discipline.score >= 80,
    });
    g.noteDisciplineScore(summary.discipline.score);
    const streaks = useGamificationStore.getState().streaks;
    g.syncAchievements({
      workoutsCompleted: useWorkoutStore.getState().completedWorkouts().length,
      currentDailyStreak: streaks.daily,
      proteinStreak: streaks.protein,
      hydrationStreak: streaks.hydration,
      prsSet: Object.keys(useWorkoutStore.getState().prs).length,
      progressPhotos: useLogStore.getState().photos.length,
      bestDisciplineScore: useGamificationStore.getState().bestDisciplineScore,
    });
  }, [summary.date, summary.discipline.score, summary.workoutCompleted, summary.proteinG, summary.caloriesTarget, summary.calories, summary.waterOz, summary.proteinTarget, summary.waterTarget]);

  const w = summary.workoutCompleted;

  return (
    <Screen
      gradient
      refreshControl={<RefreshControl refreshing={false} onRefresh={loadCoach} tintColor={colors.primary} />}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
        <View>
          <Text variant="caption" color={colors.textDim}>
            {GREETING[timeOfDay()]}
          </Text>
          <Text variant="h1">{profile.name || 'Athlete'}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
          <StreakBadge count={streak} />
          <Button
            title=""
            icon={<Icon name="bell" size={22} color={colors.text} />}
            variant="ghost"
            fullWidth={false}
            haptic={false}
            onPress={() => router.push('/reminders')}
            style={{ width: 46, paddingHorizontal: 0 }}
          />
        </View>
      </View>

      {/* Coach */}
      <CoachCard message={coachMsg} personality={coachSettings.personality} loading={coachLoading} onPress={() => router.push('/coach')} />

      {/* Discipline + Workout */}
      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
        <Card style={{ flex: 1, alignItems: 'center', gap: spacing.sm }}>
          <ProgressRing progress={summary.discipline.score / 100} size={120} stroke={12} gradientColors={gradients.discipline}>
            <View style={{ alignItems: 'center' }}>
              <Text variant="metricLg">{summary.discipline.score}</Text>
              <Text variant="caption" color={colors.textDim}>
                DISCIPLINE
              </Text>
            </View>
          </ProgressRing>
          <Text variant="caption" color={colors.textDim} center>
            {disciplineWord(summary.discipline.score)}
          </Text>
        </Card>

        <Card style={{ flex: 1, justifyContent: 'space-between' }} onPress={() => router.push('/(tabs)/workout')}>
          <View style={{ gap: 4 }}>
            <Text variant="overline" color={colors.textDim}>
              TODAY'S WORKOUT
            </Text>
            <Text variant="h3">{summary.workoutName ?? 'Rest / Open'}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md }}>
            <Icon name={w ? 'flame' : 'dumbbell'} size={18} color={w ? colors.success : colors.primary} />
            <Text variant="label" color={w ? colors.success : colors.primary}>
              {w ? 'Completed' : summary.workoutPlanned ? 'Not completed' : 'Nothing planned'}
            </Text>
          </View>
        </Card>
      </View>

      {/* Metrics */}
      <SectionHeader title="Today" />
      <Card>
        <MetricRow
          icon="flame"
          color={colors.calorie}
          label="Calories"
          value={`${summary.calories}`}
          target={`${summary.caloriesTarget}`}
          progress={summary.calories / summary.caloriesTarget}
        />
        <MetricRow
          icon="bolt"
          color={colors.protein}
          label="Protein"
          value={`${Math.round(summary.proteinG)}g`}
          target={`${summary.proteinTarget}g`}
          progress={summary.proteinG / summary.proteinTarget}
        />
        <MetricRow
          icon="water"
          color={colors.water}
          label="Water"
          value={`${Math.round(summary.waterOz)} oz`}
          target={`${summary.waterTarget} oz`}
          progress={summary.waterOz / summary.waterTarget}
        />
        <MetricRow
          icon="progress"
          color={colors.steps}
          label="Steps"
          value={summary.steps.toLocaleString()}
          target={summary.stepsTarget.toLocaleString()}
          progress={summary.steps / summary.stepsTarget}
          onPress={() => router.push('/log?focus=steps')}
        />
        <MetricRow
          icon="timer"
          color={colors.sleep}
          label="Sleep"
          value={summary.sleepMinutes ? formatSleep(summary.sleepMinutes) : '—'}
          target={formatSleep(summary.sleepTarget)}
          progress={summary.sleepMinutes / summary.sleepTarget}
          onPress={() => router.push('/log?focus=sleep')}
          last
        />
      </Card>

      {/* Quick actions */}
      <SectionHeader title="Quick add" />
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <QuickAction icon="dumbbell" label="Workout" onPress={() => router.push('/(tabs)/workout')} />
        <QuickAction icon="nutrition" label="Food" onPress={() => router.push('/nutrition/add')} />
        <QuickAction icon="water" label="+16 oz" onPress={() => addWater(16)} />
      </View>

      <View style={{ marginTop: spacing.lg }}>
        <AdSlot placement="home_feed" />
      </View>

      {profile.targetWeightKg && summary && (
        <Text variant="caption" color={colors.textFaint} center style={{ marginTop: spacing.md }}>
          Target: {display(profile.targetWeightKg, profile.units)} · Current:{' '}
          {display(useLogStore.getState().latestWeightKg() ?? profile.weightKg ?? 0, profile.units)}
        </Text>
      )}
    </Screen>
  );
}

function display(kg: number, units: 'imperial' | 'metric') {
  const d = displayWeight(kg, units);
  return `${d.value} ${d.unit}`;
}

function StreakBadge({ count }: { count: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,90,31,0.12)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}>
      <Icon name="flame" size={16} color={colors.primary} />
      <Text variant="bodyStrong" color={colors.primary}>
        {count}
      </Text>
    </View>
  );
}

function MetricRow({
  icon,
  color,
  label,
  value,
  target,
  progress,
  last,
  onPress,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  color: string;
  label: string;
  value: string;
  target: string;
  progress: number;
  last?: boolean;
  onPress?: () => void;
}) {
  const pct = Math.max(0, Math.min(1, isFinite(progress) ? progress : 0));
  return (
    <View onTouchEnd={onPress} style={{ paddingVertical: spacing.md, borderBottomWidth: last ? 0 : 0.5, borderBottomColor: colors.border }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Icon name={icon} size={18} color={color} />
          <Text variant="bodyStrong">{label}</Text>
        </View>
        <Text variant="label" color={colors.textDim}>
          <Text variant="bodyStrong" color={colors.text}>
            {value}
          </Text>{' '}
          / {target}
        </Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: 'hidden' }}>
        <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: color, borderRadius: 3 }} />
      </View>
    </View>
  );
}

function QuickAction({ icon, label, onPress }: { icon: React.ComponentProps<typeof Icon>['name']; label: string; onPress: () => void }) {
  return (
    <Card style={{ flex: 1, alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg }} onPress={onPress}>
      <Icon name={icon} size={24} color={colors.primary} />
      <Text variant="label">{label}</Text>
    </Card>
  );
}

const disciplineWord = (s: number) => (s >= 90 ? 'Elite day' : s >= 75 ? 'Strong' : s >= 50 ? 'Keep pushing' : s > 0 ? "Let's move" : 'Log your day');

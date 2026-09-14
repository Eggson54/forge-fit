import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, EmptyState, Screen, SectionHeader, Text, Pill } from '../../src/components/ui';
import { Icon } from '../../src/components/Icon';
import { colors, spacing } from '../../src/theme';
import { formatDuration } from '../../src/domain/date';
import { workoutStats } from '../../src/domain/strength';
import { displayWeight } from '../../src/domain/units';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';
import { useProfileStore } from '../../src/stores/useProfileStore';

export default function WorkoutTab() {
  const workouts = useWorkoutStore((s) => s.workouts);
  const activeId = useWorkoutStore((s) => s.activeId);
  const startEmpty = useWorkoutStore((s) => s.startEmptyWorkout);
  const units = useProfileStore((s) => s.profile.units);

  const completed = workouts.filter((w) => w.status === 'completed').slice(0, 10);
  const active = workouts.find((w) => w.id === activeId);

  const startBlank = () => {
    if (active) {
      router.push('/workout/active');
      return;
    }
    startEmpty('Workout');
    router.push('/workout/active');
  };

  return (
    <Screen gradient>
      <Text variant="h1" style={{ marginBottom: spacing.lg }}>
        Train
      </Text>

      {active && (
        <Card tone="high" onPress={() => router.push('/workout/active')} style={{ marginBottom: spacing.lg, borderColor: colors.primary, borderWidth: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Pill label="IN PROGRESS" filled />
              <Text variant="h3" style={{ marginTop: spacing.sm }}>
                {active.name}
              </Text>
              <Text variant="caption" color={colors.textDim}>
                {active.exercises.length} exercises · tap to resume
              </Text>
            </View>
            <Icon name="timer" size={28} color={colors.primary} />
          </View>
        </Card>
      )}

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <StartCard icon="plus" title="Empty Workout" subtitle="Build as you go" onPress={startBlank} />
        <StartCard icon="bolt" title="AI Generate" subtitle="From your goal" onPress={() => router.push('/workout/generate')} highlight />
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
        <StartCard icon="progress" title="Routines" subtitle="Saved templates" onPress={() => router.push('/workout/routines')} />
        <StartCard icon="dumbbell" title="Exercises" subtitle="Browse library" onPress={() => router.push('/workout/library')} />
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
        <StartCard icon="flame" title="Leaderboard" subtitle="Ranked rivals" onPress={() => router.push('/leaderboard')} />
        <StartCard icon="progress" title="History" subtitle="Past sessions" onPress={() => router.push('/workout/history')} />
      </View>

      <SectionHeader title="Recent workouts" action={completed.length ? 'See all' : undefined} onAction={() => router.push('/workout/history')} />
      {completed.length === 0 ? (
        <EmptyState icon="🏋️" title="No workouts yet" subtitle="Start your first session and your coach starts tracking." />
      ) : (
        <View style={{ gap: spacing.md }}>
          {completed.map((wk) => {
            const stats = workoutStats(wk);
            const vol = displayWeight(stats.totalVolumeKg, units);
            return (
              <Card key={wk.id} onPress={() => router.push(`/workout/${wk.id}`)}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{wk.name}</Text>
                    <Text variant="caption" color={colors.textDim}>
                      {new Date(wk.completedAt ?? wk.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ·{' '}
                      {formatDuration(wk.durationSeconds ?? 0)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text variant="bodyStrong" color={colors.primary}>
                      {Math.round(vol.value).toLocaleString()} {vol.unit}
                    </Text>
                    <Text variant="caption" color={colors.textDim}>
                      {stats.totalSets} sets · {stats.totalReps} reps
                    </Text>
                  </View>
                </View>
              </Card>
            );
          })}
        </View>
      )}

      <View style={{ marginTop: spacing.xl }}>
        <Button title="Start Empty Workout" onPress={startBlank} size="lg" icon={<Icon name="plus" size={20} color={colors.onPrimary} />} />
      </View>
    </Screen>
  );
}

function StartCard({
  icon,
  title,
  subtitle,
  onPress,
  highlight,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  title: string;
  subtitle: string;
  onPress: () => void;
  highlight?: boolean;
}) {
  return (
    <Card
      onPress={onPress}
      style={{ flex: 1, gap: spacing.sm, borderColor: highlight ? colors.primary : colors.border, borderWidth: highlight ? 1 : 0.5 }}
    >
      <Icon name={icon} size={24} color={highlight ? colors.primary : colors.text} />
      <View>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" color={colors.textDim}>
          {subtitle}
        </Text>
      </View>
    </Card>
  );
}

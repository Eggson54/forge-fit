import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, EmptyState, Screen, SectionHeader, Text, Pill } from '../../src/components/ui';
import { Stagger } from '../../src/components/anim';
import { Icon } from '../../src/components/Icon';
import { colors, spacing } from '../../src/theme';
import { formatDayMonth, formatDurationShort } from '../../src/domain/date';
import { workoutStats } from '../../src/domain/strength';
import { displayVolume } from '../../src/domain/units';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';
import { useProfileStore } from '../../src/stores/useProfileStore';

export default function WorkoutTab() {
  const workouts = useWorkoutStore((s) => s.workouts);
  const activeId = useWorkoutStore((s) => s.activeId);
  const startEmpty = useWorkoutStore((s) => s.startEmptyWorkout);
  const units = useProfileStore((s) => s.profile.units);

  // "Recent" means recent: ten sessions is the History screen, which "See all"
  // already links to, and it buried the start button under a full duplicate list.
  const allCompleted = workouts.filter((w) => w.status === 'completed');
  const completed = allCompleted.slice(0, 4);
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
        <StartCard icon="list" title="Routines" subtitle="Saved templates" onPress={() => router.push('/workout/routines')} />
        <StartCard icon="search" title="Exercises" subtitle="Browse library" onPress={() => router.push('/workout/library')} />
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
        <StartCard icon="trophy" title="Leaderboard" subtitle="Ranked rivals" onPress={() => router.push('/leaderboard')} />
        <StartCard icon="clock" title="History" subtitle="Past sessions" onPress={() => router.push('/workout/history')} />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
        <StartCard icon="sliders" title="Plate Math" subtitle="What goes on the bar" onPress={() => router.push('/tools/plates')} />
        <StartCard icon="chart" title="Warm-Up" subtitle="Ramp to your work set" onPress={() => router.push('/tools/warmup')} />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md, marginBottom: spacing.md }}>
        <StartCard icon="target" title="Rep Max" subtitle="Estimate and percentages" onPress={() => router.push('/tools/one-rep-max')} />
        <StartCard icon="trophy" title="Records" subtitle="Your best lifts" onPress={() => router.push('/workout/records')} />
      </View>

      <SectionHeader title="Recent workouts" action={allCompleted.length ? 'See all' : undefined} onAction={() => router.push('/workout/history')} />
      {/* The empty state carries no action: the Empty Workout tile above and the
          footer button below are already the same tap, and three copies of one
          call to action on one screen reads as indecision. */}
      {completed.length === 0 ? (
        <EmptyState
          icon="dumbbell"
          title="No workouts yet"
          subtitle="Start your first session and your coach starts tracking."
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          <Stagger step={45}>
          {completed.map((wk) => {
            const stats = workoutStats(wk);
            const vol = displayVolume(stats.totalVolumeKg, units);
            return (
              <Card key={wk.id} onPress={() => router.push(`/workout/${wk.id}`)}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{wk.name}</Text>
                    <Text variant="caption" color={colors.textDim}>
                      {formatDayMonth(wk.completedAt ?? wk.date)} ·{' '}
                      {formatDurationShort(wk.durationSeconds ?? 0)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text variant="bodyStrong" color={colors.primary}>
                      {vol.value} {vol.unit}
                    </Text>
                    <Text variant="caption" color={colors.textDim}>
                      {stats.totalSets} sets · {stats.totalReps} reps
                    </Text>
                  </View>
                </View>
              </Card>
            );
          })}
          </Stagger>
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

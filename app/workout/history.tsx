import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Card, EmptyState, Screen, Text } from '../../src/components/ui';
import { Stagger } from '../../src/components/anim';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, spacing } from '../../src/theme';
import { formatDateWithWeekday, formatDurationShort } from '../../src/domain/date';
import { workoutStats } from '../../src/domain/strength';
import { displayVolume } from '../../src/domain/units';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';
import { useProfileStore } from '../../src/stores/useProfileStore';

export default function History() {
  const completed = useWorkoutStore((s) => s.completedWorkouts());
  const units = useProfileStore((s) => s.profile.units);

  return (
    <Screen gradient>
      <ScreenHeader title="Workout History" />
      {completed.length === 0 ? (
        <EmptyState
          icon="clock"
          title="No history yet"
          subtitle="Completed workouts show up here."
          action="Start a workout"
          onAction={() => router.replace('/(tabs)/workout')}
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          <Stagger step={45}>
          {completed.map((wk) => {
            const stats = workoutStats(wk);
            const vol = displayVolume(stats.totalVolumeKg, units);
            return (
              <Card key={wk.id} onPress={() => router.push(`/workout/${wk.id}`)}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View>
                    <Text variant="bodyStrong">{wk.name}</Text>
                    <Text variant="caption" color={colors.textDim}>
                      {formatDateWithWeekday(wk.completedAt ?? wk.date)} · {formatDurationShort(wk.durationSeconds ?? 0)}
                    </Text>
                  </View>
                  <Text variant="bodyStrong" color={colors.primary}>
                    {vol.value} {vol.unit}
                  </Text>
                </View>
              </Card>
            );
          })}
          </Stagger>
        </View>
      )}
    </Screen>
  );
}

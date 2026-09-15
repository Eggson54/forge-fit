import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Card, EmptyState, Screen, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, spacing } from '../../src/theme';
import { formatDurationShort } from '../../src/domain/date';
import { workoutStats } from '../../src/domain/strength';
import { displayWeight } from '../../src/domain/units';
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
          {completed.map((wk) => {
            const stats = workoutStats(wk);
            const vol = displayWeight(stats.totalVolumeKg, units);
            return (
              <Card key={wk.id} onPress={() => router.push(`/workout/${wk.id}`)}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View>
                    <Text variant="bodyStrong">{wk.name}</Text>
                    <Text variant="caption" color={colors.textDim}>
                      {new Date(wk.completedAt ?? wk.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {formatDurationShort(wk.durationSeconds ?? 0)}
                    </Text>
                  </View>
                  <Text variant="bodyStrong" color={colors.primary}>
                    {Math.round(vol.value).toLocaleString()} {vol.unit}
                  </Text>
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

import React from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Screen, SectionHeader, StatTile, Text } from '../../src/components/ui';
import { AnimatedNumber, Celebration, FadeIn } from '../../src/components/anim';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { MuscleThumb } from '../../src/components/body/MuscleThumb';
import { colors, spacing } from '../../src/theme';
import { formatDurationShort } from '../../src/domain/date';
import { workoutStats } from '../../src/domain/strength';
import { displayWeight, groupThousands } from '../../src/domain/units';
import type { MuscleGroup } from '../../src/domain/types';
import { SET_KIND_LABEL, setKind } from '../../src/domain/sets';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { useRoutineStore } from '../../src/stores/useRoutineStore';
import { Alert } from 'react-native';

export default function WorkoutDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workout = useWorkoutStore((s) => s.workouts.find((w) => w.id === id));
  const units = useProfileStore((s) => s.profile.units);
  const saveRoutine = useRoutineStore((s) => s.saveFromWorkout);

  if (!workout) {
    return (
      <Screen gradient>
        <ScreenHeader title="Workout" />
        <Text variant="body" color={colors.textDim}>
          This workout could not be found.
        </Text>
      </Screen>
    );
  }

  const stats = workoutStats(workout);
  const vol = displayWeight(stats.totalVolumeKg, units);
  const e1rm = displayWeight(stats.bestE1RM, units);
  const prCount = workout.exercises.reduce((a, e) => a + e.sets.filter((s) => s.isPr).length, 0);

  return (
    <Screen
      gradient
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Button title="Save as Routine" variant="secondary" onPress={() => { saveRoutine(workout); Alert.alert('Saved', `"${workout.name}" saved as a routine you can reuse.`); }} style={{ flex: 1 }} />
          <Button title="Done" onPress={() => router.replace('/(tabs)/workout')} style={{ flex: 1 }} />
        </View>
      }
    >
      {workout.status === 'completed' && <Celebration />}
      <ScreenHeader title={workout.name} />

      <FadeIn>
        <Card style={{ alignItems: 'center', gap: spacing.xs, marginBottom: spacing.lg }}>
          <Text variant="overline" color={colors.textDim}>
            {workout.status === 'completed' ? 'COMPLETED' : 'SUMMARY'}
          </Text>
          <AnimatedNumber value={Math.round(vol.value)} variant="display" color={colors.primary} format={groupThousands} />
          <Text variant="caption" color={colors.textDim}>
            total volume ({vol.unit}) · {formatDurationShort(workout.durationSeconds ?? 0)}
          </Text>
          {prCount > 0 && (
            <Text variant="bodyStrong" color={colors.amber}>
              ★ {prCount} new personal record{prCount > 1 ? 's' : ''}!
            </Text>
          )}
        </Card>
      </FadeIn>

      {/* All four tiles carry an accent dot, and the unit moves into the value:
          "Top e1RM (lb)" wrapped into the neighbouring label at quarter width. */}
      <Card style={{ flexDirection: 'row', marginBottom: spacing.lg }}>
        <StatTile value={`${stats.totalSets}`} label="Sets" accent={colors.primary} />
        <StatTile value={`${stats.totalReps}`} label="Reps" accent={colors.water} />
        <StatTile value={`${Math.round(e1rm.value)} ${e1rm.unit}`} label="Top e1RM" accent={colors.protein} />
        <StatTile value={`${prCount}`} label="PRs" accent={colors.amber} />
      </Card>

      <SectionHeader title="Exercises" />
      {workout.exercises.map((ex) => {
        const completedSets = ex.sets.filter((s) => s.completed);
        return (
          <Card key={ex.id} style={{ marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <MuscleThumb muscle={ex.primaryMuscle} size={26} />
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {ex.name}
              </Text>
            </View>
            <View style={{ marginTop: spacing.sm, gap: 4 }}>
              {completedSets.map((s, i) => {
                const w = s.weightKg != null ? displayWeight(s.weightKg, units) : null;
                return (
                  <View key={s.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="caption" color={colors.textDim}>
                      {setKind(s) === 'working' ? `Set ${i + 1}` : SET_KIND_LABEL[setKind(s)]} {s.isPr ? '★' : ''}
                    </Text>
                    <Text variant="label">
                      {w ? `${Math.round(w.value * 10) / 10} ${w.unit}` : '—'} × {s.reps ?? '—'}
                      {s.rpe ? ` @ RPE ${s.rpe}` : ''}
                    </Text>
                  </View>
                );
              })}
              {completedSets.length === 0 && (
                <Text variant="caption" color={colors.textFaint}>
                  No completed sets
                </Text>
              )}
            </View>
            {ex.notes ? (
              <Text variant="caption" color={colors.textDim} style={{ marginTop: spacing.sm, fontStyle: 'italic' }}>
                “{ex.notes}”
              </Text>
            ) : null}
          </Card>
        );
      })}

      <SectionHeader title="Muscle volume" />
      <Card>
        {Object.entries(stats.muscleVolume).map(([m, v]) => {
          const d = displayWeight(v as number, units);
          return (
            <View key={m} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm }}>
              <Text variant="body">{label(m as MuscleGroup)}</Text>
              <Text variant="label" color={colors.textDim}>
                {Math.round(d.value).toLocaleString()} {d.unit}
              </Text>
            </View>
          );
        })}
        {Object.keys(stats.muscleVolume).length === 0 && (
          <Text variant="caption" color={colors.textFaint}>
            Complete sets to see muscle breakdown.
          </Text>
        )}
      </Card>
    </Screen>
  );
}

const label = (m: MuscleGroup) => m.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

import React from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Screen, SectionHeader, StatTile, Text } from '../../src/components/ui';
import { AnimatedNumber, Celebration, FadeIn } from '../../src/components/anim';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { MuscleThumb } from '../../src/components/body/MuscleThumb';
import { colors, spacing } from '../../src/theme';
import { formatDurationShort } from '../../src/domain/date';
import { workoutStats } from '../../src/domain/strength';
import { muscleShares, weeklySetsPerMuscle } from '../../src/domain/volume';
import { displayWeight, groupThousands } from '../../src/domain/units';
import type { MuscleGroup, Units, WorkoutExercise } from '../../src/domain/types';
import { SET_KIND_LABEL, setKind } from '../../src/domain/sets';
import { groupExercises, supersetLabel } from '../../src/domain/superset';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { useRoutineStore } from '../../src/stores/useRoutineStore';
import { Alert } from 'react-native';

export default function WorkoutDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workout = useWorkoutStore((s) => s.workouts.find((w) => w.id === id));
  const units = useProfileStore((s) => s.profile.units);
  const bodyweightKg = useProfileStore((s) => s.profile.weightKg ?? null);
  const saveRoutine = useRoutineStore((s) => s.saveFromWorkout);
  const repeatWorkout = useWorkoutStore((s) => s.repeatWorkout);
  const activeId = useWorkoutStore((s) => s.activeId);

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

  const stats = workoutStats(workout, bodyweightKg);

  // Where the session's work actually went. Set counts, not tonnage: a leg day
  // outweighs an arm day threefold on tonnage alone, so a tonnage split mostly
  // measures which lifts happened to be on the card.
  const shares = muscleShares(weeklySetsPerMuscle([workout]));
  const vol = displayWeight(stats.totalVolumeKg, units);
  const e1rm = displayWeight(stats.bestE1RM, units);
  const prCount = workout.exercises.reduce((a, e) => a + e.sets.filter((s) => s.isPr).length, 0);

  return (
    <Screen
      gradient
      footer={
        <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Button title="Save as Routine" variant="secondary" onPress={() => { saveRoutine(workout); Alert.alert('Saved', `"${workout.name}" saved as a routine you can reuse.`); }} style={{ flex: 1 }} />
          <Button title="Done" onPress={() => router.replace('/(tabs)/workout')} style={{ flex: 1 }} />
        </View>
        <View>
          <Button
            title="Do this workout again"
            variant="secondary"
            icon={<Icon name="repeat" size={16} color={colors.text} />}
            onPress={() => {
              if (activeId) {
                Alert.alert('Finish the current session first', 'You already have a workout in progress.');
                return;
              }
              const id = repeatWorkout(workout.id);
              if (id) router.replace('/workout/active');
            }}
          />
        </View>
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

      {workout.notes ? (
        <Card tone="alt" style={{ marginTop: spacing.md }}>
          <Text variant="overline" color={colors.textDim} style={{ marginBottom: spacing.xs }}>
            Session note
          </Text>
          <Text variant="body" color={colors.textDim}>
            {workout.notes}
          </Text>
        </Card>
      ) : null}

      <SectionHeader title="Exercises" />
      {groupExercises(workout.exercises).map((group) => (
        <View
          key={group.items[0]!.id}
          style={group.supersetId ? { borderLeftWidth: 2, borderLeftColor: colors.primary, paddingLeft: spacing.md } : undefined}
        >
          {group.supersetId && (
            <Text variant="overline" color={colors.primary} style={{ marginBottom: spacing.xs }}>
              Superset
            </Text>
          )}
          {group.items.map((ex, i) => (
            <ExerciseSummary
              key={ex.id}
              exercise={ex}
              letter={group.supersetId ? supersetLabel(i) : null}
              units={units}
            />
          ))}
        </View>
      ))}

      <SectionHeader title="Where the work went" />
      <Card style={{ gap: spacing.md }}>
        {shares.length === 0 ? (
          <Text variant="caption" color={colors.textFaint}>Complete sets to see the split.</Text>
        ) : (
          <>
            {/* One stacked bar reads as a split; eight separate bars read as
                eight unrelated numbers. */}
            <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden' }}>
              {shares.map((row, i) => (
                <View
                  key={row.muscle}
                  style={{
                    flex: Math.max(0.001, row.share),
                    backgroundColor: SPLIT_COLORS[i % SPLIT_COLORS.length],
                  }}
                />
              ))}
            </View>

            {shares.map((row, i) => {
              const tonnageKg = (stats.muscleVolume as Record<string, number>)[row.muscle] ?? 0;
              const d = displayWeight(tonnageKg, units);
              return (
                <View key={row.muscle} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: SPLIT_COLORS[i % SPLIT_COLORS.length],
                    }}
                  />
                  <Text variant="body" style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
                    {label(row.muscle)}
                  </Text>
                  <Text variant="label">{formatSets(row.sets)}</Text>
                  <Text variant="caption" color={colors.textFaint} style={{ width: 44, textAlign: 'right' }}>
                    {Math.round(row.share * 100)}%
                  </Text>
                  <Text variant="caption" color={colors.textFaint} style={{ width: 78, textAlign: 'right' }}>
                    {tonnageKg > 0 ? `${groupThousands(Math.round(d.value))} ${d.unit}` : '—'}
                  </Text>
                </View>
              );
            })}

            <Text variant="caption" color={colors.textFaint}>
              Working sets, with the muscle that drives the lift counting fully and assisting muscles counting half.
              The right-hand column is tonnage moved.
            </Text>
          </>
        )}
      </Card>

    </Screen>
  );
}

const label = (m: MuscleGroup) => m.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Distinct hues for the split bar; wraps if a session somehow hits nine muscles. */
const SPLIT_COLORS = [
  colors.primary,
  colors.water,
  colors.success,
  colors.amber,
  colors.protein,
  colors.steps,
  '#C084FC',
  '#7FB2FF',
];

/** 4.5 → "4.5", 4 → "4" — half-set credit should not print as "4.0". */
const formatSets = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** One exercise as it was actually performed, for the post-session summary. */
function ExerciseSummary({
  exercise,
  letter,
  units,
}: {
  exercise: WorkoutExercise;
  letter: string | null;
  units: Units;
}) {
  const completedSets = exercise.sets.filter((s) => s.completed);

  return (
    <Card style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <MuscleThumb muscle={exercise.primaryMuscle} size={26} />
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {letter ? <Text variant="bodyStrong" color={colors.primary}>{letter} </Text> : null}
          {exercise.name}
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
      {exercise.notes ? (
        <Text variant="caption" color={colors.textDim} style={{ marginTop: spacing.sm, fontStyle: 'italic' }}>
          “{exercise.notes}”
        </Text>
      ) : null}
    </Card>
  );
}

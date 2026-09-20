import React from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Screen, SectionHeader, StatTile, Text } from '../../src/components/ui';
import { AnimatedNumber, Celebration, FadeIn } from '../../src/components/anim';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { MuscleThumb } from '../../src/components/body/MuscleThumb';
import { colors, domainAccent, radius, spacing } from '../../src/theme';
import { formatDayMonth, formatDurationShort } from '../../src/domain/date';
import { workoutStats } from '../../src/domain/strength';
import { muscleShares, weeklySetsPerMuscle } from '../../src/domain/volume';
import { STRENGTH_NOISE_PCT, compareSessions, summariseComparison } from '../../src/domain/sessionCompare';
import { EFFORT_BLURB, EFFORT_LABEL, EFFORT_SCALE } from '../../src/domain/effort';
import { trackingFor } from '../../src/domain/tracking';
import { exerciseById } from '../../src/data/exercises';
import { displayVolume, displayWeight, groupThousands } from '../../src/domain/units';
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
  const setWorkoutEffort = useWorkoutStore((s) => s.setWorkoutEffort);
  const activeId = useWorkoutStore((s) => s.activeId);

  // Above the early return below: a hook that only sometimes runs changes the
  // hook order between renders.
  const allWorkouts = useWorkoutStore((s) => s.workouts);
  const comparison = React.useMemo(
    () =>
      workout
        ? compareSessions(workout, allWorkouts, bodyweightKg, (id) => trackingFor(exerciseById(id)))
        : null,
    [workout, allWorkouts, bodyweightKg],
  );

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
          {workout.gym && (
            <Pressable
              onPress={() => router.push(`/gyms/${workout.gym!.id}`)}
              hitSlop={8}
              accessibilityRole="link"
              accessibilityLabel={`Logged at ${workout.gym.name}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs }}
            >
              <Icon name="map" size={13} color={domainAccent.gyms} strokeWidth={1.9} />
              <Text variant="caption" color={domainAccent.gyms}>{workout.gym.name}</Text>
            </Pressable>
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

      {/* Asked once, at the end, while the memory is fresh. Optional: a
          session nobody rated is not a session that felt like nothing. */}
      {workout.status === 'completed' && (
        <Card style={{ marginBottom: spacing.md, gap: spacing.md }}>
          <View style={{ gap: 2 }}>
            <Text variant="overline" color={colors.textFaint}>HOW HARD WAS THAT?</Text>
            <Text variant="caption" color={colors.textDim}>
              {workout.effort
                ? EFFORT_BLURB[workout.effort]
                : 'One tap. It only ever describes how it felt to you.'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            {EFFORT_SCALE.map((value) => {
              const on = workout.effort === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setWorkoutEffort(workout.id, on ? null : value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Effort ${value} of 5: ${EFFORT_LABEL[value]}`}
                  style={[styles.effortChip, on && { backgroundColor: EFFORT_TINT[value], borderColor: EFFORT_TINT[value] }]}
                >
                  <Text variant="label" color={on ? colors.bg : colors.textDim}>{value}</Text>
                  <Text variant="caption" color={on ? colors.bg : colors.textFaint} style={{ fontSize: 9 }}>
                    {EFFORT_LABEL[value]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      )}

      {/* A finished workout says what you did. It never said the thing anyone
          actually wants to know, which is whether it beat last time. */}
      {comparison && comparison.match !== 'none' && comparison.previous && (
        <FadeIn delay={40}>
          <Card style={{ gap: spacing.md, marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
              <Text variant="overline" color={colors.textFaint} style={{ flex: 1, minWidth: 0 }}>
                {comparison.match === 'same_name' ? 'VS YOUR LAST' : 'VS A SIMILAR SESSION'} ·{' '}
                {formatDayMonth(comparison.previous.completedAt ?? comparison.previous.date)}
              </Text>
            </View>
            <Text variant="bodyStrong">{summariseComparison(comparison)}</Text>

            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Compare
                label="Volume"
                now={`${displayVolume(comparison.totalVolumeKg, units).value} ${displayVolume(comparison.totalVolumeKg, units).unit}`}
                deltaPct={pctChange(comparison.previousTotalVolumeKg, comparison.totalVolumeKg)}
              />
              <Compare
                label="Sets"
                now={String(comparison.totalSets)}
                deltaPct={pctChange(comparison.previousTotalSets, comparison.totalSets)}
              />
            </View>

            <View style={{ gap: spacing.sm, borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: spacing.md }}>
              {comparison.exercises.map((e) => (
                <View key={e.exerciseId} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text variant="body" style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
                    {e.name}
                  </Text>
                  {e.isNew ? (
                    <Text variant="caption" color={colors.water}>new</Text>
                  ) : e.strengthChangePct == null ? (
                    <Text variant="caption" color={colors.textFaint}>—</Text>
                  ) : (
                    <Text
                      variant="label"
                      color={
                        e.strengthChangePct > STRENGTH_NOISE_PCT
                          ? colors.success
                          : e.strengthChangePct < -STRENGTH_NOISE_PCT
                            ? colors.danger
                            : colors.textDim
                      }
                    >
                      {e.strengthChangePct > 0 ? '+' : ''}
                      {e.strengthChangePct.toFixed(1)}%
                    </Text>
                  )}
                </View>
              ))}
              {comparison.dropped.length > 0 && (
                <Text variant="caption" color={colors.textFaint}>
                  Not repeated: {comparison.dropped.map((d) => d.name).join(', ')}.
                </Text>
              )}
            </View>

            <Text variant="caption" color={colors.textFaint}>
              Percentages compare your best estimated max per lift. Anything inside {STRENGTH_NOISE_PCT}% is
              rounding and rep choice rather than a real change.
            </Text>
          </Card>
        </FadeIn>
      )}

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

const EFFORT_TINT: Record<number, string> = {
  1: colors.water,
  2: colors.success,
  3: colors.lime,
  4: colors.amber,
  5: colors.danger,
};

const styles = {
  effortChip: {
    flex: 1,
    alignItems: 'center' as const,
    gap: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
};

/** Percent change, or null when there is no baseline to change from. */
function pctChange(before: number, now: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 1000) / 10;
}

function Compare({ label, now, deltaPct }: { label: string; now: string; deltaPct: number | null }) {
  const tint =
    deltaPct == null ? colors.textFaint : deltaPct > 0 ? colors.success : deltaPct < 0 ? colors.danger : colors.textDim;
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="caption" color={colors.textFaint}>{label}</Text>
      <Text variant="h3">{now}</Text>
      <Text variant="caption" color={tint}>
        {deltaPct == null ? 'no baseline' : `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}% vs last`}
      </Text>
    </View>
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

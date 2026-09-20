import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, EmptyState, LineChart, Pill, Screen, SectionHeader, StatTile, Text, type Point } from '../../src/components/ui';
import { FadeIn } from '../../src/components/anim';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { MuscleThumb } from '../../src/components/body/MuscleThumb';
import { colors, radius, spacing } from '../../src/theme';
import { epley1RM } from '../../src/domain/strength';
import { displayVolume, displayWeight, kgToLb } from '../../src/domain/units';
import { formatDateWithWeekday, formatDayMonth } from '../../src/domain/date';
import { beatTarget, exerciseNotes, exerciseSessions, repMaxes, strengthCurve } from '../../src/domain/records';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';

/**
 * Exercise detail. This used to be a system alert with the instructions crammed
 * into its body — no history, no personal best, no way to act on it.
 */
export default function ExerciseDetail() {
  const { id, select } = useLocalSearchParams<{ id: string; select?: string }>();
  const selectMode = select === '1';

  const units = useProfileStore((s) => s.profile.units);
  const experience = useProfileStore((s) => s.profile.experience);
  const exercise = useWorkoutStore((s) => s.allExercises().find((e) => e.id === id) ?? null);
  const workouts = useWorkoutStore((s) => s.completedWorkouts());
  const prs = useWorkoutStore((s) => s.prs);
  const previousFor = useWorkoutStore((s) => s.previousFor);
  const recommendationFor = useWorkoutStore((s) => s.recommendationFor);
  const addToActive = useWorkoutStore((s) => s.addExerciseToActive);
  const activeId = useWorkoutStore((s) => s.activeId);

  // Best estimated 1RM per session, oldest first.
  const series: Point[] = useMemo(() => {
    if (!exercise) return [];
    return [...workouts]
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .flatMap((w) => {
        const ex = w.exercises.find((e) => e.exerciseId === exercise.id);
        if (!ex) return [];
        let best = 0;
        for (const s of ex.sets) if (s.completed && s.weightKg && s.reps) best = Math.max(best, epley1RM(s.weightKg, s.reps));
        if (best <= 0) return [];
        return [{ label: w.date.slice(5), value: units === 'imperial' ? Math.round(kgToLb(best)) : Math.round(best) }];
      });
  }, [exercise, workouts, units]);

  const maxes = useMemo(() => (exercise ? repMaxes(workouts, exercise.id) : []), [workouts, exercise]);
  const history = useMemo(() => (exercise ? exerciseSessions(workouts, exercise.id) : []), [workouts, exercise]);
  const toBeat = useMemo(() => (exercise ? beatTarget(workouts, exercise.id) : null), [workouts, exercise]);
  const notes = useMemo(() => (exercise ? exerciseNotes(workouts, exercise.id) : []), [workouts, exercise]);
  const curve = useMemo(() => (exercise ? strengthCurve(workouts, exercise.id) : []), [workouts, exercise]);

  if (!exercise) {
    return (
      <Screen gradient>
        <ScreenHeader title="Exercise" />
        <EmptyState icon="search" title="Exercise not found" subtitle="It may have been removed from your library." />
      </Screen>
    );
  }

  const prev = previousFor(exercise.id);
  const rec = recommendationFor(exercise.id, experience, units);
  const best = prs[exercise.id] ?? 0;
  const bestDisp = best > 0 ? displayWeight(best, units) : null;
  const sessions = workouts.filter((w) => w.exercises.some((e) => e.exerciseId === exercise.id)).length;

  const add = () => {
    addToActive(exercise.id);
    router.back();
  };

  return (
    <Screen
      gradient
      footer={
        selectMode || activeId ? (
          <Button title={selectMode ? 'Add to workout' : 'Add to current workout'} size="lg" onPress={add} />
        ) : undefined
      }
    >
      <ScreenHeader title={exercise.name} />

      <FadeIn>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <MuscleThumb muscle={exercise.primaryMuscle} secondary={exercise.secondaryMuscles} size={66} />
          <View style={{ flex: 1, gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              <Pill label={label(exercise.primaryMuscle)} color={colors.primary} />
              <Pill label={label(exercise.equipment)} color={colors.textDim} />
            </View>
            <Text variant="caption" color={colors.textDim}>
              {label(exercise.category)} · {label(exercise.difficulty)}
              {exercise.isUnilateral ? ' · one side at a time' : ''}
            </Text>
            {exercise.secondaryMuscles.length > 0 && (
              <Text variant="caption" color={colors.textFaint}>
                Also works {exercise.secondaryMuscles.map(label).join(', ').toLowerCase()}
              </Text>
            )}
          </View>
        </Card>
      </FadeIn>

      <Card style={{ flexDirection: 'row', marginTop: spacing.md }}>
        <StatTile value={`${sessions}`} label="Sessions" accent={colors.primary} />
        <StatTile
          value={bestDisp ? `${Math.round(bestDisp.value)} ${bestDisp.unit}` : '—'}
          label="Best e1RM"
          accent={colors.protein}
        />
        <StatTile
          value={prev ? `${Math.round(displayWeight(prev.weightKg, units).value)} × ${prev.reps}` : '—'}
          label="Last time"
          accent={colors.water}
        />
      </Card>

      {/* The factual version: the exact set from last time and the smallest
          honest way past it. The suggested-next card below is the algorithm's
          opinion, which is a different thing and reads better beside it. */}
      {toBeat && (
        <Card style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <Text variant="overline" color={colors.amber}>TO BEAT</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Text variant="h3">
              {Math.round(displayWeight(toBeat.weightKg, units).value)} {displayWeight(toBeat.weightKg, units).unit} ×{' '}
              {toBeat.targetReps}
            </Text>
            <Text variant="caption" color={colors.textDim}>
              your top set on {formatDayMonth(toBeat.date)} was × {toBeat.reps}
            </Text>
          </View>
          <Text variant="caption" color={colors.textFaint}>
            Same weight, one more rep — the smallest step that still counts as progress.
          </Text>
        </Card>
      )}

      {rec && (
        <Card tone="alt" style={{ marginTop: spacing.md }}>
          <Text variant="overline" color={colors.primary}>
            SUGGESTED NEXT
          </Text>
          <Text variant="h3" style={{ marginTop: 4 }}>
            {Math.round(displayWeight(rec.weightKg, units).value)} {displayWeight(rec.weightKg, units).unit} × {rec.reps}
          </Text>
          <Text variant="caption" color={colors.textDim} style={{ marginTop: 4 }}>
            {rec.rationale}
          </Text>
        </Card>
      )}

      <SectionHeader title="How to do it" />
      <Card>
        {exercise.instructions.map((line, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm }}>
            <Text variant="bodyStrong" color={colors.primary} style={{ width: 16 }}>
              {i + 1}
            </Text>
            <Text variant="body" style={{ flex: 1 }}>
              {line}
            </Text>
          </View>
        ))}
      </Card>

      {curve.length > 1 && (
        <>
          <SectionHeader title="Strength curve" />
          <Card style={{ gap: spacing.md }}>
            {/* Heaviest load ever moved for each rep count. A set of 100 x 8
                proves 100 x 5, so every lower count is credited too — otherwise
                the curve has holes wherever you did not stop at a round
                number. */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 110 }}>
              {curve.map((p) => {
                const peak = Math.max(...curve.map((x) => x.weightKg));
                const d = displayWeight(p.weightKg, units);
                return (
                  <View key={p.reps} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
                    <Text variant="caption" color={colors.textFaint} style={{ fontSize: 8 }}>
                      {Math.round(d.value)}
                    </Text>
                    <View
                      style={{
                        width: '100%',
                        height: Math.max(4, Math.round((p.weightKg / peak) * 78)),
                        borderRadius: 3,
                        backgroundColor: colors.primary,
                        opacity: 0.45 + 0.55 * (p.weightKg / peak),
                      }}
                    />
                    <Text variant="caption" color={colors.textFaint} style={{ fontSize: 9 }}>
                      {p.reps}
                    </Text>
                  </View>
                );
              })}
            </View>
            <Text variant="caption" color={colors.textFaint}>
              Best weight for at least that many reps, across everything you have logged.
            </Text>
          </Card>
        </>
      )}

      {notes.length > 0 && (
        <>
          <SectionHeader title={`Your notes · ${notes.length}`} />
          <Card style={{ gap: spacing.md }}>
            {/* Notes used to be write-only: you could record a cue and never
                see it again, which makes the field a diary nobody reads. */}
            {notes.map((n) => (
              <View key={`${n.workoutId}_${n.date}`} style={{ gap: 2 }}>
                <Text variant="caption" color={colors.textFaint}>
                  {formatDayMonth(n.date)} · {n.workoutName}
                </Text>
                <Text variant="body" color={colors.textDim}>{n.note}</Text>
              </View>
            ))}
          </Card>
        </>
      )}

      <SectionHeader title="Estimated 1RM over time" />
      <Card>
        <LineChart data={series} color={colors.primary} unit={units === 'imperial' ? ' lb' : ' kg'} />
      </Card>

      {maxes.length > 0 && (
        <>
          <SectionHeader title="Rep maxes" />
          <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
            {maxes.map((m, i) => {
              const w = displayWeight(m.weightKg, units);
              return (
                <View key={m.reps} style={[styles.row, i < maxes.length - 1 && styles.rowBorder]}>
                  <Text variant="bodyStrong" style={{ width: 66 }}>
                    {m.reps} {m.reps === 1 ? 'rep' : 'reps'}
                  </Text>
                  <Text variant="caption" color={colors.textFaint} style={{ flex: 1, minWidth: 0 }}>
                    {formatDayMonth(m.date)}
                  </Text>
                  <Text variant="bodyStrong" color={colors.amber}>
                    {w.value} {w.unit}
                  </Text>
                </View>
              );
            })}
          </Card>
          <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
            Weights you have actually lifted for at least that many reps — a set of eight counts towards your five.
          </Text>
        </>
      )}

      {history.length > 0 && (
        <>
          <SectionHeader title={`Session history · ${history.length}`} />
          <View style={{ gap: spacing.md }}>
            {history.map((session) => {
              const vol = displayVolume(session.volumeKg, units);
              return (
                <Card key={session.workoutId} onPress={() => router.push(`/workout/${session.workoutId}`)}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {formatDateWithWeekday(session.date)}
                      </Text>
                      <Text variant="caption" color={colors.textFaint} numberOfLines={1}>
                        {session.workoutName}
                      </Text>
                    </View>
                    <Text variant="caption" color={colors.textDim}>
                      {vol.value} {vol.unit}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
                    {session.sets.map((set, i) => {
                      const w = set.weightKg != null ? displayWeight(set.weightKg, units) : null;
                      return (
                        <View
                          key={i}
                          style={[styles.setChip, set.isPr && styles.setChipPr, set.warmup && styles.setChipWarmup]}
                        >
                          <Text variant="caption" color={set.isPr ? colors.amber : set.warmup ? colors.textFaint : colors.text}>
                            {w ? `${Math.round(w.value * 10) / 10}` : '—'} × {set.reps ?? '—'}
                            {set.rpe ? ` @${set.rpe}` : ''}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </Card>
              );
            })}
          </View>
        </>
      )}

      <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.md }}>
        Estimated 1RM is a calculation from your logged sets, not a tested max. Train within your own limits and get
        coaching on technique if you are unsure.
      </Text>
    </Screen>
  );
}

const label = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  setChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceHigh,
  },
  setChipPr: { backgroundColor: 'rgba(255,176,32,0.14)', borderWidth: 1, borderColor: 'rgba(255,176,32,0.4)' },
  setChipWarmup: { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
});

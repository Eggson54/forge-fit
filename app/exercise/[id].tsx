import React, { useMemo } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, EmptyState, LineChart, Pill, Screen, SectionHeader, StatTile, Text, type Point } from '../../src/components/ui';
import { FadeIn } from '../../src/components/anim';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { MuscleThumb } from '../../src/components/body/MuscleThumb';
import { colors, spacing } from '../../src/theme';
import { epley1RM } from '../../src/domain/strength';
import { displayWeight, kgToLb } from '../../src/domain/units';
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

      <SectionHeader title="Estimated 1RM over time" />
      <Card>
        <LineChart data={series} color={colors.primary} unit={units === 'imperial' ? ' lb' : ' kg'} />
      </Card>

      <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.md }}>
        Estimated 1RM is a calculation from your logged sets, not a tested max. Train within your own limits and get
        coaching on technique if you are unsure.
      </Text>
    </Screen>
  );
}

const label = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

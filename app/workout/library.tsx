import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Chip, Input, Screen, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { MuscleThumb } from '../../src/components/body/MuscleThumb';
import { colors, layout, radius, spacing } from '../../src/theme';
import type { Equipment, Exercise, MuscleGroup } from '../../src/domain/types';
import { recentExerciseIds } from '../../src/domain/history';
import { MUSCLE_GROUPS } from '../../src/data/exercises';
import { useRoutineStore } from '../../src/stores/useRoutineStore';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';

export default function ExerciseLibrary() {
  const params = useLocalSearchParams<{ select?: string; pick?: string }>();
  const selectMode = params.select === '1';
  // "pick" hands the chosen exercise back to the routine builder instead of
  // adding it to a live session.
  const pickMode = params.pick === '1';
  const allExercises = useWorkoutStore((s) => s.allExercises());
  const addToActive = useWorkoutStore((s) => s.addExerciseToActive);
  const addCustom = useWorkoutStore((s) => s.addCustomExercise);
  const addDraftExercise = useRoutineStore((s) => s.addDraftExercise);

  /** Sensible starting sets/reps/rest for a routine, by exercise category. */
  const addToDraft = (e: Exercise) =>
    addDraftExercise({
      exerciseId: e.id,
      name: e.name,
      primaryMuscle: e.primaryMuscle,
      sets: 3,
      targetReps: e.category === 'compound' ? 6 : 10,
      restSeconds: e.category === 'compound' ? 150 : 75,
    });

  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | 'all'>('all');
  const [equipment, setEquipment] = useState<Equipment | 'all'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allExercises.filter(
      (e) =>
        (muscle === 'all' || e.primaryMuscle === muscle || e.secondaryMuscles.includes(muscle)) &&
        (equipment === 'all' || e.equipment === equipment) &&
        (!q || e.name.toLowerCase().includes(q)),
    );
  }, [allExercises, query, muscle, equipment]);

  // Most people rotate through a handful of lifts, so the ones they actually
  // train beat scrolling sixty entries — but only while nothing is filtered,
  // where they'd otherwise contradict the filter the user just set.
  const completed = useWorkoutStore((s) => s.completedWorkouts());
  const favouriteIds = useWorkoutStore((s) => s.favouriteExerciseIds);
  const toggleFavourite = useWorkoutStore((s) => s.toggleFavourite);
  const unfiltered = !query.trim() && muscle === 'all' && equipment === 'all';

  /**
   * With eighty-five entries an unbroken list has no landmarks, so the full
   * library is split by muscle. Once a filter is on, the filter IS the
   * grouping and a single run of results reads better.
   */
  const groups = useMemo(() => {
    if (filtered.length === 0) return [];
    if (!unfiltered) return [{ muscle: null as MuscleGroup | null, items: filtered }];
    const order = MUSCLE_GROUPS as readonly MuscleGroup[];
    const out: { muscle: MuscleGroup | null; items: Exercise[] }[] = [];
    for (const m of order) {
      const items = filtered.filter((e) => e.primaryMuscle === m);
      if (items.length > 0) out.push({ muscle: m, items });
    }
    return out;
  }, [filtered, unfiltered]);
  const recent = useMemo(() => {
    if (!unfiltered) return [];
    const byId = new Map(allExercises.map((e) => [e.id, e]));
    // Starred lifts lead, then the ones trained most recently. A favourite is
    // an explicit choice; a recent is an inference, and the explicit one wins.
    const favourites = favouriteIds.map((id) => byId.get(id)).filter((e): e is Exercise => !!e);
    const seen = new Set(favourites.map((e) => e.id));
    const recents = recentExerciseIds(completed, 8)
      .filter((id) => !seen.has(id))
      .map((id) => byId.get(id))
      .filter((e): e is Exercise => !!e);
    return [...favourites, ...recents].slice(0, 10);
  }, [completed, allExercises, unfiltered, favouriteIds]);

  // In select mode the tap adds straight to the session; otherwise it opens the
  // full detail screen, which used to be a system alert with the instructions
  // crammed into its body.
  const onPick = (e: Exercise) => {
    if (pickMode) {
      addToDraft(e);
      router.back();
    } else if (selectMode) {
      addToActive(e.id);
      router.back();
    } else {
      router.push(`/exercise/${e.id}`);
    }
  };

  const createCustom = () => {
    if (!query.trim()) {
      Alert.alert('Name your exercise', 'Type a name in the search box, then tap Create.');
      return;
    }
    const created = addCustom({
      name: query.trim(),
      primaryMuscle: muscle === 'all' ? 'full_body' : muscle,
      secondaryMuscles: [],
      equipment: 'full_gym',
      category: 'compound',
      difficulty: 'beginner',
      instructions: ['Custom exercise.'],
    });
    if (pickMode) {
      addToDraft(created);
      router.back();
    } else if (selectMode) {
      addToActive(created.id);
      router.back();
    } else {
      setQuery('');
    }
  };

  return (
    <Screen gradient>
      <ScreenHeader title={selectMode || pickMode ? 'Add Exercise' : 'Exercise Library'} />
      <Input icon="search" value={query} onChangeText={setQuery} placeholder="Search exercises" autoCapitalize="none" />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginVertical: spacing.md, marginHorizontal: -layout.screenPadding }}
        contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: layout.screenPadding }}
      >
        <Chip label="All" selected={muscle === 'all'} onPress={() => setMuscle('all')} />
        {MUSCLE_GROUPS.map((m) => (
          <Chip key={m} label={label(m)} selected={muscle === m} onPress={() => setMuscle(m)} />
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: spacing.md, marginHorizontal: -layout.screenPadding }}
        contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: layout.screenPadding, alignItems: 'center' }}
      >
        <Icon name="sliders" size={14} color={colors.textFaint} strokeWidth={1.8} />
        <Chip label="Any kit" selected={equipment === 'all'} onPress={() => setEquipment('all')} />
        {EQUIPMENT.map((eq) => (
          <Chip key={eq} label={label(eq)} selected={equipment === eq} onPress={() => setEquipment(eq)} />
        ))}
      </ScrollView>

      {recent.length > 0 && (
        <View style={{ marginBottom: spacing.md }}>
          <Text variant="overline" color={colors.textDim} style={{ marginBottom: spacing.sm }}>
            Your lifts
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -layout.screenPadding }}
            contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: layout.screenPadding }}
          >
            {recent.map((e) => (
              <Pressable key={e.id} onPress={() => onPick(e)} style={styles.recent}>
                {/* A dot rather than the figure: at chip size the body reads as
                    noise, and the tint already carries the muscle group. */}
                {favouriteIds.includes(e.id) ? (
                  <Icon name="star" size={11} filled color={colors.amber} />
                ) : (
                  <View style={[styles.dot, { backgroundColor: muscleTint(e.primaryMuscle) }]} />
                )}
                <Text variant="label" numberOfLines={1} style={{ maxWidth: 150 }}>
                  {e.name}
                </Text>
                {(selectMode || pickMode) && <Icon name="plus" size={14} color={colors.primary} strokeWidth={2.2} />}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <View>
        {filtered.length > 0 && (
          <Text variant="overline" color={colors.textDim} style={{ marginBottom: spacing.sm }}>
            {filtered.length} exercise{filtered.length === 1 ? '' : 's'}
          </Text>
        )}
        {groups.map(({ muscle: groupMuscle, items }) => (
          <View key={groupMuscle ?? 'all'} style={{ marginBottom: spacing.md }}>
            {groupMuscle && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
                <View style={{ width: 3, height: 12, borderRadius: 2, backgroundColor: muscleTint(groupMuscle) }} />
                <Text variant="overline" color={colors.textDim} style={{ flex: 1, minWidth: 0 }}>
                  {label(groupMuscle)}
                </Text>
                <Text variant="caption" color={colors.textFaint}>{items.length}</Text>
              </View>
            )}
            <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
              {items.map((e, i) => (
                <Pressable
                  key={e.id}
                  onPress={() => onPick(e)}
                  style={({ pressed }) => [
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.md,
                      paddingVertical: spacing.md,
                      borderBottomWidth: i === items.length - 1 ? 0 : StyleSheet.hairlineWidth,
                      borderBottomColor: colors.border,
                    },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <MuscleThumb muscle={e.primaryMuscle} secondary={e.secondaryMuscles} size={30} color={muscleTint(e.primaryMuscle)} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {e.name}
                      {e.isCustom ? ' · custom' : ''}
                    </Text>
                    <Text variant="caption" color={colors.textDim} numberOfLines={1}>
                      {label(e.primaryMuscle)} · {e.equipment} · {e.difficulty}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => toggleFavourite(e.id)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`${favouriteIds.includes(e.id) ? 'Unstar' : 'Star'} ${e.name}`}
                  >
                    <Icon
                      name="star"
                      size={17}
                      filled={favouriteIds.includes(e.id)}
                      color={favouriteIds.includes(e.id) ? colors.amber : colors.textFaint}
                      strokeWidth={1.7}
                    />
                  </Pressable>
                  {selectMode || pickMode ? <Icon name="plus" size={20} color={colors.primary} /> : <Text color={colors.textFaint}>›</Text>}
                </Pressable>
              ))}
            </Card>
          </View>
        ))}
        {filtered.length === 0 && (
          <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}>
            <Text variant="body" color={colors.textDim} center>
              {query.trim() ? `No matches for "${query}".` : 'Nothing matches those filters.'}
            </Text>
            <Button title={`Create "${query}"`} variant="secondary" fullWidth={false} onPress={createCustom} />
          </View>
        )}
      </View>

      {filtered.length > 0 && (
        <Pressable onPress={createCustom} style={{ paddingVertical: spacing.lg, alignItems: 'center' }}>
          <Text variant="label" color={colors.primary}>
            + Create a custom exercise
          </Text>
        </Pressable>
      )}
    </Screen>
  );
}

const EQUIPMENT: Equipment[] = ['bodyweight', 'dumbbells', 'barbell', 'kettlebell', 'machines', 'cables', 'bands', 'full_gym'];

const label = (m: string) => m.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const styles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4 },
  recent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
  },
});

/**
 * A muscle's tint in the results list. Grouping by colour makes a long scroll
 * scannable without an icon per row.
 */
const MUSCLE_TINTS: Partial<Record<MuscleGroup, string>> = {
  chest: colors.calorie,
  back: colors.water,
  shoulders: colors.amber,
  biceps: colors.protein,
  triceps: colors.protein,
  forearms: colors.protein,
  quads: colors.sleep,
  hamstrings: colors.sleep,
  glutes: colors.sleep,
  calves: colors.sleep,
  core: colors.carbs,
  full_body: colors.textDim,
};
const muscleTint = (m: MuscleGroup) => MUSCLE_TINTS[m] ?? colors.textDim;

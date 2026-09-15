import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Chip, Input, Screen, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { MuscleThumb } from '../../src/components/body/MuscleThumb';
import { colors, layout, spacing } from '../../src/theme';
import type { Exercise, MuscleGroup } from '../../src/domain/types';
import { MUSCLE_GROUPS } from '../../src/data/exercises';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';

export default function ExerciseLibrary() {
  const params = useLocalSearchParams<{ select?: string }>();
  const selectMode = params.select === '1';
  const allExercises = useWorkoutStore((s) => s.allExercises());
  const addToActive = useWorkoutStore((s) => s.addExerciseToActive);
  const addCustom = useWorkoutStore((s) => s.addCustomExercise);

  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | 'all'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allExercises.filter(
      (e) => (muscle === 'all' || e.primaryMuscle === muscle || e.secondaryMuscles.includes(muscle)) && (!q || e.name.toLowerCase().includes(q)),
    );
  }, [allExercises, query, muscle]);

  const onPick = (e: Exercise) => {
    if (selectMode) {
      addToActive(e.id);
      router.back();
    } else {
      Alert.alert(e.name, `${label(e.primaryMuscle)} · ${e.equipment} · ${e.category}\n\n${e.instructions.join('\n')}`);
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
    if (selectMode) {
      addToActive(created.id);
      router.back();
    } else {
      setQuery('');
    }
  };

  return (
    <Screen gradient>
      <ScreenHeader title={selectMode ? 'Add Exercise' : 'Exercise Library'} />
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

      <View>
        {filtered.length > 0 && (
          <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
            {filtered.map((e, i) => (
              <Pressable
                key={e.id}
                onPress={() => onPick(e)}
                style={({ pressed }) => [
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.md,
                    paddingVertical: spacing.md,
                    borderBottomWidth: i === filtered.length - 1 ? 0 : StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <MuscleThumb muscle={e.primaryMuscle} secondary={e.secondaryMuscles} size={30} color={muscleTint(e.primaryMuscle)} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">
                    {e.name}
                    {e.isCustom ? ' · custom' : ''}
                  </Text>
                  <Text variant="caption" color={colors.textDim}>
                    {label(e.primaryMuscle)} · {e.equipment} · {e.difficulty}
                  </Text>
                </View>
                {selectMode ? <Icon name="plus" size={20} color={colors.primary} /> : <Text color={colors.textFaint}>›</Text>}
              </Pressable>
            ))}
          </Card>
        )}
        {filtered.length === 0 && (
          <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}>
            <Text variant="body" color={colors.textDim}>
              No matches for "{query}".
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

const label = (m: MuscleGroup) => m.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

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

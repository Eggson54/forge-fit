import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Card, EmptyState, Screen, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { MuscleThumb } from '../../src/components/body/MuscleThumb';
import { Icon } from '../../src/components/Icon';
import { colors, spacing } from '../../src/theme';
import { substitutesFor } from '../../src/domain/tracking';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';

/**
 * Swap the movement without losing the row. The situation this exists for is
 * standing in front of an occupied rack, so it leads with what trains the same
 * muscle using kit the athlete actually listed.
 */
export default function SwapExercise() {
  const { weId } = useLocalSearchParams<{ weId: string }>();
  const active = useWorkoutStore((s) => s.workouts.find((w) => w.id === s.activeId) ?? null);
  const allExercises = useWorkoutStore((s) => s.allExercises());
  const swap = useWorkoutStore((s) => s.swapExercise);
  const equipment = useProfileStore((s) => s.profile.equipment ?? []);

  const row = active?.exercises.find((e) => e.id === weId);
  const current = row && allExercises.find((e) => e.id === row.exerciseId);

  if (!row || !current) {
    return (
      <Screen gradient>
        <ScreenHeader title="Swap" />
        <EmptyState icon="repeat" title="Nothing to swap" subtitle="That exercise is no longer in this session." />
      </Screen>
    );
  }

  const options = substitutesFor(current, allExercises, equipment);

  return (
    <Screen gradient>
      <ScreenHeader title={`Swap ${current.name}`} />

      <Card tone="alt" style={{ marginBottom: spacing.md }}>
        <Text variant="caption" color={colors.textDim}>
          Same muscle, kit you listed in your profile. Your sets and rest stay as they are — only the movement changes.
        </Text>
      </Card>

      {options.length === 0 ? (
        <EmptyState
          icon="search"
          title="No close match"
          subtitle="Nothing in the library trains the same muscle with your equipment. Browse the full library instead."
          action="Browse library"
          onAction={() => router.replace('/workout/library?select=1')}
        />
      ) : (
        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          {options.map((option, i) => (
            <Pressable
              key={option.id}
              onPress={() => {
                swap(row.id, option.id);
                router.back();
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, i < options.length - 1 && styles.border, pressed && { opacity: 0.6 }]}
            >
              <MuscleThumb muscle={option.primaryMuscle} secondary={option.secondaryMuscles} size={28} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {option.name}
                </Text>
                <Text variant="caption" color={colors.textDim}>
                  {option.equipment.replace('_', ' ')} · {option.category}
                </Text>
              </View>
              <Icon name="repeat" size={16} color={colors.primary} strokeWidth={1.9} />
            </Pressable>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  border: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});

import React from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, EmptyState, Screen, SectionHeader, Text } from '../../src/components/ui';
import { FadeIn, Stagger } from '../../src/components/anim';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { colors, radius, spacing } from '../../src/theme';
import { useRoutineStore } from '../../src/stores/useRoutineStore';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';

export default function Routines() {
  const routines = useRoutineStore((s) => s.routines);
  const startRoutine = useRoutineStore((s) => s.start);
  const removeRoutine = useRoutineStore((s) => s.remove);
  const duplicateRoutine = useRoutineStore((s) => s.duplicate);
  const startDraft = useRoutineStore((s) => s.startDraft);
  const saveFromWorkout = useRoutineStore((s) => s.saveFromWorkout);
  const experience = useProfileStore((s) => s.profile.experience);
  const recent = useWorkoutStore((s) => s.completedWorkouts().slice(0, 5));

  const start = (id: string) => {
    const wid = startRoutine(id, experience);
    if (wid) router.replace('/workout/active');
  };

  return (
    <Screen gradient>
      <ScreenHeader
        title="Routines"
        right={
          <Button
            title="New"
            size="sm"
            fullWidth={false}
            icon={<Icon name="plus" size={15} color={colors.onPrimary} />}
            onPress={() => router.push('/workout/routine-builder')}
          />
        }
      />
      <Text variant="caption" color={colors.textDim} style={{ marginBottom: spacing.md }}>
        Reusable workout templates. Start one anytime and it pre-loads your exercises and sets.
      </Text>

      {routines.length === 0 ? (
        <EmptyState
          icon="list"
          title="No routines yet"
          subtitle="Build one from scratch, or save a completed workout below to reuse it."
          action="Build a routine"
          onAction={() => router.push('/workout/routine-builder')}
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          <Stagger step={45}>
          {routines.map((r) => (
            <FadeIn key={r.id}>
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>{r.name}</Text>
                    <Text variant="caption" color={colors.textDim}>
                      {r.exercises.length} exercises · {r.exercises.reduce((a, e) => a + e.sets, 0)} sets
                    </Text>
                    <Text variant="caption" color={colors.textFaint} numberOfLines={1} style={{ marginTop: 2 }}>
                      {r.exercises.map((e) => e.name).join(' · ')}
                    </Text>
                  </View>
                  {/* Copying a routine and editing the copy is how most people
                      build a variant, so it sits beside edit rather than
                      behind a menu. */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                    <Pressable
                      onPress={() => {
                        startDraft(r);
                        router.push('/workout/routine-builder');
                      }}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${r.name}`}
                      style={iconBtn}
                    >
                      <Icon name="sliders" size={16} color={colors.textFaint} strokeWidth={1.8} />
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        const copy = duplicateRoutine(r.id);
                        if (copy) startDraft(copy);
                        if (copy) router.push('/workout/routine-builder');
                      }}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`Duplicate ${r.name}`}
                      style={iconBtn}
                    >
                      <Icon name="copy" size={16} color={colors.textFaint} strokeWidth={1.8} />
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        Alert.alert('Delete routine?', r.name, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => removeRoutine(r.id) },
                        ])
                      }
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${r.name}`}
                      style={iconBtn}
                    >
                      <Icon name="trash" size={16} color={colors.danger} strokeWidth={1.8} />
                    </Pressable>
                  </View>
                </View>
                <View style={{ marginTop: spacing.md }}>
                  <Button title="Start Routine" size="sm" icon={<Icon name="dumbbell" size={16} color={colors.onPrimary} />} onPress={() => start(r.id)} />
                </View>
              </Card>
            </FadeIn>
          ))}
          </Stagger>
        </View>
      )}

      {recent.length > 0 && (
        <>
          <SectionHeader title="Save a past workout as a routine" />
          <View style={{ gap: spacing.sm }}>
            {recent.map((w) => (
              <Card key={w.id} onPress={() => { saveFromWorkout(w); Alert.alert('Saved', `"${w.name}" saved as a routine.`); }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text variant="body">{w.name}</Text>
                    <Text variant="caption" color={colors.textDim}>{w.exercises.length} exercises</Text>
                  </View>
                  <Icon name="plus" size={20} color={colors.primary} />
                </View>
              </Card>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

// Icon-only actions need a real touch target, not just a visual one.
const iconBtn = {
  width: 36,
  height: 36,
  borderRadius: radius.sm,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

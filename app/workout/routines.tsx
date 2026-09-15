import React from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, EmptyState, Screen, SectionHeader, Text } from '../../src/components/ui';
import { FadeIn } from '../../src/components/anim';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { colors, spacing } from '../../src/theme';
import { useRoutineStore } from '../../src/stores/useRoutineStore';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';

export default function Routines() {
  const routines = useRoutineStore((s) => s.routines);
  const startRoutine = useRoutineStore((s) => s.start);
  const removeRoutine = useRoutineStore((s) => s.remove);
  const saveFromWorkout = useRoutineStore((s) => s.saveFromWorkout);
  const experience = useProfileStore((s) => s.profile.experience);
  const recent = useWorkoutStore((s) => s.completedWorkouts().slice(0, 5));

  const start = (id: string) => {
    const wid = startRoutine(id, experience);
    if (wid) router.replace('/workout/active');
  };

  return (
    <Screen gradient>
      <ScreenHeader title="Routines" />
      <Text variant="caption" color={colors.textDim} style={{ marginBottom: spacing.md }}>
        Reusable workout templates. Start one anytime and it pre-loads your exercises and sets.
      </Text>

      {routines.length === 0 ? (
        <EmptyState icon="list" title="No routines yet" subtitle="Save a completed workout below as a routine to reuse it." />
      ) : (
        <View style={{ gap: spacing.md }}>
          {routines.map((r) => (
            <FadeIn key={r.id}>
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{r.name}</Text>
                    <Text variant="caption" color={colors.textDim}>
                      {r.exercises.length} exercises · {r.exercises.reduce((a, e) => a + e.sets, 0)} sets
                    </Text>
                    <Text variant="caption" color={colors.textFaint} numberOfLines={1} style={{ marginTop: 2 }}>
                      {r.exercises.map((e) => e.name).join(' · ')}
                    </Text>
                  </View>
                  <Text variant="caption" color={colors.danger} onPress={() => Alert.alert('Delete routine?', r.name, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => removeRoutine(r.id) }])}>
                    Delete
                  </Text>
                </View>
                <View style={{ marginTop: spacing.md }}>
                  <Button title="Start Routine" size="sm" icon={<Icon name="dumbbell" size={16} color={colors.onPrimary} />} onPress={() => start(r.id)} />
                </View>
              </Card>
            </FadeIn>
          ))}
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

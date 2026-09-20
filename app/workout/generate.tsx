import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Button, Card, Chip, Screen, SectionHeader, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, spacing } from '../../src/theme';
import type { MuscleGroup } from '../../src/domain/types';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';
import { ai } from '../../src/services/ai';
import type { WorkoutGenResult } from '../../src/services/ai/types';
import { FREE_TIER_LIMITS } from '../../src/services/config';
import { muscleLabel as label } from '../../src/domain/volume';

const FOCUS_OPTIONS: MuscleGroup[] = ['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'glutes', 'biceps', 'triceps', 'core', 'full_body'];

export default function GenerateWorkout() {
  const profile = useProfileStore((s) => s.profile);
  const isPro = useProfileStore((s) => s.isPro());
  const startFromGenerated = useWorkoutStore((s) => s.startFromGenerated);

  const [focus, setFocus] = useState<MuscleGroup[]>([]);
  const [duration, setDuration] = useState(profile.preferredWorkoutMinutes);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WorkoutGenResult | null>(null);

  const toggleFocus = (m: MuscleGroup) =>
    setFocus((f) => (f.includes(m) ? f.filter((x) => x !== m) : [...f, m]));

  const generate = async () => {
    setLoading(true);
    try {
      const gen = await ai.generateWorkout({
        goal: profile.goal,
        experience: profile.experience,
        equipment: profile.equipment,
        durationMinutes: duration,
        focus: focus.length ? focus : undefined,
        daysPerWeek: profile.trainingDaysPerWeek,
      });
      setResult(gen);
    } finally {
      setLoading(false);
    }
  };

  const start = () => {
    if (!result) return;
    startFromGenerated(result, profile.experience);
    router.replace('/workout/active');
  };

  return (
    <Screen
      gradient
      footer={
        <View style={{ gap: spacing.sm }}>
          {result && <Button title="Start This Workout" onPress={start} size="lg" />}
          <Button
            title={result ? 'Regenerate' : 'Generate Workout'}
            variant={result ? 'secondary' : 'primary'}
            onPress={generate}
            loading={loading}
            size={result ? 'md' : 'lg'}
          />
        </View>
      }
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="AI Workout" />

      {!isPro && (
        <Card tone="alt" style={{ marginBottom: spacing.lg }}>
          <Text variant="caption" color={colors.textDim}>
            Free plan includes {FREE_TIER_LIMITS.aiWorkoutGenerationsPerWeek} AI generation/week. Go Pro for unlimited, smarter programming.
          </Text>
        </Card>
      )}

      <SectionHeader title="Target muscles (optional)" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {FOCUS_OPTIONS.map((m) => (
          <Chip key={m} label={label(m)} selected={focus.includes(m)} onPress={() => toggleFocus(m)} />
        ))}
      </View>

      <SectionHeader title="Duration" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {[30, 45, 60, 75].map((d) => (
          <Chip key={d} label={`${d} min`} selected={duration === d} onPress={() => setDuration(d)} />
        ))}
      </View>

      {/* What the generator is working from, so the inputs are not a black box. */}
      <SectionHeader title="Built from your profile" />
      <Card>
        <ProfileRow label="Goal" value={label(profile.goal)} />
        <ProfileRow label="Experience" value={label(profile.experience)} />
        <ProfileRow label="Equipment" value={profile.equipment.map(label).join(', ') || 'Bodyweight'} last />
      </Card>

      {result && (
        <Card style={{ marginTop: spacing.xl }}>
          <Text variant="h3">{result.name}</Text>
          <Text variant="caption" color={colors.textDim} style={{ marginBottom: spacing.md }}>
            ~{result.estimatedMinutes} min · {result.exercises.length} exercises
          </Text>
          {result.exercises.map((e, i) => (
            <View key={e.exerciseId + i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: i === result.exercises.length - 1 ? 0 : 0.5, borderBottomColor: colors.border }}>
              <Text variant="body">{e.name}</Text>
              <Text variant="label" color={colors.textDim}>
                {e.sets} × {e.reps[0]}-{e.reps[1]}
              </Text>
            </View>
          ))}
          <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.md }}>
            {result.note}
          </Text>
        </Card>
      )}
    </Screen>
  );
}

function ProfileRow({ label: name, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: spacing.lg,
        paddingVertical: spacing.sm,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
    >
      <Text variant="body" color={colors.textDim}>
        {name}
      </Text>
      <Text variant="bodyStrong" style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}


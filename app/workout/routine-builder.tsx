import React, { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, EmptyState, IconButton, Input, Screen, SectionHeader, Text } from '../../src/components/ui';
import { Stagger } from '../../src/components/anim';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { MuscleThumb } from '../../src/components/body/MuscleThumb';
import { colors, radius, spacing } from '../../src/theme';
import type { MuscleGroup } from '../../src/domain/types';
import { supersetLabel, toggleSupersetAt } from '../../src/domain/superset';
import { useRoutineStore, type RoutineExercise } from '../../src/stores/useRoutineStore';

/**
 * Build a routine from scratch. Routines could previously only be created by
 * finishing a workout and saving it, so there was no way to plan a session
 * before doing it once.
 */
export default function RoutineBuilder() {
  const params = useLocalSearchParams<{ id?: string }>();
  const routines = useRoutineStore((s) => s.routines);
  const draft = useRoutineStore((s) => s.draft);
  const startDraft = useRoutineStore((s) => s.startDraft);
  const setDraftName = useRoutineStore((s) => s.setDraftName);
  const setDraftExercises = useRoutineStore((s) => s.setDraftExercises);
  const commitDraft = useRoutineStore((s) => s.commitDraft);

  const existing = params.id ? routines.find((r) => r.id === params.id) : undefined;
  const items = draft.exercises;

  // Seed the draft once per entry. Coming back from the picker re-mounts this
  // screen, so re-seeding on every mount would wipe what was just added.
  const seeded = React.useRef(false);
  if (!seeded.current) {
    seeded.current = true;
    if (draft.editingId !== (existing?.id ?? null) || (!existing && draft.exercises.length === 0 && !draft.name)) {
      startDraft(existing);
    }
  }

  const focus = useMemo(() => {
    const seen = new Set<MuscleGroup>();
    for (const i of items) seen.add(i.primaryMuscle);
    return [...seen];
  }, [items]);

  const totalSets = items.reduce((a, i) => a + i.sets, 0);
  // Roughly: a working set plus its rest, which is what the session actually costs.
  const estMinutes = Math.round(items.reduce((a, i) => a + i.sets * (i.restSeconds + 40), 0) / 60);

  const setField = (idx: number, patch: Partial<RoutineExercise>) =>
    setDraftExercises(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    setDraftExercises(next);
  };

  const save = () => {
    if (items.length === 0) {
      Alert.alert('Add an exercise', 'A routine needs at least one exercise.');
      return;
    }
    if (!draft.name.trim()) setDraftName(suggestName(focus));
    commitDraft();
    router.back();
  };

  return (
    <Screen
      gradient
      footer={
        <Button
          title={existing ? 'Save changes' : 'Save routine'}
          size="lg"
          disabled={items.length === 0}
          onPress={save}
        />
      }
    >
      <ScreenHeader title={existing ? 'Edit Routine' : 'New Routine'} />

      <Input
        label="Name"
        value={draft.name}
        onChangeText={setDraftName}
        placeholder={suggestName(focus)}
        autoCapitalize="words"
      />

      {items.length > 0 && (
        <Card tone="alt" style={{ flexDirection: 'row', marginTop: spacing.md, gap: spacing.lg }}>
          <Summary value={`${items.length}`} label="Exercises" />
          <Summary value={`${totalSets}`} label="Working sets" />
          <Summary value={`~${estMinutes}m`} label="Estimated" />
        </Card>
      )}

      <SectionHeader
        title="Exercises"
        action="Add"
        onAction={() => router.push({ pathname: '/workout/library', params: { pick: '1' } })}
      />

      {items.length === 0 ? (
        <EmptyState
          icon="list"
          title="Nothing added yet"
          subtitle="Pick the exercises you want in this session, then set sets and reps."
          action="Browse exercises"
          onAction={() => router.push({ pathname: '/workout/library', params: { pick: '1' } })}
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Stagger step={40}>
            {items.map((it, idx) => {
              const pairedAbove = !!it.supersetGroup && it.supersetGroup === items[idx - 1]?.supersetGroup;
              const pairedBelow = !!it.supersetGroup && it.supersetGroup === items[idx + 1]?.supersetGroup;
              const letter = pairedAbove || pairedBelow ? supersetLetterAt(items, idx) : null;
              return (
              <View key={it.exerciseId} style={pairedAbove || pairedBelow ? styles.grouped : undefined}>
              <Card style={{ gap: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <MuscleThumb muscle={it.primaryMuscle} size={28} />
                  <Text variant="bodyStrong" style={{ flex: 1 }}>
                    {letter ? <Text variant="bodyStrong" color={colors.primary}>{letter} </Text> : null}
                    {it.name}
                  </Text>
                  <IconButton
                    accessibilityLabel={`Move ${it.name} up`}
                    size={32}
                    variant="surface"
                    onPress={() => move(idx, -1)}
                  >
                    <Text variant="bodyStrong" color={colors.textDim}>
                      ↑
                    </Text>
                  </IconButton>
                  <IconButton
                    accessibilityLabel={`Move ${it.name} down`}
                    size={32}
                    variant="surface"
                    onPress={() => move(idx, 1)}
                  >
                    <Text variant="bodyStrong" color={colors.textDim}>
                      ↓
                    </Text>
                  </IconButton>
                  <IconButton
                    accessibilityLabel={`Remove ${it.name}`}
                    size={32}
                    onPress={() => setDraftExercises(items.filter((_, i) => i !== idx))}
                  >
                    <Icon name="trash" size={15} color={colors.textFaint} strokeWidth={1.8} />
                  </IconButton>
                </View>

                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  <Stepper
                    label="Sets"
                    value={it.sets}
                    onChange={(v) => setField(idx, { sets: clamp(v, 1, 10) })}
                  />
                  <Stepper
                    label="Reps"
                    value={it.targetReps}
                    onChange={(v) => setField(idx, { targetReps: clamp(v, 1, 30) })}
                  />
                  <Stepper
                    label="Rest"
                    value={it.restSeconds}
                    step={15}
                    format={(v) => `${v}s`}
                    onChange={(v) => setField(idx, { restSeconds: clamp(v, 15, 300) })}
                  />
                </View>
              </Card>
              {idx < items.length - 1 && (
                <Pressable
                  onPress={() => setDraftExercises(toggleSupersetAt(items, idx))}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={pairedBelow ? 'Break this superset here' : 'Superset with the next exercise'}
                  style={styles.linkButton}
                >
                  <Icon name={pairedBelow ? 'link_off' : 'repeat'} size={13} color={pairedBelow ? colors.primary : colors.textFaint} strokeWidth={1.9} />
                  <Text variant="caption" color={pairedBelow ? colors.primary : colors.textFaint}>
                    {pairedBelow ? 'Superset — tap to unlink' : 'Superset with next'}
                  </Text>
                </Pressable>
              )}
              </View>
              );
            })}
          </Stagger>
        </View>
      )}
    </Screen>
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A/B/C for an exercise's position inside the run of pairings it belongs to. */
function supersetLetterAt(items: RoutineExercise[], idx: number): string {
  let start = idx;
  while (start > 0 && items[start - 1]?.supersetGroup === items[idx]?.supersetGroup) start -= 1;
  return supersetLabel(idx - start);
}

const styles = StyleSheet.create({
  grouped: {
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
    paddingLeft: spacing.sm,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
});

function suggestName(focus: MuscleGroup[]): string {
  if (focus.length === 0) return 'New routine';
  const names = focus.slice(0, 2).map((m) => m.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
  return focus.length > 2 ? `${names.join(' & ')} +` : names.join(' & ');
}

function Summary({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="metric">{value}</Text>
      <Text variant="caption" color={colors.textDim}>
        {label}
      </Text>
    </View>
  );
}

function Stepper({
  label,
  value,
  onChange,
  step = 1,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  format?: (v: number) => string;
}) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text variant="caption" color={colors.textDim}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <Nub label="−" accessibilityLabel={`Decrease ${label}`} onPress={() => onChange(value - step)} />
        <Text variant="bodyStrong">{format ? format(value) : value}</Text>
        <Nub label="+" accessibilityLabel={`Increase ${label}`} onPress={() => onChange(value + step)} />
      </View>
    </View>
  );
}

function Nub({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={({ pressed }) => [
        {
          width: 28,
          height: 28,
          borderRadius: radius.sm,
          backgroundColor: colors.surfaceHigh,
          alignItems: 'center',
          justifyContent: 'center',
        },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Text variant="bodyStrong" color={colors.primary}>
        {label}
      </Text>
    </Pressable>
  );
}

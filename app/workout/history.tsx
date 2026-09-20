import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Card, Chip, EmptyState, Input, Screen, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { MuscleThumb } from '../../src/components/body/MuscleThumb';
import { colors, domainAccent, spacing } from '../../src/theme';
import { formatDateWithWeekday, formatDurationShort } from '../../src/domain/date';
import { workoutStats } from '../../src/domain/strength';
import { displayVolume } from '../../src/domain/units';
import type { MuscleGroup, Units, Workout } from '../../src/domain/types';
import { MUSCLE_GROUPS } from '../../src/data/exercises';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { Icon } from '../../src/components/Icon';
import { muscleLabel as label } from '../../src/domain/volume';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface MonthGroup {
  key: string;
  label: string;
  workouts: Workout[];
  volumeKg: number;
}

export default function History() {
  const completed = useWorkoutStore((s) => s.completedWorkouts());
  const units = useProfileStore((s) => s.profile.units);

  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | 'all'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return completed.filter((w) => {
      if (muscle !== 'all' && !w.exercises.some((e) => e.primaryMuscle === muscle)) return false;
      if (!q) return true;
      // Search the exercises too: "deadlift" should find the session it was in,
      // not only sessions whose name happens to contain the word.
      return w.name.toLowerCase().includes(q) || w.exercises.some((e) => e.name.toLowerCase().includes(q));
    });
  }, [completed, query, muscle]);

  // Only the muscles that actually appear, so the filter never offers a chip
  // that returns nothing.
  const availableMuscles = useMemo(() => {
    const seen = new Set<MuscleGroup>();
    for (const w of completed) for (const e of w.exercises) seen.add(e.primaryMuscle);
    return MUSCLE_GROUPS.filter((m) => seen.has(m));
  }, [completed]);

  const groups = useMemo<MonthGroup[]>(() => {
    const byMonth = new Map<string, MonthGroup>();
    for (const w of [...filtered].sort((a, b) => (a.date < b.date ? 1 : -1))) {
      const d = new Date(`${w.date}T00:00:00`);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const group = byMonth.get(key) ?? {
        key,
        label: `${MONTHS[d.getMonth()]}${d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`}`,
        workouts: [],
        volumeKg: 0,
      };
      group.workouts.push(w);
      group.volumeKg += workoutStats(w).totalVolumeKg;
      byMonth.set(key, group);
    }
    return [...byMonth.values()];
  }, [filtered]);

  if (completed.length === 0) {
    return (
      <Screen gradient>
        <ScreenHeader title="Workout History" />
        <EmptyState
          icon="clock"
          title="No history yet"
          subtitle="Completed workouts show up here."
          action="Start a workout"
          onAction={() => router.replace('/(tabs)/workout')}
        />
      </Screen>
    );
  }

  return (
    <Screen gradient>
      <ScreenHeader title="Workout History" />

      <Input icon="search" value={query} onChangeText={setQuery} placeholder="Search sessions or exercises" autoCapitalize="none" />

      {availableMuscles.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: spacing.md, marginHorizontal: -spacing.xl }}
          contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.xl }}
        >
          <Chip label="All" selected={muscle === 'all'} onPress={() => setMuscle('all')} />
          {availableMuscles.map((m) => (
            <Chip key={m} label={label(m)} selected={muscle === m} onPress={() => setMuscle(m)} />
          ))}
        </ScrollView>
      )}

      {groups.length === 0 ? (
        <View style={{ paddingVertical: spacing.xxl }}>
          <Text variant="body" color={colors.textDim} center>
            Nothing matches that.
          </Text>
        </View>
      ) : (
        groups.map((group) => {
          const vol = displayVolume(group.volumeKg, units);
          return (
            <View key={group.key} style={{ marginTop: spacing.lg }}>
              <View style={styles.monthHeader}>
                <Text variant="overline" color={colors.textDim}>
                  {group.label}
                </Text>
                <Text variant="caption" color={colors.textFaint}>
                  {group.workouts.length} {group.workouts.length === 1 ? 'session' : 'sessions'} · {vol.value} {vol.unit}
                </Text>
              </View>
              <View style={{ gap: spacing.md }}>
                {group.workouts.map((w) => (
                  <HistoryRow key={w.id} workout={w} units={units} />
                ))}
              </View>
            </View>
          );
        })
      )}
    </Screen>
  );
}

function HistoryRow({ workout, units }: { workout: Workout; units: Units }) {
  const stats = workoutStats(workout);
  const vol = displayVolume(stats.totalVolumeKg, units);
  const prs = workout.exercises.reduce((a, e) => a + e.sets.filter((s) => s.isPr).length, 0);
  // The muscle that took the most volume: enough to tell a leg day from a push
  // day at a glance without listing every exercise.
  const lead = (Object.entries(stats.muscleVolume).sort((a, b) => b[1]! - a[1]!)[0]?.[0] ?? 'full_body') as MuscleGroup;

  return (
    <Card onPress={() => router.push(`/workout/${workout.id}`)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <MuscleThumb muscle={lead} size={28} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {workout.name}
          </Text>
          <Text variant="caption" color={colors.textDim}>
            {formatDateWithWeekday(workout.completedAt ?? workout.date)} · {formatDurationShort(workout.durationSeconds ?? 0)}
          </Text>
          <Text variant="caption" color={colors.textFaint} numberOfLines={1}>
            {workout.exercises.length} exercises · {stats.totalSets} sets
            {prs > 0 ? ` · ${prs} PR${prs === 1 ? '' : 's'}` : ''}
          </Text>
          {workout.gym && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <Icon name="map" size={11} color={domainAccent.gyms} strokeWidth={2} />
              <Text variant="caption" color={domainAccent.gyms} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                {workout.gym.name}
              </Text>
            </View>
          )}
        </View>
        <Text variant="bodyStrong" color={colors.primary}>
          {vol.value} {vol.unit}
        </Text>
      </View>
    </Card>
  );
}


const styles = StyleSheet.create({
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
});

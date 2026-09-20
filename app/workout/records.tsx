import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Card, Chip, EmptyState, Screen, SectionHeader, StatTile, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { FadeIn } from '../../src/components/anim';
import { MuscleThumb } from '../../src/components/body/MuscleThumb';
import { colors, radius, spacing } from '../../src/theme';
import { formatDateLong, formatDayMonth } from '../../src/domain/date';
import { personalRecords, recentPrEvents, type PersonalRecord } from '../../src/domain/records';
import { displayWeight } from '../../src/domain/units';
import { muscleLabel } from '../../src/domain/volume';
import type { MuscleGroup, Units } from '../../src/domain/types';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';

type Sort = 'strength' | 'recent' | 'improved';

const SORTS: { label: string; value: Sort }[] = [
  { label: 'Heaviest', value: 'strength' },
  { label: 'Newest', value: 'recent' },
  { label: 'Most improved', value: 'improved' },
];

export default function Records() {
  const units = useProfileStore((s) => s.profile.units);
  const workouts = useWorkoutStore((s) => s.completedWorkouts());
  const [sort, setSort] = useState<Sort>('strength');

  const records = useMemo(() => personalRecords(workouts), [workouts]);
  const events = useMemo(() => recentPrEvents(workouts, 8), [workouts]);

  // Read off the logged sessions rather than the library, so a custom exercise
  // is named the same way as a built-in one.
  const muscleById = useMemo(() => {
    const map: Record<string, MuscleGroup> = {};
    for (const w of workouts) for (const ex of w.exercises) map[ex.exerciseId] = ex.primaryMuscle;
    return map;
  }, [workouts]);

  const sorted = useMemo(() => {
    const copy = [...records];
    if (sort === 'recent') return copy.sort((a, b) => (a.best.date < b.best.date ? 1 : -1));
    // A lift with no second session has no observed improvement, so it sorts
    // last rather than being treated as 0%.
    if (sort === 'improved') return copy.sort((a, b) => (b.improvementPct ?? -1) - (a.improvementPct ?? -1));
    return copy;
  }, [records, sort]);

  const strongest = records[0] ?? null;
  const improved = useMemo(
    () => records.filter((r) => r.improvementPct != null).sort((a, b) => b.improvementPct! - a.improvementPct!)[0] ?? null,
    [records],
  );

  if (records.length === 0) {
    return (
      <Screen gradient>
        <ScreenHeader title="Personal Records" />
        <EmptyState
          icon="trophy"
          title="No records yet"
          subtitle="Complete a set with a weight and a rep count and it lands here."
          action="Start a workout"
          onAction={() => router.push('/(tabs)/workout')}
        />
      </Screen>
    );
  }

  return (
    <Screen gradient>
      <ScreenHeader title="Personal Records" />

      <Card style={{ flexDirection: 'row', marginBottom: spacing.md }}>
        <StatTile value={`${records.length}`} label="Lifts tracked" accent={colors.primary} />
        <StatTile
          value={strongest ? `${Math.round(displayWeight(strongest.best.e1RMKg, units).value)}` : '—'}
          label={`Top e1RM (${units === 'imperial' ? 'lb' : 'kg'})`}
          accent={colors.amber}
        />
        <StatTile
          value={improved?.improvementPct != null ? `+${improved.improvementPct}%` : '—'}
          label="Best gain"
          accent={colors.success}
        />
      </Card>

      {events.length > 0 && (
        <>
          <SectionHeader title="Recent records" />
          <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
            {events.map((e, i) => {
              const w = displayWeight(e.weightKg, units);
              return (
                <View key={`${e.workoutId}-${e.exerciseId}-${i}`} style={[styles.event, i < events.length - 1 && styles.border]}>
                  {/* The same trophy eight times in a column said nothing that
                      the heading did not. The muscle does. */}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="label" numberOfLines={1}>
                      {e.name}
                    </Text>
                    <Text variant="caption" color={colors.textFaint}>
                      {formatDayMonth(e.date)}
                      {muscleById[e.exerciseId] ? ` · ${muscleLabel(muscleById[e.exerciseId]!)}` : ''}
                    </Text>
                  </View>
                  <Text variant="bodyStrong" color={colors.amber}>
                    {w.value} {w.unit} × {e.reps}
                  </Text>
                </View>
              );
            })}
          </Card>
        </>
      )}

      <SectionHeader title="Every lift" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: spacing.md, marginHorizontal: -spacing.xl }}
        contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.xl }}
      >
        {SORTS.map((s) => (
          <Chip key={s.value} label={s.label} selected={sort === s.value} onPress={() => setSort(s.value)} />
        ))}
      </ScrollView>

      <View style={{ gap: spacing.md }}>
        {sorted.map((r) => (
          <FadeIn key={r.exerciseId}>
            <RecordCard record={r} units={units} />
          </FadeIn>
        ))}
      </View>

      <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.md }}>
        Estimated maxes come from the reps you actually logged, so they move with your best set rather than with a
        maximal attempt you never made.
      </Text>
    </Screen>
  );
}

function RecordCard({ record, units }: { record: PersonalRecord; units: Units }) {
  const best = displayWeight(record.best.e1RMKg, units);
  const heaviestW = displayWeight(record.heaviest.weightKg, units);
  const bestW = displayWeight(record.best.weightKg, units);
  // The heaviest set and the best estimated max are usually different sets;
  // showing one when they coincide would just repeat the same numbers.
  const sameSet = record.heaviest.date === record.best.date && record.heaviest.weightKg === record.best.weightKg && record.heaviest.reps === record.best.reps;

  return (
    <Card onPress={() => router.push(`/exercise/${record.exerciseId}`)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <MuscleThumb muscle={record.primaryMuscle as MuscleGroup} size={30} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {record.name}
          </Text>
          <Text variant="caption" color={colors.textDim}>
            {record.sessions} {record.sessions === 1 ? 'session' : 'sessions'}
            {record.improvementPct != null ? ` · ${record.improvementPct > 0 ? '+' : ''}${record.improvementPct}%` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="metric" color={colors.amber}>
            {Math.round(best.value)}
          </Text>
          <Text variant="caption" color={colors.textFaint}>
            e1RM {best.unit}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
        <Detail
          label="Best set"
          value={`${bestW.value} ${bestW.unit} × ${record.best.reps}`}
          sub={formatDateLong(record.best.date)}
        />
        {!sameSet && (
          <Detail
            label="Heaviest"
            value={`${heaviestW.value} ${heaviestW.unit} × ${record.heaviest.reps}`}
            sub={formatDateLong(record.heaviest.date)}
          />
        )}
      </View>
    </Card>
  );
}

function Detail({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={styles.detail}>
      <Text variant="caption" color={colors.textFaint}>
        {label}
      </Text>
      <Text variant="bodyStrong">{value}</Text>
      <Text variant="caption" color={colors.textDim}>
        {sub}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  event: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  border: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  detail: {
    flex: 1,
    minWidth: 0,
    gap: 1,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceHigh,
  },
});

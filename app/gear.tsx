import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Chip, EmptyState, Input, LinearProgress, Pill, Screen, SectionHeader, Text } from '../src/components/ui';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Icon } from '../src/components/Icon';
import { colors, spacing } from '../src/theme';
import { formatDistance } from '../src/domain/geo';
import { GEAR_LABEL, GEAR_NOTE, WEAR_LABEL, wearBand, type GearKind } from '../src/domain/gear';
import {
  GOALS_NOTE,
  METRIC_LABEL,
  PERIOD_LABEL,
  formatGoalValue,
  progressFor,
  suggestTarget,
  type GoalMetric,
  type GoalPeriod,
} from '../src/domain/goals';
import { useActivityStore } from '../src/stores/useActivityStore';
import { useGearStore } from '../src/stores/useGearStore';
import { useLogStore } from '../src/stores/useLogStore';
import { useProfileStore } from '../src/stores/useProfileStore';

const KINDS: GearKind[] = ['shoes', 'bike', 'other'];
const TYPES_FOR: Record<GearKind, string[]> = {
  shoes: ['run', 'walk', 'hike'],
  bike: ['ride'],
  other: ['run', 'ride', 'walk', 'hike', 'row', 'swim'],
};

const WEAR_TINT = {
  fresh: colors.success,
  worn: colors.steps,
  due: colors.amber,
  past: colors.danger,
} as const;

export default function GearAndGoals() {
  const ordered = useGearStore((s) => s.ordered());
  const goals = useGearStore((s) => s.goals);
  const addGear = useGearStore((s) => s.addGear);
  const retireGear = useGearStore((s) => s.retireGear);
  const removeGear = useGearStore((s) => s.removeGear);
  const updateGear = useGearStore((s) => s.updateGear);
  const addGoal = useGearStore((s) => s.addGoal);
  const removeGoal = useGearStore((s) => s.removeGoal);
  const activities = useActivityStore((s) => s.activities);
  const cardio = useLogStore((s) => s.cardio);
  const units = useProfileStore((s) => s.profile.units);

  const [addingGear, setAddingGear] = useState(false);
  const [kind, setKind] = useState<GearKind>('shoes');
  const [name, setName] = useState('');
  const [addingGoal, setAddingGoal] = useState(false);
  const [period, setPeriod] = useState<GoalPeriod>('week');
  const [metric, setMetric] = useState<GoalMetric>('distance');

  // Goals count recorded routes and typed-in conditioning alike: a goal that
  // ignored the treadmill would be measuring the recorder, not the training.
  const contributions = useMemo(
    () => [
      ...activities.map((a) => ({
        date: a.date, type: a.type, distanceM: a.distanceM,
        minutes: a.movingS / 60, ascentM: a.ascentM,
      })),
      ...cardio.map((c) => ({
        date: c.date, type: c.type, distanceM: (c.distanceKm ?? 0) * 1000,
        minutes: c.minutes, ascentM: 0,
      })),
    ],
    [activities, cardio],
  );

  const suggested = suggestTarget(period, metric, contributions);

  return (
    <Screen gradient>
      <ScreenHeader title="Gear & goals" />

      <SectionHeader title="Goals" />
      {goals.length === 0 ? (
        <EmptyState
          icon="target" compact tint={colors.lime}
          title="No goals set"
          subtitle="A weekly distance is the usual one. The point is knowing on a Wednesday, not on the last day."
        />
      ) : (
        goals.map((goal) => {
          const p = progressFor(goal, contributions);
          return (
            <Card key={goal.id} style={{ gap: spacing.sm, marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {PERIOD_LABEL[goal.period]} · {METRIC_LABEL[goal.metric]}
                </Text>
                <Pill label={p.onTrack ? 'On track' : 'Behind'} color={p.onTrack ? colors.success : colors.amber} />
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
                <Text variant="metric" color={p.onTrack ? colors.text : colors.amber}>
                  {formatGoalValue(p.done, goal.metric)}
                </Text>
                <Text variant="caption" color={colors.textDim}>
                  of {formatGoalValue(p.target, goal.metric)}
                </Text>
              </View>

              {/* Two bars: progress, and a tick where an even pace would be.
                  The tick is the whole point — a bar alone cannot say whether
                  40% on a Wednesday is good or bad. */}
              <View>
                <LinearProgress progress={Math.min(1, p.fraction)} color={p.onTrack ? colors.primary : colors.amber} />
                <View
                  style={[
                    styles.paceTick,
                    { left: `${Math.min(100, (p.expected / Math.max(1, p.target)) * 100)}%` },
                  ]}
                />
              </View>

              <Text variant="caption" color={colors.textDim}>{p.detail}</Text>
              <Button title="Remove" variant="ghost" onPress={() => removeGoal(goal.id)} />
            </Card>
          );
        })
      )}

      <Card style={{ gap: spacing.md }}>
        {addingGoal ? (
          <>
            <View style={styles.chips}>
              {(['week', 'month', 'year'] as GoalPeriod[]).map((p) => (
                <Chip key={p} label={PERIOD_LABEL[p]} selected={period === p} onPress={() => setPeriod(p)} />
              ))}
            </View>
            <View style={styles.chips}>
              {(['distance', 'time', 'elevation', 'activities'] as GoalMetric[]).map((m) => (
                <Chip key={m} label={METRIC_LABEL[m]} selected={metric === m} onPress={() => setMetric(m)} />
              ))}
            </View>
            <Text variant="caption" color={colors.textFaint}>
              {suggested
                ? `From what you have been doing, ${formatGoalValue(suggested, metric)} is about ten per cent more than usual.`
                : 'Not enough history yet to suggest a number, so pick one you believe.'}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  title={suggested ? `Set ${formatGoalValue(suggested, metric)}` : 'Set a default'}
                  onPress={() => {
                    addGoal({ period, metric, target: suggested ?? fallbackTarget(period, metric) });
                    setAddingGoal(false);
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Cancel" variant="ghost" onPress={() => setAddingGoal(false)} />
              </View>
            </View>
          </>
        ) : (
          <Button title="Add a goal" variant="secondary" onPress={() => setAddingGoal(true)} />
        )}
        <Text variant="caption" color={colors.textFaint}>{GOALS_NOTE}</Text>
      </Card>

      <SectionHeader title="Gear" />
      {ordered.length === 0 ? (
        <EmptyState
          icon="steps" compact tint={colors.lime}
          title="Nothing tracked"
          subtitle="Add the shoes you run in and every recorded run adds to their mileage. Nobody remembers when they bought them."
        />
      ) : (
        ordered.map((t) => {
          const band = wearBand(t.wear);
          return (
            <Card key={t.gear.id} style={{ gap: spacing.sm, marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Icon name={t.gear.kind === 'bike' ? 'bolt' : 'steps'} size={17} color={WEAR_TINT[band]} />
                <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{t.gear.name}</Text>
                {t.gear.isDefault && !t.gear.retiredOn && <Pill label="Default" color={colors.textDim} />}
                {t.wear != null && <Pill label={WEAR_LABEL[band]} color={WEAR_TINT[band]} />}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
                <Text variant="h3">{formatDistance(t.totalM, units)}</Text>
                <Text variant="caption" color={colors.textFaint}>
                  across {t.activities} {t.activities === 1 ? 'activity' : 'activities'}
                </Text>
              </View>

              {t.wear != null && <LinearProgress progress={Math.min(1, t.wear)} color={WEAR_TINT[band]} />}

              <Text variant="caption" color={colors.textDim}>{t.note}</Text>

              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {!t.gear.retiredOn && !t.gear.isDefault && (
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Make default"
                      variant="ghost"
                      onPress={() => {
                        for (const other of ordered) {
                          if (other.gear.kind === t.gear.kind) updateGear(other.gear.id, { isDefault: false });
                        }
                        updateGear(t.gear.id, { isDefault: true });
                      }}
                    />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Button
                    title={t.gear.retiredOn ? 'Un-retire' : 'Retire'}
                    variant="ghost"
                    onPress={() => retireGear(t.gear.id, !t.gear.retiredOn)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title="Delete" variant="ghost" onPress={() => removeGear(t.gear.id)} />
                </View>
              </View>
            </Card>
          );
        })
      )}

      <Card style={{ gap: spacing.md }}>
        {addingGear ? (
          <>
            <View style={styles.chips}>
              {KINDS.map((k) => (
                <Chip key={k} label={GEAR_LABEL[k]} selected={kind === k} onPress={() => setKind(k)} />
              ))}
            </View>
            <Input value={name} onChangeText={setName} placeholder={kind === 'bike' ? 'Road bike' : 'Pegasus 41'} />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Add"
                  onPress={() => {
                    addGear({ kind, name, types: TYPES_FOR[kind] });
                    setAddingGear(false);
                    setName('');
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Cancel" variant="ghost" onPress={() => setAddingGear(false)} />
              </View>
            </View>
          </>
        ) : (
          <Button title="Add gear" variant="secondary" onPress={() => setAddingGear(true)} />
        )}
        <Text variant="caption" color={colors.textFaint}>{GEAR_NOTE}</Text>
      </Card>
    </Screen>
  );
}

/** Something plausible when there is no history to suggest from. */
function fallbackTarget(period: GoalPeriod, metric: GoalMetric): number {
  const weekly: Record<GoalMetric, number> = { distance: 20_000, time: 150, elevation: 300, activities: 3 };
  const multiplier = period === 'week' ? 1 : period === 'month' ? 4.3 : 52;
  return Math.round(weekly[metric] * multiplier);
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  paceTick: {
    position: 'absolute', top: -3, width: 2, height: 14,
    backgroundColor: colors.text, opacity: 0.6, borderRadius: 1,
  },
});

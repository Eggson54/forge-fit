import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Card, Chip, Input, Screen, SectionHeader, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Barbell } from '../../src/components/Barbell';
import { colors, domainAccent, layout, radius, spacing } from '../../src/theme';
import { PLATES, planPlates, totalPlates } from '../../src/domain/plates';
import { barsAt, describeKit, isStandardKit, platesAt, smallestJump } from '../../src/domain/gymKit';
import { homeGym } from '../../src/domain/gymStats';
import { useGymStore } from '../../src/stores/useGymStore';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { Icon } from '../../src/components/Icon';

/**
 * Plate calculator. Answers the one question every lifter asks at the rack —
 * "what goes on each side?" — and is honest when a target is not loadable with
 * the plates on hand rather than silently rounding it.
 */
export default function PlateCalculator() {
  const params = useLocalSearchParams<{ target?: string; gymId?: string }>();
  const units = useProfileStore((s) => s.profile.units);
  const plates = useProfileStore((s) => s.profile.availablePlates);
  const setProfile = useProfileStore((s) => s.setProfile);
  const { width } = useWindowDimensions();

  // Which gym's kit to load from: the one passed in (from an active session),
  // otherwise the gym you train at most, otherwise nobody's in particular.
  const workouts = useWorkoutStore((st) => st.workouts);
  const gymsById = useGymStore((st) => st.gymsById());
  const kitFor = useGymStore((st) => st.kitFor);
  const home = useMemo(() => homeGym(workouts), [workouts]);
  const gymId = params.gymId ?? home?.gymId ?? null;
  const gym = gymId ? gymsById[gymId] : undefined;
  const kit = kitFor(gymId);

  const bars = useMemo(() => barsAt(units, kit), [units, kit]);
  const gymPlates = useMemo(() => platesAt(units, kit, plates), [units, kit, plates]);
  const [bar, setBar] = useState(bars[0]!);
  const [target, setTarget] = useState(params.target ?? String(units === 'imperial' ? 135 : 60));

  const unitLabel = units === 'imperial' ? 'lb' : 'kg';
  const value = parseFloat(target);
  const plan = useMemo(
    () => planPlates(isNaN(value) ? 0 : value, bar, units, gymPlates),
    [value, bar, units, gymPlates],
  );
  const step = smallestJump(units, kit, plates) || PLATES[units]![PLATES[units]!.length - 1]! * 2;

  const nudge = (d: number) => {
    const next = Math.max(0, Math.round(((isNaN(value) ? bar : value) + d) * 100) / 100);
    setTarget(String(next));
  };

  return (
    <Screen gradient>
      <ScreenHeader title="Plate Calculator" />

      <Card style={{ alignItems: 'center', gap: spacing.md }}>
        <Barbell plan={plan} width={Math.min(width - layout.screenPadding * 2 - spacing.lg * 2, 420)} />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <Nudge label="−" onPress={() => nudge(-step)} />
          <View style={{ alignItems: 'center', minWidth: 140 }}>
            <Text variant="metricLg">
              {plan.achievable}
              <Text variant="title" color={colors.textDim}>
                {' '}
                {unitLabel}
              </Text>
            </Text>
            <Text variant="caption" color={plan.delta === 0 ? colors.success : colors.amber}>
              {plan.belowBar
                ? 'Below the bar'
                : plan.delta === 0
                  ? 'Exact'
                  : `${plan.delta > 0 ? '+' : ''}${plan.delta} ${unitLabel} vs target`}
            </Text>
          </View>
          <Nudge label="+" onPress={() => nudge(step)} />
        </View>
      </Card>

      <SectionHeader title="Target" />
      <Input
        label={`Weight on the bar (${unitLabel})`}
        value={target}
        onChangeText={setTarget}
        keyboardType="decimal-pad"
        suffix={unitLabel}
      />

      <SectionHeader title="Bar" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {bars.map((b) => (
          <Chip
            key={b}
            label={b === 0 ? 'No bar' : `${b} ${unitLabel}`}
            selected={bar === b}
            onPress={() => setBar(b)}
          />
        ))}
      </View>

      <SectionHeader title="Per side" />
      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        {plan.perSide.length === 0 ? (
          <View style={{ paddingVertical: spacing.lg }}>
            <Text variant="body" color={colors.textDim}>
              {plan.belowBar ? 'That target is at or below the bar itself.' : 'Nothing to load.'}
            </Text>
          </View>
        ) : (
          plan.perSide.map((p, i) => (
            <View
              key={p.weight}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: spacing.md,
                borderBottomWidth: i === plan.perSide.length - 1 ? 0 : 0.5,
                borderBottomColor: colors.border,
              }}
            >
              <Text variant="bodyStrong">
                {p.weight} {unitLabel}
              </Text>
              <Text variant="metric" color={colors.primary}>
                ×{p.count}
              </Text>
            </View>
          ))
        )}
      </Card>

      {gym && (
        <Card
          onPress={() => router.push(`/gyms/${gym.id}`)}
          accent={domainAccent.gyms}
          style={{ marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
        >
          <Icon name="map" size={17} color={domainAccent.gyms} strokeWidth={1.8} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyStrong" numberOfLines={1}>{gym.name}</Text>
            <Text variant="caption" color={colors.textDim} numberOfLines={1}>
              {describeKit(kit, units)}
            </Text>
          </View>
          <Icon name="chevron_right" size={15} color={colors.textFaint} strokeWidth={2} />
        </Card>
      )}

      <SectionHeader title={gym ? 'Your default plates' : 'Plates in your gym'} />
      <Card>
        <Text variant="caption" color={colors.textDim} style={{ marginBottom: spacing.md }}>
          Deselect anything your gym does not have. The calculator only ever suggests plates you can actually reach for.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {PLATES[units]!.map((plate) => {
            // An empty list means "the standard set", so every plate reads as
            // selected until the athlete deselects one.
            const owned = !plates?.length || plates.includes(plate);
            return (
              <Pressable
                key={plate}
                onPress={() => {
                  const current = plates?.length ? plates : PLATES[units]!;
                  const next = owned ? current.filter((p) => p !== plate) : [...current, plate];
                  // Refusing to empty the list entirely: a bar with no plates
                  // is not a state the calculator can say anything useful about.
                  setProfile({ availablePlates: next.length ? next.sort((a, b) => b - a) : undefined });
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: owned }}
                style={[styles.plateChip, owned && styles.plateChipOn]}
              >
                <Text variant="label" color={owned ? colors.onPrimary : colors.textDim}>
                  {plate}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {plates?.length ? (
          <Pressable onPress={() => setProfile({ availablePlates: undefined })} style={{ paddingTop: spacing.md }}>
            <Text variant="label" color={colors.textDim}>
              Reset to the standard set
            </Text>
          </Pressable>
        ) : null}
      </Card>

      <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.md }}>
        {totalPlates(plan)} plates total, {plan.perSide.reduce((a, p) => a + p.count, 0)} per side. Loading from{' '}
        {gymPlates.join(', ')} {unitLabel} plates
        {gym && !isStandardKit(kit) ? ` recorded at ${gym.name}` : ''}. The smallest jump you can make here is{' '}
        {step} {unitLabel}.
      </Text>
    </Screen>
  );
}

function Nudge({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? 'Increase target' : 'Decrease target'}
      hitSlop={8}
      style={({ pressed }) => [
        {
          width: 48,
          height: 48,
          borderRadius: radius.pill,
          backgroundColor: colors.surfaceHigh,
          alignItems: 'center',
          justifyContent: 'center',
        },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Text variant="h3" color={colors.primary}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  plateChip: {
    minWidth: 52,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
  },
  plateChipOn: { backgroundColor: colors.primary },
});

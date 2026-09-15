import React, { useMemo, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Card, Chip, Input, Screen, SectionHeader, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Barbell } from '../../src/components/Barbell';
import { colors, layout, radius, spacing } from '../../src/theme';
import { BAR_OPTIONS, PLATES, planPlates, totalPlates } from '../../src/domain/plates';
import { useProfileStore } from '../../src/stores/useProfileStore';

/**
 * Plate calculator. Answers the one question every lifter asks at the rack —
 * "what goes on each side?" — and is honest when a target is not loadable with
 * the plates on hand rather than silently rounding it.
 */
export default function PlateCalculator() {
  const params = useLocalSearchParams<{ target?: string }>();
  const units = useProfileStore((s) => s.profile.units);
  const { width } = useWindowDimensions();

  const bars = BAR_OPTIONS[units]!;
  const [bar, setBar] = useState(bars[0]!);
  const [target, setTarget] = useState(params.target ?? String(units === 'imperial' ? 135 : 60));

  const unitLabel = units === 'imperial' ? 'lb' : 'kg';
  const value = parseFloat(target);
  const plan = useMemo(() => planPlates(isNaN(value) ? 0 : value, bar, units), [value, bar, units]);
  const step = PLATES[units]![PLATES[units]!.length - 1]! * 2;

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

      <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.md }}>
        {totalPlates(plan)} plates total, {plan.perSide.reduce((a, p) => a + p.count, 0)} per side. Assumes a standard
        set of {PLATES[units]!.join(', ')} {unitLabel} plates.
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

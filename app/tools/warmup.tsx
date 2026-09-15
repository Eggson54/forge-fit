import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Chip, Input, Screen, SectionHeader, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { colors, radius, spacing } from '../../src/theme';
import { BAR_OPTIONS } from '../../src/domain/plates';
import { warmupPlan } from '../../src/domain/warmup';
import { useProfileStore } from '../../src/stores/useProfileStore';

/**
 * Warm-up ramp builder. Suggests a general ramp to a working set and rounds
 * every stage to a bar that can actually be loaded — a starting point to adjust,
 * not a prescription.
 */
export default function WarmupTool() {
  const params = useLocalSearchParams<{ target?: string }>();
  const units = useProfileStore((s) => s.profile.units);
  const bars = BAR_OPTIONS[units]!;

  const [bar, setBar] = useState(bars[0]!);
  const [barbell, setBarbell] = useState(true);
  const [working, setWorking] = useState(params.target ?? String(units === 'imperial' ? 225 : 100));

  const unitLabel = units === 'imperial' ? 'lb' : 'kg';
  const value = parseFloat(working);
  const steps = useMemo(
    () => warmupPlan({ workingWeight: isNaN(value) ? 0 : value, bar, unit: units, barbell }),
    [value, bar, units, barbell],
  );

  return (
    <Screen gradient>
      <ScreenHeader title="Warm-Up Builder" />

      <Card tone="alt" style={{ marginBottom: spacing.lg }}>
        <Text variant="caption" color={colors.textDim}>
          A general ramp, not a prescription. Adjust the stages to how you feel — stop warming up when you are ready to
          work, and skip anything that does not suit the lift.
        </Text>
      </Card>

      <Input
        label={`Working weight (${unitLabel})`}
        value={working}
        onChangeText={setWorking}
        keyboardType="decimal-pad"
        suffix={unitLabel}
      />

      <SectionHeader title="Loaded with" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Chip label="Bodyweight / machine" selected={!barbell} onPress={() => setBarbell(false)} />
        {bars
          .filter((b) => b > 0)
          .map((b) => (
            <Chip
              key={b}
              label={`${b} ${unitLabel} bar`}
              selected={barbell && bar === b}
              onPress={() => {
                setBarbell(true);
                setBar(b);
              }}
            />
          ))}
      </View>

      <SectionHeader title={steps.length ? `${steps.length} warm-up sets` : 'Warm-up sets'} />
      {steps.length === 0 ? (
        <Card>
          <Text variant="body" color={colors.textDim}>
            Enter a working weight to build a ramp.
          </Text>
        </Card>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {steps.map((s, i) => (
            <Card key={`${s.pct}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={styles.index}>
                <Text variant="bodyStrong" color={colors.primary}>
                  {i + 1}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="title">
                  {s.loadedWeight} {unitLabel} × {s.reps}
                </Text>
                <Text variant="caption" color={colors.textDim}>
                  {s.pct === 0 ? s.label : `${Math.round(s.pct * 100)}% · ${s.label}`}
                </Text>
              </View>
              {barbell && bar > 0 && s.loadedWeight > bar && (
                <Button
                  title="Plates"
                  variant="ghost"
                  size="sm"
                  fullWidth={false}
                  haptic={false}
                  icon={<Icon name="sliders" size={14} color={colors.text} />}
                  onPress={() => router.push({ pathname: '/tools/plates', params: { target: String(s.loadedWeight) } })}
                />
              )}
            </Card>
          ))}

          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderColor: colors.primary }}>
            <View style={[styles.index, { backgroundColor: 'rgba(255,90,31,0.18)' }]}>
              <Icon name="flame" size={16} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="title" color={colors.primary}>
                {isNaN(value) ? '—' : value} {unitLabel} · work sets
              </Text>
              <Text variant="caption" color={colors.textDim}>
                Your actual training weight
              </Text>
            </View>
          </Card>
        </View>
      )}
    </Screen>
  );
}

const styles = {
  index: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
};

import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Input, Screen, SectionHeader, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, spacing } from '../../src/theme';
import type { DisciplineWeights, Targets } from '../../src/domain/types';
import { useProfileStore } from '../../src/stores/useProfileStore';

const TARGET_FIELDS: { key: keyof Targets; label: string; suffix: string; transform?: 'sleepHours' }[] = [
  { key: 'calories', label: 'Daily calories', suffix: 'kcal' },
  { key: 'proteinG', label: 'Protein', suffix: 'g' },
  { key: 'carbsG', label: 'Carbs', suffix: 'g' },
  { key: 'fatG', label: 'Fat', suffix: 'g' },
  { key: 'waterOz', label: 'Water', suffix: 'oz' },
  { key: 'steps', label: 'Steps', suffix: '' },
  { key: 'sleepMinutes', label: 'Sleep', suffix: 'hrs', transform: 'sleepHours' },
];

const WEIGHT_KEYS: (keyof DisciplineWeights)[] = ['workout', 'nutrition', 'protein', 'steps', 'water', 'sleep'];

export default function Goals() {
  const targets = useProfileStore((s) => s.targets);
  const setTargets = useProfileStore((s) => s.setTargets);
  const weights = useProfileStore((s) => s.disciplineWeights);
  const setWeights = useProfileStore((s) => s.setDisciplineWeights);

  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const f of TARGET_FIELDS) o[f.key] = f.transform === 'sleepHours' ? String(targets.sleepMinutes / 60) : String(targets[f.key]);
    return o;
  });

  const save = () => {
    const patch: Partial<Targets> = {};
    for (const f of TARGET_FIELDS) {
      const v = parseFloat(draft[f.key] ?? '');
      if (isNaN(v)) continue;
      patch[f.key] = (f.transform === 'sleepHours' ? Math.round(v * 60) : Math.round(v)) as never;
    }
    setTargets(patch);
  };

  const total = WEIGHT_KEYS.reduce((a, k) => a + weights[k], 0) || 1;
  const bump = (k: keyof DisciplineWeights, delta: number) => {
    const next = { ...weights, [k]: Math.max(0, weights[k] + delta) };
    setWeights(next);
  };

  return (
    <Screen gradient footer={<Button title="Save Targets" onPress={save} size="lg" />}>
      <ScreenHeader title="Goals & Targets" />

      <Card tone="alt" style={{ marginBottom: spacing.lg }}>
        <Text variant="caption" color={colors.textDim}>
          These are your personal targets — estimates you fully control, not medical advice.
        </Text>
      </Card>

      <View style={{ gap: spacing.md }}>
        {TARGET_FIELDS.map((f) => (
          <Input
            key={f.key}
            label={f.label}
            value={draft[f.key]}
            onChangeText={(t) => setDraft((d) => ({ ...d, [f.key]: t }))}
            keyboardType="decimal-pad"
            suffix={f.suffix}
          />
        ))}
      </View>

      <SectionHeader title="Discipline weighting" />
      <Text variant="caption" color={colors.textDim} style={{ marginBottom: spacing.md }}>
        Customize how much each area contributes to your daily discipline score.
      </Text>
      <Card>
        {WEIGHT_KEYS.map((k, i) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md, borderBottomWidth: i === WEIGHT_KEYS.length - 1 ? 0 : 0.5, borderBottomColor: colors.border }}>
            <Text variant="body" style={{ flex: 1, textTransform: 'capitalize' }}>
              {k}
            </Text>
            <Text variant="caption" color={colors.textDim} style={{ width: 44, textAlign: 'right' }}>
              {Math.round((weights[k] / total) * 100)}%
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginLeft: spacing.lg }}>
              <Stepper label="−" onPress={() => bump(k, -5)} />
              <Text variant="bodyStrong" style={{ width: 28, textAlign: 'center' }}>
                {weights[k]}
              </Text>
              <Stepper label="+" onPress={() => bump(k, 5)} />
            </View>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

function Stepper({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <View
      onTouchEnd={onPress}
      style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text variant="bodyStrong" color={colors.primary}>
        {label}
      </Text>
    </View>
  );
}

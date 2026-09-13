import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Input, LineChart, Screen, SectionHeader, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, spacing } from '../../src/theme';
import { displayWeight, kgToLb, round, toKg } from '../../src/domain/units';
import { useLogStore } from '../../src/stores/useLogStore';
import { useProfileStore } from '../../src/stores/useProfileStore';

export default function WeightLog() {
  const units = useProfileStore((s) => s.profile.units);
  const setProfile = useProfileStore((s) => s.setProfile);
  const weightLogs = useLogStore((s) => s.weight);
  const logWeight = useLogStore((s) => s.logWeight);
  const [value, setValue] = useState('');

  const save = () => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    const kg = round(toKg(num, units), 1);
    logWeight(kg);
    setProfile({ weightKg: kg });
    setValue('');
  };

  const series = [...weightLogs]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(-30)
    .map((w) => ({ label: w.date.slice(5), value: units === 'imperial' ? round(kgToLb(w.weightKg), 1) : w.weightKg }));

  return (
    <Screen gradient>
      <ScreenHeader title="Weight" />
      <Card>
        <LineChart data={series} color={colors.protein} width={300} />
      </Card>

      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Input label="Log today's weight" value={value} onChangeText={setValue} keyboardType="decimal-pad" suffix={units === 'imperial' ? 'lb' : 'kg'} />
        </View>
        <Button title="Save" fullWidth={false} onPress={save} style={{ minWidth: 100 }} />
      </View>

      <SectionHeader title="History" />
      <Card>
        {weightLogs.slice(0, 20).map((w, i) => {
          const d = displayWeight(w.weightKg, units);
          return (
            <View key={w.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: i === Math.min(19, weightLogs.length - 1) ? 0 : 0.5, borderBottomColor: colors.border }}>
              <Text variant="body" color={colors.textDim}>
                {new Date(`${w.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>
              <Text variant="bodyStrong">
                {d.value} {d.unit}
              </Text>
            </View>
          );
        })}
        {weightLogs.length === 0 && (
          <Text variant="caption" color={colors.textFaint}>
            No entries yet.
          </Text>
        )}
      </Card>
    </Screen>
  );
}

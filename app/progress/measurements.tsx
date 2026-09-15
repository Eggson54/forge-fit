import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, EmptyState, Input, Screen, SectionHeader, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, spacing } from '../../src/theme';
import { cmToIn, inToCm, round } from '../../src/domain/units';
import type { MeasurementLog } from '../../src/domain/types';
import { useLogStore } from '../../src/stores/useLogStore';
import { useProfileStore } from '../../src/stores/useProfileStore';

const FIELDS: { key: keyof MeasurementLog; label: string }[] = [
  { key: 'chestCm', label: 'Chest' },
  { key: 'waistCm', label: 'Waist' },
  { key: 'hipsCm', label: 'Hips' },
  { key: 'armCm', label: 'Arm' },
  { key: 'thighCm', label: 'Thigh' },
  { key: 'neckCm', label: 'Neck' },
];

export default function Measurements() {
  const units = useProfileStore((s) => s.profile.units);
  const measurements = useLogStore((s) => s.measurements);
  const addMeasurement = useLogStore((s) => s.addMeasurement);
  const [vals, setVals] = useState<Record<string, string>>({});
  const unit = units === 'imperial' ? 'in' : 'cm';

  const save = () => {
    const entry: Partial<MeasurementLog> = {};
    for (const f of FIELDS) {
      const v = parseFloat(vals[f.key as string] ?? '');
      if (!isNaN(v)) (entry as any)[f.key] = round(units === 'imperial' ? inToCm(v) : v, 1);
    }
    if (Object.keys(entry).length === 0) return;
    addMeasurement(entry as any);
    setVals({});
  };

  const toDisplay = (cm?: number) => (cm == null ? '—' : `${round(units === 'imperial' ? cmToIn(cm) : cm, 1)} ${unit}`);

  return (
    <Screen gradient footer={<Button title="Save Measurements" onPress={save} size="lg" />}>
      <ScreenHeader title="Body Measurements" />
      <Card>
        {/* Two to a row: six stacked full-width fields filled the screen with
            empty boxes before any history was visible. */}
        <View style={{ gap: spacing.md }}>
          {pairs(FIELDS).map((row, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: spacing.md }}>
              {row.map((f) => (
                <View key={f.key as string} style={{ flex: 1 }}>
                  <Input
                    label={f.label}
                    value={vals[f.key as string] ?? ''}
                    onChangeText={(t) => setVals((v) => ({ ...v, [f.key as string]: t }))}
                    keyboardType="decimal-pad"
                    suffix={unit}
                  />
                </View>
              ))}
              {row.length === 1 && <View style={{ flex: 1 }} />}
            </View>
          ))}
        </View>
      </Card>

      <SectionHeader title="History" />
      {measurements.length === 0 ? (
        <EmptyState
          icon="scale"
          title="No measurements yet"
          subtitle="Fill in what you track above — you can leave the rest blank."
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          {measurements.slice(0, 12).map((m) => (
            <Card key={m.id}>
              <Text variant="bodyStrong" style={{ marginBottom: spacing.sm }}>
                {new Date(`${m.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg }}>
                {FIELDS.map((f) => {
                  const v = m[f.key] as number | undefined;
                  if (v == null) return null;
                  return (
                    <View key={f.key as string}>
                      <Text variant="caption" color={colors.textDim}>
                        {f.label}
                      </Text>
                      <Text variant="bodyStrong">{toDisplay(v)}</Text>
                    </View>
                  );
                })}
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

/** Chunk a list into rows of two for a paired form layout. */
function pairs<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out;
}

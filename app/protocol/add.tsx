import React, { useState } from 'react';
import { Switch, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Chip, Input, Screen, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Syringe } from '../../src/components/Syringe';
import { colors, spacing } from '../../src/theme';
import type { ProtocolFrequency } from '../../src/domain/types';
import { useProtocolStore } from '../../src/stores/useProtocolStore';
import { useReminderStore } from '../../src/stores/useReminderStore';

const FREQS: { value: ProtocolFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'eod', label: 'Every other day' },
  { value: '2x_week', label: '2×/week' },
  { value: '3x_week', label: '3×/week' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'custom', label: 'Custom' },
];

export default function AddProtocol() {
  const addProtocol = useProtocolStore((s) => s.addProtocol);
  const addReminder = useReminderStore((s) => s.add);

  const [name, setName] = useState('');
  const [dose, setDose] = useState(0);
  const [unit, setUnit] = useState('mg');
  const [useSyringe, setUseSyringe] = useState(true);
  const [frequency, setFrequency] = useState<ProtocolFrequency>('daily');
  const [time, setTime] = useState('09:00');
  const [notes, setNotes] = useState('');
  const [reminder, setReminder] = useState(true);

  const save = async () => {
    addProtocol({
      name: name.trim() || 'Protocol',
      dose: dose > 0 ? dose : null,
      unit: unit.trim(),
      frequency,
      timeOfDay: time,
      notes: notes.trim() || undefined,
      reminderEnabled: reminder,
    });
    if (reminder) {
      await addReminder('protocol', { title: `Log: ${name.trim() || 'Protocol'}`, time });
    }
    router.back();
  };

  return (
    <Screen gradient footer={<Button title="Save Entry" onPress={save} size="lg" disabled={!name.trim()} />}>
      <ScreenHeader title="New Protocol Entry" />

      <Card tone="alt" style={{ marginBottom: spacing.lg }}>
        <Text variant="caption" color={colors.textDim}>
          You enter every value yourself. ForgeFit does not suggest doses, cycles, or compounds and is not a substitute for
          professional medical guidance.
        </Text>
      </Card>

      <View style={{ gap: spacing.md }}>
        <Input label="Name" value={name} onChangeText={setName} placeholder="e.g. Vitamin D, or your own label" />

        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
            <Text variant="label" color={colors.textDim}>Amount</Text>
            <Text variant="label" color={colors.primary} onPress={() => setUseSyringe((v) => !v)}>
              {useSyringe ? 'Enter manually' : 'Use syringe'}
            </Text>
          </View>
          <Card padded style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {(['mg', 'mcg', 'iu', 'ml'] as const).map((u) => (
                <Chip key={u} label={u} selected={unit === u} onPress={() => setUnit(u)} />
              ))}
            </View>
            {useSyringe ? (
              <Syringe value={dose} max={maxForUnit(unit)} step={stepForUnit(unit)} unit={unit} onChange={setDose} />
            ) : (
              <Input label="Amount" value={dose ? String(dose) : ''} onChangeText={(t) => setDose(parseFloat(t) || 0)} keyboardType="decimal-pad" suffix={unit} placeholder="0" />
            )}
          </Card>
        </View>

        <Text variant="label" color={colors.textDim}>
          Frequency
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {FREQS.map((f) => (
            <Chip key={f.value} label={f.label} selected={frequency === f.value} onPress={() => setFrequency(f.value)} />
          ))}
        </View>

        <Input label="Time of day" value={time} onChangeText={setTime} placeholder="HH:mm" keyboardType="numbers-and-punctuation" />
        <Input label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional personal notes" multiline />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm }}>
          <Text variant="body">Remind me to log this</Text>
          <Switch value={reminder} onValueChange={setReminder} trackColor={{ true: colors.primary, false: colors.surfaceHigh }} thumbColor={colors.text} />
        </View>
      </View>
    </Screen>
  );
}

// Reasonable syringe ranges per unit — a display range only, never a recommendation.
function maxForUnit(unit: string): number {
  switch (unit) {
    case 'mcg': return 1000;
    case 'iu': return 50;
    case 'ml': return 5;
    default: return 100; // mg
  }
}
function stepForUnit(unit: string): number {
  switch (unit) {
    case 'mcg': return 5;
    case 'iu': return 1;
    case 'ml': return 0.05;
    default: return 0.5; // mg
  }
}

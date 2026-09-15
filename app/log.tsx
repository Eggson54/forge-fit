import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Input, Screen, SectionHeader, Text } from '../src/components/ui';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { colors, spacing } from '../src/theme';
import { todayISO } from '../src/domain/date';
import { Icon } from '../src/components/Icon';
import { displayWeight, round, toKg } from '../src/domain/units';
import { useLogStore } from '../src/stores/useLogStore';
import { useProfileStore } from '../src/stores/useProfileStore';
import { health } from '../src/services/health';

/** Quick manual log for the day's non-workout metrics, with an Apple Health pull. */
export default function LogActivity() {
  const params = useLocalSearchParams<{ focus?: 'steps' | 'sleep' | 'water' | 'weight' }>();
  const units = useProfileStore((s) => s.profile.units);
  const waterTarget = useProfileStore((s) => s.targets.waterOz);
  const logSteps = useLogStore((s) => s.logSteps);
  const logSleep = useLogStore((s) => s.logSleep);
  const logWeight = useLogStore((s) => s.logWeight);
  const addWater = useLogStore((s) => s.addWater);
  const stepsToday = useLogStore((s) => s.stepsForDate(todayISO()));
  const sleepToday = useLogStore((s) => s.sleepForDate(todayISO()));
  const waterToday = useLogStore((s) => s.waterForDate(todayISO()));
  const latestWeightKg = useLogStore((s) => s.latestWeightKg());

  const [steps, setSteps] = useState(stepsToday ? String(stepsToday) : '');
  const [hours, setHours] = useState(sleepToday ? String(Math.floor(sleepToday / 60)) : '');
  const [minutes, setMinutes] = useState(sleepToday ? String(sleepToday % 60) : '');
  const [weight, setWeight] = useState('');

  const weightUnit = units === 'imperial' ? 'lb' : 'kg';
  const lastWeight = latestWeightKg != null ? displayWeight(latestWeightKg, units) : null;

  const saveSteps = () => {
    const n = parseInt(steps, 10);
    if (!isNaN(n)) logSteps(n, 'manual');
  };
  const saveSleep = () => {
    const h = parseInt(hours, 10) || 0;
    const m = parseInt(minutes, 10) || 0;
    if (h + m > 0) logSleep(h * 60 + m);
  };

  const pullHealth = async () => {
    const today = todayISO();
    const s = await health.getSteps(today);
    if (s != null) {
      logSteps(s, 'health');
      setSteps(String(s));
    }
  };

  const saveWeight = () => {
    const n = parseFloat(weight);
    if (!isNaN(n) && n > 0) logWeight(round(toKg(n, units), 2));
  };

  const done = () => {
    saveSteps();
    saveSleep();
    saveWeight();
    router.back();
  };

  return (
    <Screen gradient footer={<Button title="Save" onPress={done} size="lg" />}>
      <ScreenHeader title="Log Activity" />

      <SectionHeader title="Steps" action="Pull from Health" onAction={pullHealth} />
      <Card>
        <Input label="Steps today" value={steps} onChangeText={setSteps} keyboardType="number-pad" placeholder="e.g. 8000" autoFocus={params.focus === 'steps'} />
      </Card>

      <SectionHeader title="Sleep" />
      <Card>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Input label="Hours" value={hours} onChangeText={setHours} keyboardType="number-pad" suffix="h" autoFocus={params.focus === 'sleep'} />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="Minutes" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" suffix="m" />
          </View>
        </View>
      </Card>

      <SectionHeader title="Water" />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Icon name="water" size={20} color={colors.water} />
            <Text variant="metric">
              {Math.round(waterToday)}
              <Text variant="caption" color={colors.textDim}>
                {' '}
                / {waterTarget} oz
              </Text>
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <QuickAdd label="+8 oz" onPress={() => addWater(8)} />
            <QuickAdd label="+16 oz" onPress={() => addWater(16)} />
          </View>
        </View>
      </Card>

      <SectionHeader title="Weight" />
      <Card>
        <Input
          label={lastWeight ? `Today's weigh-in (last: ${lastWeight.value} ${lastWeight.unit})` : "Today's weigh-in"}
          value={weight}
          onChangeText={setWeight}
          keyboardType="decimal-pad"
          suffix={weightUnit}
          placeholder="—"
          autoFocus={params.focus === 'weight'}
        />
      </Card>

      <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
        Connect Apple Health in Settings → Privacy to sync steps and sleep automatically.
      </Text>
    </Screen>
  );
}

function QuickAdd({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        backgroundColor: 'rgba(46,155,224,0.14)',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: 999,
      }}
    >
      <Text variant="label" color={colors.water}>
        {label}
      </Text>
    </Pressable>
  );
}

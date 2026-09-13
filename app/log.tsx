import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Input, Screen, SectionHeader, Text } from '../src/components/ui';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { colors, spacing } from '../src/theme';
import { todayISO } from '../src/domain/date';
import { useLogStore } from '../src/stores/useLogStore';
import { health } from '../src/services/health';

/** Quick manual log for steps and sleep (with optional Apple Health pull). */
export default function LogActivity() {
  const params = useLocalSearchParams<{ focus?: 'steps' | 'sleep' }>();
  const logSteps = useLogStore((s) => s.logSteps);
  const logSleep = useLogStore((s) => s.logSleep);
  const stepsToday = useLogStore((s) => s.stepsForDate(todayISO()));
  const sleepToday = useLogStore((s) => s.sleepForDate(todayISO()));

  const [steps, setSteps] = useState(stepsToday ? String(stepsToday) : '');
  const [hours, setHours] = useState(sleepToday ? String(Math.floor(sleepToday / 60)) : '');
  const [minutes, setMinutes] = useState(sleepToday ? String(sleepToday % 60) : '');

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

  const done = () => {
    saveSteps();
    saveSleep();
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

      <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
        Connect Apple Health in Settings → Privacy to sync steps and sleep automatically.
      </Text>
    </Screen>
  );
}

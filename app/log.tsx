import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Screen, SectionHeader, Text } from '../src/components/ui';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { MetricField } from '../src/components/MetricField';
import { Icon } from '../src/components/Icon';
import { colors, radius, spacing } from '../src/theme';
import { formatSleep, parseDurationMinutes, todayISO } from '../src/domain/date';
import { displayWeight, round, toKg } from '../src/domain/units';
import { useLogStore } from '../src/stores/useLogStore';
import { useProfileStore } from '../src/stores/useProfileStore';
import { health } from '../src/services/health';
import { useVitalsStore } from '../src/stores/useVitalsStore';

/** How the night went. The store has always stored this; nothing asked for it. */
const QUALITY: { value: number; label: string }[] = [
  { value: 1, label: 'Rough' },
  { value: 2, label: 'Poor' },
  { value: 3, label: 'OK' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Great' },
];

/** Quick manual log for the day's non-workout metrics, with an Apple Health pull. */
export default function LogActivity() {
  const params = useLocalSearchParams<{ focus?: 'steps' | 'sleep' | 'water' | 'weight' }>();
  const units = useProfileStore((s) => s.profile.units);
  const targets = useProfileStore((s) => s.targets);
  const targetWeightKg = useProfileStore((s) => s.profile.targetWeightKg);
  const logSteps = useLogStore((s) => s.logSteps);
  const logSleep = useLogStore((s) => s.logSleep);
  const logWeight = useLogStore((s) => s.logWeight);
  const addWater = useLogStore((s) => s.addWater);
  const stepsToday = useLogStore((s) => s.stepsForDate(todayISO()));
  const sleepToday = useLogStore((s) => s.sleepForDate(todayISO()));
  const waterToday = useLogStore((s) => s.waterForDate(todayISO()));
  const latestWeightKg = useLogStore((s) => s.latestWeightKg());

  const [steps, setSteps] = useState(stepsToday ? String(stepsToday) : '');
  // Held as typed and parsed on read, so "7:35" survives while it is being
  // typed instead of being rewritten under the cursor.
  const [sleepInput, setSleepInput] = useState(sleepToday ? formatSleep(sleepToday) : '');
  const [quality, setQuality] = useState<number | null>(null);
  const [weight, setWeight] = useState('');
  const [pulling, setPulling] = useState(false);

  const weightUnit = units === 'imperial' ? 'lb' : 'kg';
  const lastWeight = latestWeightKg != null ? displayWeight(latestWeightKg, units) : null;
  const targetWeight = targetWeightKg != null ? displayWeight(targetWeightKg, units) : null;

  const sleepTargetMinutes = targets.sleepMinutes;
  const enteredSleep = parseDurationMinutes(sleepInput) ?? 0;

  // Weight is the one field with no "target bar": a progress bar toward a goal
  // weight would fill up as you lose OR gain, depending on which side you
  // started, and be wrong half the time. A plain delta is honest.
  const enteredWeightKg = weight ? toKg(parseFloat(weight), units) : null;
  const weightDelta =
    enteredWeightKg != null && latestWeightKg != null && Number.isFinite(enteredWeightKg)
      ? displayWeight(Math.abs(enteredWeightKg - latestWeightKg), units)
      : null;
  const weightDirection =
    enteredWeightKg != null && latestWeightKg != null ? Math.sign(enteredWeightKg - latestWeightKg) : 0;

  const saveSteps = () => {
    const n = parseInt(steps, 10);
    if (!isNaN(n)) logSteps(n, 'manual');
  };
  const saveSleep = () => {
    const m = parseDurationMinutes(sleepInput);
    if (m != null && m > 0) logSleep(m, quality ?? undefined);
  };
  const saveWeight = () => {
    const n = parseFloat(weight);
    if (!isNaN(n) && n > 0) logWeight(round(toKg(n, units), 2));
  };

  const pullHealth = async () => {
    setPulling(true);
    const today = todayISO();
    const day = await health.readDay(today);
    if (day.steps != null) {
      logSteps(day.steps, 'health');
      setSteps(String(day.steps));
    }
    if (day.sleepMinutes != null) {
      logSleep(day.sleepMinutes);
      setSleepInput(formatSleep(day.sleepMinutes));
    }
    // The passive signals come across in the same read, so a manual pull fills
    // the health monitor too rather than leaving it a day behind.
    useVitalsStore.getState().record({
      date: today,
      restingHeartRate: day.restingHeartRate,
      hrvMs: day.hrvMs,
      respiratoryRate: day.respiratoryRate,
      wristTemperatureC: day.wristTemperatureC,
      oxygenSaturationPct: day.oxygenSaturationPct,
      activeEnergyKcal: day.activeEnergyKcal,
      source: 'health',
    });
    setPulling(false);
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

      <SectionHeader
        title="Today"
        accent={colors.primary}
        action={pulling ? 'Pulling…' : 'Pull from Health'}
        onAction={pulling ? undefined : pullHealth}
      />

      <View style={{ gap: spacing.md }}>
        <MetricField
          icon="steps"
          tint={colors.steps}
          label="Steps"
          value={steps}
          onChangeValue={setSteps}
          unit="steps"
          target={targets.steps}
          autoFocus={params.focus === 'steps'}
        />

        <MetricField
          icon="moon"
          tint={colors.sleep}
          label="Sleep"
          value={sleepInput}
          onChangeValue={setSleepInput}
          unit={enteredSleep > 0 ? formatSleep(enteredSleep) : 'e.g. 7:30'}
          target={sleepTargetMinutes}
          current={enteredSleep}
          keyboardType="numbers-and-punctuation"
          placeholder="7:30"
          autoFocus={params.focus === 'sleep'}
          footnote={
            sleepInput.trim() && enteredSleep === 0
              ? 'Try 7:30, 7h30m or 450.'
              : enteredSleep > 0
                ? `Against a target of ${formatSleep(sleepTargetMinutes)}`
                : `Target ${formatSleep(sleepTargetMinutes)}. Type 7:30, 7h30m or 450.`
          }
        >
          <View style={{ gap: spacing.sm }}>
            <Text variant="caption" color={colors.textFaint}>How did you sleep?</Text>
            <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
              {QUALITY.map((q) => {
                const on = quality === q.value;
                return (
                  <Pressable
                    key={q.value}
                    onPress={() => setQuality(on ? null : q.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`Sleep quality: ${q.label}`}
                    style={[styles.chip, on && { backgroundColor: colors.sleep, borderColor: colors.sleep }]}
                  >
                    <Text variant="caption" color={on ? colors.bg : colors.textDim}>{q.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </MetricField>

        {/* Water is already logged, not entered: every tap writes immediately,
            so the field shows the running total rather than a draft. */}
        <MetricField
          icon="water"
          tint={colors.water}
          label="Water"
          value={String(Math.round(waterToday))}
          onChangeValue={() => {}}
          readOnly
          unit="oz"
          target={targets.waterOz}
          quickAdds={[8, 16]}
          onQuickAdd={(a) => addWater(a)}
        />

        <MetricField
          icon="scale"
          tint={colors.protein}
          label="Weigh-in"
          value={weight}
          onChangeValue={setWeight}
          unit={weightUnit}
          keyboardType="decimal-pad"
          placeholder={lastWeight ? String(lastWeight.value) : '—'}
          autoFocus={params.focus === 'weight'}
          footnote={
            weightDelta && weightDirection !== 0
              ? `${weightDirection > 0 ? 'Up' : 'Down'} ${weightDelta.value} ${weightDelta.unit} on your last weigh-in${
                  targetWeight ? ` · target ${targetWeight.value} ${targetWeight.unit}` : ''
                }`
              : lastWeight
                ? `Last: ${lastWeight.value} ${lastWeight.unit}${
                    targetWeight ? ` · target ${targetWeight.value} ${targetWeight.unit}` : ''
                  }`
                : 'Your first weigh-in.'
          }
        />
      </View>

      <SectionHeader title="Elsewhere" accent={colors.primary} />
      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        <Shortcut icon="camera" tint={colors.fat} label="Progress photo" onPress={() => router.push('/progress/photos')} />
        <Shortcut icon="scale" tint={colors.water} label="Measurements" onPress={() => router.push('/progress/measurements')} />
        <Shortcut icon="nutrition" tint={colors.calorie} label="Food" onPress={() => router.push('/nutrition/add')} last />
      </Card>

      <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
        Connect Apple Health in Settings → Privacy to sync steps and sleep automatically.
      </Text>
    </Screen>
  );
}

function Shortcut({
  icon,
  tint,
  label,
  onPress,
  last,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  tint: string;
  label: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={[styles.shortcut, !last && styles.shortcutDivider]}
    >
      <Icon name={icon} size={17} color={tint} strokeWidth={1.8} />
      <Text variant="body" style={{ flex: 1, minWidth: 0 }}>{label}</Text>
      <Icon name="chevron_right" size={15} color={colors.textFaint} strokeWidth={2} />
    </Pressable>
  );
}

const styles = {
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  shortcut: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  shortcutDivider: { borderBottomWidth: 0.5, borderBottomColor: colors.border },
};

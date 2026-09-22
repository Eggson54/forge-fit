import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Card, Input, Screen, SectionHeader, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { colors, spacing } from '../../src/theme';
import type { DisciplineWeights, Targets } from '../../src/domain/types';
import { balanceMacros, recommendedTargets } from '../../src/domain/nutrition';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { groupThousands } from '../../src/domain/units';

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
  const profile = useProfileStore((s) => s.profile);
  const targets = useProfileStore((s) => s.targets);
  const setTargets = useProfileStore((s) => s.setTargets);
  const setProfile = useProfileStore((s) => s.setProfile);
  const weights = useProfileStore((s) => s.disciplineWeights);
  const setWeights = useProfileStore((s) => s.setDisciplineWeights);

  const [maxHr, setMaxHr] = useState(profile.maxHeartRate != null ? String(profile.maxHeartRate) : '');
  const [threshold, setThreshold] = useState(
    profile.thresholdPaceSecPerKm != null ? secToClock(profile.thresholdPaceSecPerKm) : '',
  );

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

  /** Overwrite the draft from a computed set of targets. */
  const applyTargets = (next: Partial<Targets>) =>
    setDraft((d) => {
      const out = { ...d };
      for (const f of TARGET_FIELDS) {
        const v = next[f.key];
        if (v == null) continue;
        out[f.key] = f.transform === 'sleepHours' ? String(v / 60) : String(v);
      }
      return out;
    });

  const num = (k: string) => {
    const v = parseFloat(draft[k] ?? '');
    return isNaN(v) ? 0 : v;
  };
  const macroCalories = Math.round(num('proteinG') * 4 + num('carbsG') * 4 + num('fatG') * 9);
  const calorieTarget = Math.round(num('calories'));
  const macroGap = Math.abs(macroCalories - calorieTarget);

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

      {/* Grouped and paired: seven stacked full-width fields was a lot of
          scrolling for values that belong together. */}
      <SectionHeader title="Nutrition" />
      <Card style={{ gap: spacing.md }}>
        <Field field={TARGET_FIELDS[0]!} draft={draft} setDraft={setDraft} />
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Field field={TARGET_FIELDS[1]!} draft={draft} setDraft={setDraft} />
          </View>
          <View style={{ flex: 1 }}>
            <Field field={TARGET_FIELDS[2]!} draft={draft} setDraft={setDraft} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Field field={TARGET_FIELDS[3]!} draft={draft} setDraft={setDraft} />
          </View>
          {/* Fat sits alone on its row; the spacer keeps it the same width as
              the pair above rather than stretching across the card. */}
          <View style={{ flex: 1 }} />
        </View>
        {/* Macros and calories are entered independently, so show when they disagree. */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md }}>
          <Text variant="caption" color={colors.textDim}>
            Macros add up to
          </Text>
          <Text variant="bodyStrong" color={macroGap <= 60 ? colors.success : colors.amber}>
            {groupThousands(macroCalories)} kcal
            {macroGap > 60 && (
              <Text variant="caption" color={colors.amber}>
                {' '}
                ({macroCalories > calorieTarget ? '+' : '−'}
                {macroGap} vs target)
              </Text>
            )}
          </Text>
        </View>

        {macroGap > 60 && (
          <Pressable
            onPress={() => {
              const balanced = balanceMacros(
                { calories: calorieTarget, proteinG: num('proteinG'), carbsG: num('carbsG'), fatG: num('fatG') },
                'carbsG',
              );
              // Null means protein and fat alone already exceed the calorie
              // target, so there is no carb number that fixes it.
              if (balanced) applyTargets(balanced);
              else setDraft((d) => ({ ...d, calories: String(Math.round(num('proteinG') * 4 + num('fatG') * 9)) }));
            }}
            style={styles.fix}
            accessibilityRole="button"
          >
            <Icon name="sliders" size={14} color={colors.primary} strokeWidth={1.9} />
            <Text variant="label" color={colors.primary}>
              {balanceMacros({ calories: calorieTarget, proteinG: num('proteinG'), carbsG: num('carbsG'), fatG: num('fatG') })
                ? 'Balance with carbs'
                : 'Raise calories to match'}
            </Text>
          </Pressable>
        )}
      </Card>

      <Pressable
        onPress={() => applyTargets(recommendedTargets(profile))}
        style={styles.fix}
        accessibilityRole="button"
      >
        <Icon name="repeat" size={14} color={colors.textDim} strokeWidth={1.9} />
        <Text variant="label" color={colors.textDim}>
          Reset to recommended for your profile
        </Text>
      </Pressable>

      <SectionHeader title="Daily habits" />
      <Card style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Field field={TARGET_FIELDS[4]!} draft={draft} setDraft={setDraft} />
          </View>
          <View style={{ flex: 1 }}>
            <Field field={TARGET_FIELDS[6]!} draft={draft} setDraft={setDraft} />
          </View>
        </View>
        <Field field={TARGET_FIELDS[5]!} draft={draft} setDraft={setDraft} />
      </Card>

      <SectionHeader title="Heart rate & pace" />
      <Card style={{ gap: spacing.md }}>
        <View>
          <Text variant="label" color={colors.textDim}>Maximum heart rate</Text>
          <Input
            value={maxHr}
            onChangeText={setMaxHr}
            keyboardType="number-pad"
            placeholder={profile.age ? `${220 - profile.age} (estimated from your age)` : 'bpm'}
            onBlur={() => {
              const v = parseInt(maxHr, 10);
              setProfile({ maxHeartRate: Number.isFinite(v) && v > 100 && v < 235 ? v : null });
            }}
          />
          <Text variant="caption" color={colors.textFaint} style={{ marginTop: 4 }}>
            The highest you have actually seen on a watch, at the end of something horrible. Without it the app falls
            back to 220 minus your age, which is a population average that fits very few individuals — every zone,
            every effort score and every time-in-zone number inherits that error.
          </Text>
        </View>

        <View>
          <Text variant="label" color={colors.textDim}>Threshold pace, per km</Text>
          <Input
            value={threshold}
            onChangeText={setThreshold}
            placeholder="4:30"
            onBlur={() => setProfile({ thresholdPaceSecPerKm: clockToSec(threshold) })}
          />
          <Text variant="caption" color={colors.textFaint} style={{ marginTop: 4 }}>
            Roughly the pace you could hold for an hour. Pace zones are expressed as multiples of it, because it is the
            only anchor that means the same thing to a three-hour and a five-hour marathoner.
          </Text>
        </View>
      </Card>

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
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? 'Increase' : 'Decrease'}
      hitSlop={6}
      style={({ pressed }) => [
        { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Text variant="bodyStrong" color={colors.primary}>
        {label}
      </Text>
    </Pressable>
  );
}

function Field({
  field,
  draft,
  setDraft,
}: {
  field: (typeof TARGET_FIELDS)[number];
  draft: Record<string, string>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  return (
    <Input
      label={field.label}
      value={draft[field.key]}
      onChangeText={(t) => setDraft((d) => ({ ...d, [field.key]: t }))}
      keyboardType="decimal-pad"
      suffix={field.suffix}
    />
  );
}

const styles = StyleSheet.create({
  fix: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
});

/** "4:30" from 270 seconds. */
function secToClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * 270 from "4:30", and null from anything that is not a pace.
 *
 * Null rather than zero: a threshold of zero would put every pace in the
 * fastest zone, which is a more confident kind of wrong than having no zones.
 */
function clockToSec(text: string): number | null {
  const m = text.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!m) return null;
  const seconds = parseInt(m[1]!, 10) * 60 + parseInt(m[2]!, 10);
  return seconds >= 120 && seconds <= 1200 ? seconds : null;
}

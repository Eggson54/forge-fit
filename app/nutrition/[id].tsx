import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Input, Screen, SectionHeader, SegmentedControl, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { colors, radius, spacing } from '../../src/theme';
import { caloriesFromMacros, scaleMacros } from '../../src/domain/nutrition';
import { round } from '../../src/domain/units';
import type { MealSlot } from '../../src/domain/types';
import { useLogStore } from '../../src/stores/useLogStore';

const SLOT_OPTIONS: { label: string; value: MealSlot }[] = [
  { label: 'Breakfast', value: 'breakfast' },
  { label: 'Lunch', value: 'lunch' },
  { label: 'Dinner', value: 'dinner' },
  { label: 'Snack', value: 'snack' },
];

/** Servings you can reach with one tap, either side of a single portion. */
const QUANTITY_STEPS = [0.25, 0.5, 1, 1.5, 2, 3];

export default function EditFood() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = useLogStore((s) => s.nutrition.find((n) => n.id === id));
  const updateFood = useLogStore((s) => s.updateFood);
  const removeFood = useLogStore((s) => s.removeFood);

  // Seeded once from the entry: editing is a draft the user can abandon by
  // backing out, and re-syncing on every store write would fight the keyboard.
  const [name, setName] = useState(entry?.name ?? '');
  const [servingLabel, setServingLabel] = useState(entry?.servingLabel ?? '');
  const [slot, setSlot] = useState<MealSlot>(entry?.slot ?? 'snack');
  const [quantity, setQuantity] = useState(String(entry?.quantity ?? 1));
  const [protein, setProtein] = useState(String(entry?.macros.proteinG ?? 0));
  const [carbs, setCarbs] = useState(String(entry?.macros.carbsG ?? 0));
  const [fat, setFat] = useState(String(entry?.macros.fatG ?? 0));

  const perServing = useMemo(() => {
    const proteinG = clampNum(protein, 0, 400);
    const carbsG = clampNum(carbs, 0, 800);
    const fatG = clampNum(fat, 0, 400);
    // Calories follow the macros rather than being a fourth editable field, so
    // a corrected estimate can't end up internally inconsistent.
    return { proteinG, carbsG, fatG, calories: caloriesFromMacros({ proteinG, carbsG, fatG }), fiberG: entry?.macros.fiberG ?? 0 };
  }, [protein, carbs, fat, entry]);

  const qty = clampNum(quantity, 0, 100);
  const total = scaleMacros(perServing, qty);

  if (!entry) {
    return (
      <Screen gradient>
        <ScreenHeader title="Food" />
        <Text variant="body" color={colors.textDim}>
          This entry is no longer in your log.
        </Text>
      </Screen>
    );
  }

  const save = () => {
    updateFood(entry.id, {
      name: name.trim() || entry.name,
      servingLabel: servingLabel.trim() || entry.servingLabel,
      slot,
      quantity: qty > 0 ? qty : 1,
      macros: perServing,
      // Once the numbers have been reviewed by hand they are no longer an
      // unverified estimate, so the EST badge comes off.
      isEstimate: entry.isEstimate && !macrosEdited(entry.macros, perServing),
    });
    router.back();
  };

  const confirmRemove = () => {
    Alert.alert('Remove food', `Remove ${entry.name} from your log?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          removeFood(entry.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <Screen gradient footer={<Button title="Save changes" onPress={save} size="lg" />}>
      <ScreenHeader title="Edit Food" />

      {entry.isEstimate && (
        <Card tone="alt" style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', marginBottom: spacing.md }}>
          <Icon name="bolt" size={16} color={colors.primary} />
          <Text variant="caption" color={colors.textDim} style={{ flex: 1, minWidth: 0 }}>
            These macros were estimated. Correct anything that looks wrong — your edit is what gets
            counted.
          </Text>
        </Card>
      )}

      <Card>
        <View style={{ gap: spacing.md }}>
          <Input label="Name" value={name} onChangeText={setName} />
          <Input
            label="Serving"
            value={servingLabel}
            onChangeText={setServingLabel}
            placeholder="1 bowl, 100 g, 1 scoop…"
          />
        </View>
      </Card>

      <SectionHeader title="Meal" />
      <SegmentedControl options={SLOT_OPTIONS} value={slot} onChange={setSlot} />

      <SectionHeader title="Servings" />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Stepper label="−" onPress={() => setQuantity(String(round(Math.max(0.25, qty - 0.25), 2)))} />
          <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
            <Text variant="metric">{qty}</Text>
            <Text variant="caption" color={colors.textDim} numberOfLines={1}>
              × {servingLabel.trim() || 'serving'}
            </Text>
          </View>
          <Stepper label="+" onPress={() => setQuantity(String(round(qty + 0.25, 2)))} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
          {QUANTITY_STEPS.map((q) => (
            <Pressable
              key={q}
              onPress={() => setQuantity(String(q))}
              style={[styles.quickQty, qty === q && styles.quickQtyOn]}
            >
              <Text variant="label" color={qty === q ? colors.onPrimary : colors.textDim}>
                {q}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <SectionHeader title="Macros per serving" />
      <Card>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Input label="Protein" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" suffix="g" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Input label="Carbs" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" suffix="g" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Input label="Fat" value={fat} onChangeText={setFat} keyboardType="decimal-pad" suffix="g" />
          </View>
        </View>
        <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
          Calories are derived from the macros: {perServing.calories} kcal per serving.
        </Text>
      </Card>

      <SectionHeader title="This entry counts as" />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
          <Text variant="metricLg" color={colors.calorie}>
            {total.calories}
          </Text>
          <Text variant="bodyStrong" color={colors.textDim}>
            kcal
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm }}>
          <Macro label="Protein" grams={total.proteinG} color={colors.protein} />
          <Macro label="Carbs" grams={total.carbsG} color={colors.carbs} />
          <Macro label="Fat" grams={total.fatG} color={colors.fat} />
        </View>
      </Card>

      <Pressable onPress={confirmRemove} style={styles.remove} accessibilityRole="button">
        <Icon name="trash" size={16} color={colors.danger} strokeWidth={1.9} />
        <Text variant="label" color={colors.danger}>
          Remove from log
        </Text>
      </Pressable>
    </Screen>
  );
}

function Macro({ label, grams, color }: { label: string; grams: number; color: string }) {
  return (
    <View>
      <Text variant="bodyStrong" color={color}>
        {grams}g
      </Text>
      <Text variant="caption" color={colors.textDim}>
        {label}
      </Text>
    </View>
  );
}

function Stepper({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.stepper} hitSlop={6} accessibilityRole="button" accessibilityLabel={label === '+' ? 'More servings' : 'Fewer servings'}>
      <Text variant="h3" color={colors.text}>
        {label}
      </Text>
    </Pressable>
  );
}

function clampNum(text: string, min: number, max: number): number {
  const n = parseFloat(text);
  if (isNaN(n)) return min;
  return Math.min(max, Math.max(min, round(n, 2)));
}

/** Whether the per-serving macros differ from what was originally logged. */
function macrosEdited(a: { proteinG: number; carbsG: number; fatG: number }, b: { proteinG: number; carbsG: number; fatG: number }): boolean {
  return a.proteinG !== b.proteinG || a.carbsG !== b.carbsG || a.fatG !== b.fatG;
}

const styles = StyleSheet.create({
  stepper: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickQty: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
  },
  quickQtyOn: { backgroundColor: colors.primary },
  remove: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    marginTop: spacing.md,
  },
});

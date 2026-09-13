import React from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { AdSlot, Button, Card, ProgressRing, Screen, SectionHeader, Text } from '../../src/components/ui';
import { Icon } from '../../src/components/Icon';
import { colors, gradients, spacing } from '../../src/theme';
import { todayISO } from '../../src/domain/date';
import type { MealSlot, NutritionEntry } from '../../src/domain/types';
import { scaleMacros } from '../../src/domain/nutrition';
import { useLogStore } from '../../src/stores/useLogStore';
import { useProfileStore } from '../../src/stores/useProfileStore';

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const SLOT_LABEL: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };

export default function Nutrition() {
  const date = todayISO();
  const targets = useProfileStore((s) => s.targets);
  const entries = useLogStore((s) => s.nutritionForDate(date));
  const macros = useLogStore((s) => s.macrosForDate(date));
  const waterOz = useLogStore((s) => s.waterForDate(date));
  const addWater = useLogStore((s) => s.addWater);
  const removeFood = useLogStore((s) => s.removeFood);

  const remaining = targets.calories - macros.calories;

  return (
    <Screen gradient>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
        <Text variant="h1">Nutrition</Text>
        <Button title="Add" fullWidth={false} size="sm" icon={<Icon name="plus" size={16} color={colors.onPrimary} />} onPress={() => router.push('/nutrition/add')} />
      </View>

      {/* Calories ring */}
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xl }}>
        <ProgressRing progress={macros.calories / targets.calories} size={130} stroke={13} gradientColors={gradients.ember}>
          <View style={{ alignItems: 'center' }}>
            <Text variant="metricLg">{Math.max(0, remaining)}</Text>
            <Text variant="caption" color={colors.textDim}>
              {remaining >= 0 ? 'left' : 'over'}
            </Text>
          </View>
        </ProgressRing>
        <View style={{ flex: 1, gap: spacing.md }}>
          <View>
            <Text variant="caption" color={colors.textDim}>
              Consumed
            </Text>
            <Text variant="metric">{macros.calories} kcal</Text>
          </View>
          <View>
            <Text variant="caption" color={colors.textDim}>
              Target
            </Text>
            <Text variant="bodyStrong">{targets.calories} kcal</Text>
          </View>
        </View>
      </Card>

      {/* Macro bars */}
      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
        <MacroCard label="Protein" value={macros.proteinG} target={targets.proteinG} color={colors.protein} />
        <MacroCard label="Carbs" value={macros.carbsG} target={targets.carbsG} color={colors.carbs} />
        <MacroCard label="Fat" value={macros.fatG} target={targets.fatG} color={colors.fat} />
      </View>

      {/* Water */}
      <SectionHeader title="Water" action="Custom targets" onAction={() => router.push('/settings/goals')} />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Icon name="water" size={22} color={colors.water} />
            <Text variant="metric">
              {Math.round(waterOz)}
              <Text variant="caption" color={colors.textDim}>
                {' '}
                / {targets.waterOz} oz
              </Text>
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <WaterBtn label="+8" onPress={() => addWater(8)} />
            <WaterBtn label="+16" onPress={() => addWater(16)} />
          </View>
        </View>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceHigh, marginTop: spacing.md, overflow: 'hidden' }}>
          <View style={{ width: `${Math.min(100, (waterOz / targets.waterOz) * 100)}%`, height: '100%', backgroundColor: colors.water, borderRadius: 4 }} />
        </View>
      </Card>

      {/* Meals */}
      {SLOTS.map((slot) => {
        const slotEntries = entries.filter((e) => e.slot === slot);
        return (
          <View key={slot}>
            <SectionHeader title={SLOT_LABEL[slot]} action="Add" onAction={() => router.push({ pathname: '/nutrition/add', params: { slot } })} />
            {slotEntries.length === 0 ? (
              <Text variant="caption" color={colors.textFaint} style={{ marginBottom: spacing.sm }}>
                Nothing logged.
              </Text>
            ) : (
              <Card>
                {slotEntries.map((e, i) => (
                  <FoodRow key={e.id} entry={e} last={i === slotEntries.length - 1} onDelete={() => confirmDelete(e, removeFood)} />
                ))}
              </Card>
            )}
          </View>
        );
      })}

      <View style={{ marginTop: spacing.lg }}>
        <AdSlot placement="nutrition_result" />
      </View>
    </Screen>
  );
}

function confirmDelete(e: NutritionEntry, remove: (id: string) => void) {
  Alert.alert('Remove food', `Remove ${e.name}?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: () => remove(e.id) },
  ]);
}

function MacroCard({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = Math.min(1, value / target);
  return (
    <Card style={{ flex: 1, gap: spacing.sm }}>
      <Text variant="caption" color={colors.textDim}>
        {label}
      </Text>
      <Text variant="metric">
        {Math.round(value)}
        <Text variant="caption" color={colors.textFaint}>
          /{target}g
        </Text>
      </Text>
      <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: 'hidden' }}>
        <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: color, borderRadius: 3 }} />
      </View>
    </Card>
  );
}

function FoodRow({ entry, last, onDelete }: { entry: NutritionEntry; last: boolean; onDelete: () => void }) {
  const m = scaleMacros(entry.macros, entry.quantity);
  return (
    <Pressable onLongPress={onDelete} style={{ paddingVertical: spacing.md, borderBottomWidth: last ? 0 : 0.5, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between' }}>
      <View style={{ flex: 1 }}>
        <Text variant="body">
          {entry.name} {entry.isEstimate ? '~' : ''}
        </Text>
        <Text variant="caption" color={colors.textDim}>
          {entry.quantity} × {entry.servingLabel} · P{Math.round(m.proteinG)} C{Math.round(m.carbsG)} F{Math.round(m.fatG)}
        </Text>
      </View>
      <Text variant="bodyStrong">{m.calories}</Text>
    </Pressable>
  );
}

function WaterBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ backgroundColor: colors.surfaceHigh, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999 }}>
      <Text variant="label" color={colors.water}>
        {label} oz
      </Text>
    </Pressable>
  );
}

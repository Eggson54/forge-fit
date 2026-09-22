import React, { useMemo } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { AdSlot, Button, Card, IconButton, ListRow, Screen, SectionHeader, Text } from '../../src/components/ui';
import { AnimatedNumber, AnimatedProgressRing } from '../../src/components/anim';
import { Icon } from '../../src/components/Icon';
import { Masthead } from '../../src/components/Masthead';
import { colors, domainAccent, gradients, radius, spacing } from '../../src/theme';
import { lastNDays, todayISO } from '../../src/domain/date';
import { groupThousands } from '../../src/domain/units';
import type { MealSlot, NutritionEntry } from '../../src/domain/types';
import { scaleMacros, sumMacros, waterQuickAdds } from '../../src/domain/nutrition';
import { observedTdee } from '../../src/domain/energyBalance';
import { itemsFromEntries, mealMacros, mealsForSlot, suggestMealName } from '../../src/domain/savedMeals';
import { useLogStore } from '../../src/stores/useLogStore';
import { useProfileStore } from '../../src/stores/useProfileStore';

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const SLOT_LABEL: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };

export default function Nutrition() {
  const date = todayISO();
  const targets = useProfileStore((s) => s.targets);
  const entries = useLogStore((s) => s.nutritionForDate(date));
  const savedMeals = useLogStore((s) => s.savedMeals);
  const saveMeal = useLogStore((s) => s.saveMeal);
  const logSavedMeal = useLogStore((s) => s.logSavedMeal);

  const onSaveMeal = (slot: MealSlot, slotEntries: NutritionEntry[]) => {
    const items = itemsFromEntries(slotEntries);
    const suggested = suggestMealName(items, slot);
    const meal = saveMeal({ name: suggested, slot, items });
    Alert.alert(
      'Saved',
      `"${meal.name}" is now one tap away whenever this slot is empty. Rename it from Saved meals.`,
    );
  };
  const macros = useLogStore((s) => s.macrosForDate(date));
  const waterOz = useLogStore((s) => s.waterForDate(date));
  const addWater = useLogStore((s) => s.addWater);
  const quickAdds = waterQuickAdds(useProfileStore((s) => s.profile.waterQuickAddOz));
  const removeFood = useLogStore((s) => s.removeFood);
  const allNutrition = useLogStore((s) => s.nutrition);
  const weighIns = useLogStore((s) => s.weight);
  // Shown on the row only once there is enough behind it to be worth showing.
  const maintenance = useMemo(() => observedTdee(allNutrition, weighIns), [allNutrition, weighIns]);

  const remaining = targets.calories - macros.calories;

  return (
    <Screen gradient>
      <Masthead
        eyebrow="Today"
        title="Nutrition"
        accent={domainAccent.nutrition}
        right={
          <>
            {/* Framed like the other masthead actions: a bare glyph floating
                next to a filled button read as decoration rather than a tap. */}
            <IconButton size={40} accessibilityLabel="Saved meals" onPress={() => router.push('/nutrition/meals')}>
              <Icon name="star" size={19} color={colors.text} strokeWidth={1.8} />
            </IconButton>
            <Button title="Add" fullWidth={false} size="sm" icon={<Icon name="plus" size={16} color={colors.onPrimary} />} onPress={() => router.push('/nutrition/add')} />
          </>
        }
      />

      {/* Calories ring */}
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xl }}>
        <AnimatedProgressRing progress={macros.calories / targets.calories} size={130} stroke={13} gradientColors={gradients.ember}>
          <View style={{ alignItems: 'center' }}>
            <AnimatedNumber value={Math.max(0, remaining)} variant="metricLg" format={groupThousands} />
            <Text variant="caption" color={colors.textDim}>
              {remaining >= 0 ? 'left' : 'over'}
            </Text>
          </View>
        </AnimatedProgressRing>
        <View style={{ flex: 1, gap: spacing.md }}>
          <View>
            <Text variant="caption" color={colors.textDim}>
              Consumed
            </Text>
            <AnimatedNumber value={macros.calories} variant="metric" format={(n) => `${groupThousands(n)} kcal`} />
          </View>
          <View>
            <Text variant="caption" color={colors.textDim}>
              Target
            </Text>
            <Text variant="bodyStrong">{groupThousands(targets.calories)} kcal</Text>
          </View>
        </View>
      </Card>

      {/* Macro bars */}
      <SectionHeader title="Macros" action="Edit targets" onAction={() => router.push('/settings/goals')} />
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <MacroCard label="Protein" value={macros.proteinG} target={targets.proteinG} color={colors.protein} />
        <MacroCard label="Carbs" value={macros.carbsG} target={targets.carbsG} color={colors.carbs} />
        <MacroCard label="Fat" value={macros.fatG} target={targets.fatG} color={colors.fat} />
      </View>

      {/* Water */}
      <SectionHeader title="Water" />
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
            {quickAdds.map((oz) => (
              <WaterBtn key={oz} label={`+${oz}`} onPress={() => addWater(oz)} />
            ))}
          </View>
        </View>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceHigh, marginTop: spacing.md, overflow: 'hidden' }}>
          <View style={{ width: `${Math.min(100, (waterOz / targets.waterOz) * 100)}%`, height: '100%', backgroundColor: colors.water, borderRadius: 4 }} />
        </View>
      </Card>

      <SectionHeader title="This week" action="Trends" onAction={() => router.push('/nutrition/trends')} />
      <Card onPress={() => router.push('/nutrition/trends')} style={{ marginBottom: spacing.md }}>
        <WeekGlance />
      </Card>

      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
        <ListRow
          icon="flame"
          tint={colors.primary}
          title="Energy balance"
          subtitle={maintenance ? `Your maintenance reads ${groupThousands(maintenance.kcal)} kcal` : 'Measure your maintenance from your own logs'}
          onPress={() => router.push('/nutrition/energy')}
        />
        <ListRow
          icon="camera"
          tint={colors.lime}
          title="My foods & barcodes"
          subtitle="What you have added yourself, and every code you have named"
          onPress={() => router.push('/nutrition/foods')}
        />
        <ListRow
          icon="list"
          tint={colors.protein}
          title="Saved meals & recipes"
          subtitle="Log a repeat in one tap, or a plate from a batch"
          onPress={() => router.push('/nutrition/meals')}
        />
        <ListRow
          icon="calendar"
          tint={colors.carbs}
          title="Week plan & grocery list"
          subtitle="Plan the week, then take the list to the shop"
          onPress={() => router.push('/nutrition/plan')}
        />
        <ListRow
          icon="clock"
          tint={colors.sleep}
          title="Meal timing"
          subtitle="Your eating window and how protein falls across the day"
          onPress={() => router.push('/nutrition/timing')}
        />
      </Card>

      {/* Meals */}
      {SLOTS.map((slot) => {
        const slotEntries = entries.filter((e) => e.slot === slot);
        const slotCalories = sumMacros(slotEntries).calories;
        return (
          <View key={slot}>
            <SectionHeader
              title={slotCalories > 0 ? `${SLOT_LABEL[slot]} · ${groupThousands(slotCalories)} kcal` : SLOT_LABEL[slot]}
              action="Add"
              onAction={() => router.push({ pathname: '/nutrition/add', params: { slot } })}
            />
            {slotEntries.length === 0 ? (
              <>
                <Text variant="caption" color={colors.textFaint} style={{ marginBottom: spacing.sm }}>
                  Nothing logged.
                </Text>
                {/* The meals you eat again and again, one tap each. Offering
                    them at the empty slot is the moment they are useful. */}
                {mealsForSlot(savedMeals, slot).slice(0, 3).length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
                    {mealsForSlot(savedMeals, slot)
                      .slice(0, 3)
                      .map((m) => (
                        <Pressable
                          key={m.id}
                          onPress={() => logSavedMeal(m.id, slot)}
                          accessibilityRole="button"
                          accessibilityLabel={`Log ${m.name}, ${mealMacros(m.items).calories} calories`}
                          style={styles.mealChip}
                        >
                          <Icon name="plus" size={12} color={colors.calorie} strokeWidth={2.4} />
                          <Text variant="caption" color={colors.text} numberOfLines={1}>{m.name}</Text>
                          <Text variant="caption" color={colors.textFaint}>
                            {mealMacros(m.items).calories}
                          </Text>
                        </Pressable>
                      ))}
                  </View>
                )}
              </>
            ) : (
              <>
                <Card>
                  {slotEntries.map((e, i) => (
                    <FoodRow
                      key={e.id}
                      entry={e}
                      last={i === slotEntries.length - 1}
                      onPress={() => router.push(`/nutrition/${e.id}`)}
                      onDelete={() => confirmDelete(e, removeFood)}
                    />
                  ))}
                </Card>
                {slotEntries.length > 1 && (
                  <Pressable
                    onPress={() => onSaveMeal(slot, slotEntries)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Save this ${SLOT_LABEL[slot].toLowerCase()} as a meal`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: spacing.sm, alignSelf: 'flex-start' }}
                  >
                    <Icon name="star" size={13} color={colors.textFaint} strokeWidth={1.8} />
                    <Text variant="caption" color={colors.textFaint}>Save this as a meal</Text>
                  </Pressable>
                )}
              </>
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

/**
 * Seven days of calories against target, small enough to sit above the meal
 * list. Today alone never answers "am I actually running a deficit".
 */
function WeekGlance() {
  const targets = useProfileStore((s) => s.targets);
  const nutrition = useLogStore((s) => s.nutrition);
  const macrosForDate = useLogStore((s) => s.macrosForDate);

  const days = lastNDays(7);
  const logged = new Set(nutrition.map((n) => n.date));
  const rows = days.map((date) => ({
    date,
    calories: macrosForDate(date).calories,
    logged: logged.has(date),
  }));
  const loggedRows = rows.filter((r) => r.logged);
  const avg = loggedRows.length
    ? Math.round(loggedRows.reduce((a, r) => a + r.calories, 0) / loggedRows.length)
    : 0;
  // Headroom above whichever is taller, so the target line is never flush with
  // the ceiling and a big day still has somewhere to go.
  const peak = Math.max(targets.calories, ...rows.map((r) => r.calories)) * 1.12 || 1;
  const H = 62;
  const targetY = targets.calories > 0 ? (targets.calories / peak) * H : 0;

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }}>
        <Text variant="overline" color={colors.textDim}>
          {loggedRows.length}/7 days logged
        </Text>
        <Text variant="caption" color={colors.textDim}>
          {loggedRows.length ? `${groupThousands(avg)} kcal avg` : 'nothing logged yet'}
        </Text>
      </View>

      <View style={{ height: H, marginBottom: 4 }}>
        {/* Bars alone say which day was biggest but not whether any of them
            were big. The target line is the only thing that makes the heights
            mean something. */}
        {targetY > 0 && (
          <View style={[styles.targetLine, { bottom: targetY }]} pointerEvents="none">
            <View style={styles.targetRule} />
            <Text variant="caption" color={colors.textFaint} style={{ fontSize: 9 }}>
              {groupThousands(targets.calories)} target
            </Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: H }}>
          {rows.map((r) => {
            const over = r.logged && r.calories > targets.calories;
            return (
              <View key={r.date} style={{ flex: 1 }}>
                <View
                  style={{
                    width: '100%',
                    height: Math.max(3, (r.calories / peak) * H),
                    borderRadius: 3,
                    // An unlogged day is missing data, not a zero-calorie day, so
                    // it is drawn as an absence rather than a bar at the floor.
                    backgroundColor: !r.logged ? colors.surfaceHigh : over ? colors.amber : colors.calorie,
                  }}
                />
              </View>
            );
          })}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 6 }}>
        {rows.map((r) => (
          <Text
            key={r.date}
            variant="caption"
            color={colors.textFaint}
            center
            style={{ flex: 1, fontSize: 9 }}
          >
            {r.date.slice(8)}
          </Text>
        ))}
      </View>
    </View>
  );
}

function MacroCard({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const left = Math.max(0, Math.round(target - value));
  // Ring and padding are sized for the narrowest common phone: a 74px ring
  // inside spacing.lg padding overflowed the card at 360pt width.
  return (
    <Card style={{ flex: 1, alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg, paddingHorizontal: spacing.sm }}>
      <AnimatedProgressRing progress={value / target} size={64} stroke={6.5} color={color}>
        <AnimatedNumber value={Math.round(value)} variant="bodyStrong" format={(n) => `${n}g`} />
      </AnimatedProgressRing>
      <View style={{ alignItems: 'center' }}>
        <Text variant="label">{label}</Text>
        <Text variant="caption" color={colors.textFaint}>
          {left}g left
        </Text>
      </View>
    </Card>
  );
}

function FoodRow({
  entry,
  last,
  onPress,
  onDelete,
}: {
  entry: NutritionEntry;
  last: boolean;
  onPress: () => void;
  onDelete: () => void;
}) {
  const m = scaleMacros(entry.macros, entry.quantity);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onDelete}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${entry.name}`}
      style={{ paddingVertical: spacing.md, borderBottomWidth: last ? 0 : 0.5, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text variant="body" style={{ flexShrink: 1 }}>
            {entry.name}
          </Text>
          {entry.isEstimate && <EstimateTag />}
        </View>
        <Text variant="caption" color={colors.textDim}>
          {entry.quantity} × {entry.servingLabel} · P{Math.round(m.proteinG)} C{Math.round(m.carbsG)} F{Math.round(m.fatG)}
        </Text>
      </View>
      <Text variant="bodyStrong">{m.calories}</Text>
      <Icon name="chevron_right" size={14} color={colors.textFaint} strokeWidth={1.8} />
    </Pressable>
  );
}

/** Marks AI-derived macros as an estimate the user can open and correct. */
function EstimateTag() {
  return (
    <View
      style={{
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.07)',
      }}
    >
      <Text variant="overline" color={colors.textFaint} style={{ fontSize: 9, letterSpacing: 1 }}>
        EST
      </Text>
    </View>
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

const styles = {
  mealChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    maxWidth: '100%' as const,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  targetLine: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  targetRule: {
    flex: 1,
    height: 0,
    // Dashed, so it never reads as another bar's edge.
    borderTopWidth: 1,
    borderStyle: 'dashed' as const,
    borderColor: colors.textFaint,
  },
};

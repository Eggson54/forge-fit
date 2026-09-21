import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Card, EmptyState, Screen, SectionHeader, StatTile, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { FadeIn } from '../../src/components/anim';
import { Icon } from '../../src/components/Icon';
import { colors, domainAccent, radius, spacing } from '../../src/theme';
import { formatDayMonth, todayISO, weekdayIndex } from '../../src/domain/date';
import { groupThousands } from '../../src/domain/units';
import {
  MEAL_PLAN_NOTE,
  SLOT_ORDER,
  dayTotals,
  formatQuantity,
  gapFor,
  groceryList,
  mealsOn,
  planWeek,
  summariseWeek,
} from '../../src/domain/mealPlan';
import { rankMeals } from '../../src/domain/savedMeals';
import type { MealSlot } from '../../src/domain/types';
import { useMealPlanStore } from '../../src/stores/useMealPlanStore';
import { useLogStore } from '../../src/stores/useLogStore';
import { useProfileStore } from '../../src/stores/useProfileStore';

const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

/**
 * The week's eating, and the shopping it implies.
 *
 * The grocery list is the part that earns the screen: a plan you cannot shop
 * from is a diary of intentions. It aggregates across every planned meal,
 * merges an ingredient wherever it appears, and scales by the servings
 * planned rather than by the recipe's batch.
 */
const DAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function MealPlan() {
  const plan = useMealPlanStore((s) => s.plan);
  const checked = useMealPlanStore((s) => s.checked);
  const add = useMealPlanStore((s) => s.add);
  const remove = useMealPlanStore((s) => s.remove);
  const toggleChecked = useMealPlanStore((s) => s.toggleChecked);
  const clearChecked = useMealPlanStore((s) => s.clearChecked);
  const savedMeals = useLogStore((s) => s.savedMeals);
  const targets = useProfileStore((s) => s.targets);

  const week = useMemo(() => planWeek(todayISO()), []);
  const [day, setDay] = useState(week[0]!);
  const [picking, setPicking] = useState<MealSlot | null>(null);

  const totals = dayTotals(plan, day);
  const gap = gapFor(totals, targets);
  const summary = summariseWeek(plan, week, targets);
  const list = useMemo(() => groceryList(plan, savedMeals), [plan, savedMeals]);
  const ranked = useMemo(() => rankMeals(savedMeals), [savedMeals]);

  const [tab, setTab] = useState<'plan' | 'shop'>('plan');

  return (
    <Screen gradient>
      <ScreenHeader title="Meal plan" subtitle="Plan the week, shop from the list" />

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
        {(['plan', 'shop'] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            accessibilityRole="button"
            accessibilityState={{ selected: t === tab }}
            accessibilityLabel={t === 'plan' ? 'The week' : 'Shopping list'}
            style={[styles.tab, t === tab && { backgroundColor: `${colors.primary}22`, borderColor: colors.primary }]}
          >
            <Text variant="label" color={t === tab ? colors.primary : colors.textDim} center>
              {t === 'plan' ? 'The week' : `Shopping (${list.length})`}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'plan' ? (
        <>
          <Text variant="caption" color={colors.textDim} style={{ marginBottom: spacing.sm }}>
            {summary.note}
          </Text>

          <View style={{ flexDirection: 'row', gap: 4, marginBottom: spacing.md }}>
            {week.map((d) => {
              const count = mealsOn(plan, d).length;
              return (
                <Pressable
                  key={d}
                  onPress={() => setDay(d)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: d === day }}
                  accessibilityLabel={formatDayMonth(d)}
                  style={[
                    styles.day,
                    count > 0 && { backgroundColor: `${colors.primary}1A` },
                    d === day && { borderColor: colors.primary, borderWidth: 1.5 },
                  ]}
                >
                  {/* The letter as well as the date: "23" alone does not tell
                      anyone whether they are planning a Tuesday. */}
                  <Text variant="caption" color={d === day ? colors.primary : colors.textFaint} style={{ fontSize: 9 }}>
                    {DAY_LETTER[weekdayIndex(d)]}
                  </Text>
                  <Text variant="caption" color={d === day ? colors.primary : colors.textDim} style={{ fontSize: 11 }}>
                    {d.slice(8)}
                  </Text>
                  <View style={[styles.dot, { backgroundColor: count > 0 ? colors.primary : 'transparent' }]} />
                </Pressable>
              );
            })}
          </View>

          <FadeIn>
            <Card style={{ gap: spacing.md, marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row' }}>
                <StatTile value={groupThousands(totals.calories)} label="Planned kcal" accent={colors.calorie} />
                <StatTile value={`${Math.round(totals.proteinG)}`} label="Protein" accent={colors.protein} />
                <StatTile
                  value={gap.onTarget ? '✓' : gap.calories > 0 ? `+${groupThousands(gap.calories)}` : `−${groupThousands(Math.abs(gap.calories))}`}
                  label="vs target"
                  accent={gap.onTarget ? colors.success : colors.amber}
                />
              </View>
              <Text variant="caption" color={colors.textFaint}>{gap.note}</Text>
            </Card>
          </FadeIn>

          {SLOT_ORDER.map((slot) => {
            const planned = mealsOn(plan, day).filter((m) => m.slot === slot);
            return (
              <View key={slot}>
                <SectionHeader
                  title={SLOT_LABEL[slot]}
                  accent={domainAccent.nutrition}
                  action={picking === slot ? 'Close' : 'Add'}
                  onAction={() => setPicking(picking === slot ? null : slot)}
                />
                <Card style={{ gap: spacing.sm, marginBottom: spacing.md }}>
                  {planned.length === 0 && picking !== slot && (
                    <Text variant="caption" color={colors.textFaint}>Nothing planned.</Text>
                  )}
                  {planned.map((m) => (
                    <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Text variant="label" color={colors.text} style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
                        {m.name}
                        {m.servings !== 1 ? ` × ${m.servings}` : ''}
                      </Text>
                      <Text variant="caption" color={colors.textFaint}>
                        {groupThousands(Math.round(m.macros.calories * m.servings))}
                      </Text>
                      <Pressable
                        onPress={() => remove(m.id)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${m.name}`}
                      >
                        <Icon name="close" size={14} color={colors.textFaint} />
                      </Pressable>
                    </View>
                  ))}

                  {picking === slot && (
                    <View style={{ gap: 6, paddingTop: planned.length > 0 ? spacing.sm : 0 }}>
                      {ranked.length === 0 ? (
                        <Text variant="caption" color={colors.textFaint}>
                          Save a meal first — the plan is built from your saved meals and recipes.
                        </Text>
                      ) : (
                        ranked.slice(0, 8).map((meal) => (
                          <Pressable
                            key={meal.id}
                            onPress={() => {
                              add(meal, day, slot);
                              setPicking(null);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`Plan ${meal.name}`}
                            style={styles.pick}
                          >
                            <Text variant="caption" color={colors.text} style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
                              {meal.name}
                            </Text>
                            <Icon name="plus" size={13} color={colors.primary} />
                          </Pressable>
                        ))
                      )}
                    </View>
                  )}
                </Card>
              </View>
            );
          })}
        </>
      ) : list.length === 0 ? (
        <EmptyState
          icon="list"
          title="Nothing to shop for yet"
          subtitle="Plan some meals from your saved recipes and the ingredients gather here, merged and scaled to the servings you planned."
          action="Back to the week"
          onAction={() => setTab('plan')}
        />
      ) : (
        <>
          <Card style={{ gap: spacing.sm, marginBottom: spacing.md }}>
            {list.map((item) => {
              const key = `${item.name}::${item.servingLabel}`;
              const done = checked.includes(key);
              return (
                <Pressable
                  key={key}
                  onPress={() => toggleChecked(key)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done }}
                  accessibilityLabel={item.name}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
                >
                  <Icon name={done ? 'check' : 'plus'} size={14} color={done ? colors.success : colors.textFaint} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      variant="label"
                      color={done ? colors.textFaint : colors.text}
                      style={done ? { textDecorationLine: 'line-through' } : undefined}
                    >
                      {item.name}
                    </Text>
                    <Text variant="caption" color={colors.textFaint} numberOfLines={1}>
                      {formatQuantity(item)} · for {item.usedIn.join(', ')}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </Card>

          <Pressable
            onPress={clearChecked}
            accessibilityRole="button"
            accessibilityLabel="Clear ticks"
            style={{ paddingVertical: spacing.md }}
          >
            <Text variant="caption" color={colors.primary} center>
              Clear ticks after shopping
            </Text>
          </Pressable>
        </>
      )}

      <Card tone="alt" style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="shield" size={14} color={colors.textDim} />
          <Text variant="overline" color={colors.textDim}>A PLAN IS NOT A LOG</Text>
        </View>
        <Text variant="caption" color={colors.textFaint}>{MEAL_PLAN_NOTE}</Text>
      </Card>

      <Pressable
        onPress={() => router.push('/nutrition/meals')}
        accessibilityRole="link"
        accessibilityLabel="Go to saved meals"
        style={{ paddingVertical: spacing.lg }}
      >
        <Text variant="label" color={colors.primary} center>Saved meals &amp; recipes ›</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tab: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  day: {
    flex: 1,
    minWidth: 0,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  dot: { width: 4, height: 4, borderRadius: 2 },
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
});

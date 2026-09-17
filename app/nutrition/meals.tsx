import React, { useMemo, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Card, EmptyState, Screen, SectionHeader, Text } from '../../src/components/ui';
import { FadeIn } from '../../src/components/anim';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { colors, noOutline, radius, spacing } from '../../src/theme';
import { formatDayMonth } from '../../src/domain/date';
import { mealMacros, rankMeals } from '../../src/domain/savedMeals';
import type { MealSlot } from '../../src/domain/types';
import { useLogStore } from '../../src/stores/useLogStore';

const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export default function SavedMeals() {
  const meals = useLogStore((s) => s.savedMeals);
  const logSavedMeal = useLogStore((s) => s.logSavedMeal);
  const renameMeal = useLogStore((s) => s.renameMeal);
  const removeMeal = useLogStore((s) => s.removeMeal);

  const ranked = useMemo(() => rankMeals(meals), [meals]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const commitRename = (id: string) => {
    renameMeal(id, draftName);
    setEditing(null);
  };

  return (
    <Screen gradient>
      <ScreenHeader title="Saved meals" />

      {ranked.length === 0 ? (
        <EmptyState
          icon="nutrition"
          title="No saved meals yet"
          subtitle="Log a meal with a couple of items, then tap 'Save this as a meal' underneath it."
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          {ranked.map((m, i) => {
            const totals = mealMacros(m.items);
            return (
              <FadeIn key={m.id} delay={Math.min(200, i * 30)}>
                <Card style={{ gap: spacing.md }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      {editing === m.id ? (
                        <TextInput
                          value={draftName}
                          onChangeText={setDraftName}
                          onBlur={() => commitRename(m.id)}
                          onSubmitEditing={() => commitRename(m.id)}
                          autoFocus
                          accessibilityLabel="Meal name"
                          selectionColor={colors.primary}
                          style={[styles.nameInput, noOutline]}
                        />
                      ) : (
                        <Pressable
                          onPress={() => {
                            setDraftName(m.name);
                            setEditing(m.id);
                          }}
                          hitSlop={6}
                          accessibilityRole="button"
                          accessibilityLabel={`Rename ${m.name}`}
                        >
                          <Text variant="bodyStrong" numberOfLines={1}>{m.name}</Text>
                        </Pressable>
                      )}
                      <Text variant="caption" color={colors.textDim}>
                        {SLOT_LABEL[m.slot]} · {m.items.length} item{m.items.length === 1 ? '' : 's'} ·{' '}
                        {m.timesLogged === 0
                          ? `saved ${formatDayMonth(m.createdAt)}`
                          : `logged ${m.timesLogged}×`}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() =>
                        Alert.alert('Delete meal?', m.name, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => removeMeal(m.id) },
                        ])
                      }
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${m.name}`}
                      style={styles.iconBtn}
                    >
                      <Icon name="trash" size={15} color={colors.danger} strokeWidth={1.8} />
                    </Pressable>
                  </View>

                  <View style={{ gap: 4 }}>
                    {m.items.map((it, idx) => (
                      <View key={`${it.name}_${idx}`} style={{ flexDirection: 'row', gap: spacing.sm }}>
                        <Text variant="caption" color={colors.textFaint} style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
                          {it.quantity === 1 ? '' : `${it.quantity}× `}
                          {it.name}
                        </Text>
                        <Text variant="caption" color={colors.textFaint}>
                          {Math.round(it.macros.calories * it.quantity)}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.totals}>
                    <Macro label="kcal" value={totals.calories} tint={colors.calorie} />
                    <Macro label="P" value={totals.proteinG} tint={colors.protein} />
                    <Macro label="C" value={totals.carbsG} tint={colors.carbs} />
                    <Macro label="F" value={totals.fatG} tint={colors.fat} />
                  </View>

                  {/* Every chip logs the meal. Highlighting the meal's usual
                      slot made the row look like a setting you were changing
                      rather than four buttons. The usual slot is already in the
                      line above. */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                    <Text variant="caption" color={colors.textFaint}>Log into</Text>
                    {(['breakfast', 'lunch', 'dinner', 'snack'] as MealSlot[]).map((slot) => (
                      <Pressable
                        key={slot}
                        onPress={() => {
                          const n = logSavedMeal(m.id, slot);
                          if (n > 0) router.push('/(tabs)/nutrition');
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Log ${m.name} into ${SLOT_LABEL[slot].toLowerCase()}`}
                        style={styles.slotChip}
                      >
                        <Text variant="caption" color={colors.text}>{SLOT_LABEL[slot]}</Text>
                      </Pressable>
                    ))}
                  </View>
                </Card>
              </FadeIn>
            );
          })}
        </View>
      )}

      <SectionHeader title="How these work" />
      <Card>
        <Text variant="caption" color={colors.textFaint}>
          A saved meal keeps a copy of the foods as they were when you saved it, so editing or deleting
          today&apos;s entries never changes it. Logging one adds every item to the slot you pick, and each
          item stays marked as an estimate — saving something does not make it a measurement.
        </Text>
      </Card>
    </Screen>
  );
}

function Macro({ label, value, tint }: { label: string; value: number; tint: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 1 }}>
      <Text variant="bodyStrong" color={tint}>{Math.round(value)}</Text>
      <Text variant="caption" color={colors.textFaint} style={{ fontSize: 10 }}>{label}</Text>
    </View>
  );
}

const styles = {
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  nameInput: {
    color: colors.text,
    fontSize: 15,
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
  },
  totals: {
    flexDirection: 'row' as const,
    paddingVertical: spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  slotChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
};

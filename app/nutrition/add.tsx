import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Chip, EmptyState, IconButton, Input, Pill, Screen, SegmentedControl, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { colors, radius, spacing } from '../../src/theme';
import type { FoodMacros, MealSlot } from '../../src/domain/types';
import { caloriesFromMacros, frequentFoods, sanitizeMacros, scaleMacros } from '../../src/domain/nutrition';
import { PORTIONS, type LibraryFood } from '../../src/domain/foodLibrary';
import { useFoodStore } from '../../src/stores/useFoodStore';
import { useLogStore } from '../../src/stores/useLogStore';
import { ai } from '../../src/services/ai';

type Mode = 'search' | 'manual' | 'ai';
const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function AddFood() {
  const params = useLocalSearchParams<{ slot?: MealSlot }>();
  const addFood = useLogStore((s) => s.addFood);
  const [mode, setMode] = useState<Mode>('search');
  const [slot, setSlot] = useState<MealSlot>(params.slot ?? currentSlot());

  return (
    <Screen gradient>
      <ScreenHeader title="Add Food" />

      <SegmentedControl
        options={[
          { label: 'Search', value: 'search' },
          { label: 'Manual', value: 'manual' },
          { label: 'AI Estimate', value: 'ai' },
        ]}
        value={mode}
        onChange={(m) => setMode(m as Mode)}
      />

      <View style={{ marginTop: spacing.md, marginBottom: spacing.md }}>
        <Text variant="label" color={colors.textDim} style={{ marginBottom: spacing.sm }}>
          Meal
        </Text>
        <SegmentedControl options={SLOTS.map((s) => ({ label: cap(s), value: s }))} value={slot} onChange={setSlot} />
      </View>

      {mode === 'search' && <SearchMode slot={slot} onSaved={() => router.back()} addFood={addFood} />}
      {mode === 'manual' && <ManualMode slot={slot} onSaved={() => router.back()} addFood={addFood} />}
      {mode === 'ai' && <AIMode slot={slot} onSaved={() => router.back()} addFood={addFood} />}
    </Screen>
  );
}

type AddFn = ReturnType<typeof useLogStore.getState>['addFood'];

function SearchMode({ slot, onSaved, addFood }: { slot: MealSlot; onSaved: () => void; addFood: AddFn }) {
  const [q, setQ] = useState('');
  const [portion, setPortion] = useState(1);
  const history = useLogStore((s) => s.nutrition);
  // The whole library, not just the staples: what somebody typed in
  // themselves is what they eat, and it outranks everything shipped.
  const results = useFoodStore((s) => s.search(q));
  const noteUse = useFoodStore((s) => s.noteUse);

  // Most people eat the same dozen things, so searching a database is the slow
  // path for nearly every entry. Hidden once a query is typed, where it would
  // sit above results that answer the question better.
  const frequent = useMemo(() => (q.trim() ? [] : frequentFoods(history, 8)), [history, q]);

  const save = (f: LibraryFood) => {
    addFood({
      slot,
      name: f.brand ? `${f.brand} ${f.name}` : f.name,
      quantity: portion,
      servingLabel: f.servingLabel,
      macros: scaleMacros(f, portion),
      source: 'search',
      isEstimate: Boolean(f.estimated),
    });
    noteUse(f.id);
    onSaved();
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <Input icon="search" value={q} onChangeText={setQ} placeholder="Search foods (e.g. chicken)" autoFocus autoCapitalize="none" />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, flex: 1 }}>
          {PORTIONS.map((p) => (
            <Chip key={p.label} label={p.label} selected={portion === p.multiplier} onPress={() => setPortion(p.multiplier)} />
          ))}
        </View>
        <IconButton
          accessibilityLabel="Scan a barcode"
          onPress={() => router.push({ pathname: '/nutrition/scan', params: { slot } })}
        >
          <Icon name="camera" size={20} color={colors.text} />
        </IconButton>
      </View>

      {frequent.length > 0 && (
        <View style={{ marginTop: spacing.xs }}>
          <Text variant="overline" color={colors.textDim} style={{ marginBottom: spacing.sm }}>
            You log these
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {frequent.map((f) => {
              const total = scaleMacros(f.macros, f.quantity);
              return (
                <Pressable
                  key={`${f.name}|${f.servingLabel}`}
                  onPress={() => {
                    // Re-logged at the portion used last time, into the meal
                    // chosen above rather than the one it was first eaten in.
                    addFood({
                      slot,
                      name: f.name,
                      quantity: f.quantity,
                      servingLabel: f.servingLabel,
                      macros: f.macros,
                      source: 'search',
                      isEstimate: f.isEstimate,
                    });
                    onSaved();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Log ${f.name}, ${total.calories} calories`}
                  style={styles.frequent}
                >
                  <Icon name="plus" size={13} color={colors.primary} strokeWidth={2.4} />
                  <Text variant="label" numberOfLines={1} style={{ maxWidth: 150 }}>
                    {f.name}
                  </Text>
                  <Text variant="caption" color={colors.textFaint}>
                    {total.calories}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
      {results.length === 0 ? (
        <EmptyState
          icon="search"
          title={q.trim() ? `No match for "${q.trim()}"` : 'Search the food database'}
          subtitle="Or switch to Manual to enter macros yourself, or AI Estimate to describe a meal."
        />
      ) : (
        /* One card with divided rows: separate cards per food halved how many
           results fit on screen. */
        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          {results.map((f, i) => (
            <Pressable
              key={f.id}
              onPress={() => save(f)}
              accessibilityRole="button"
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  paddingVertical: spacing.md,
                  borderBottomWidth: i === results.length - 1 ? 0 : StyleSheet.hairlineWidth,
                  borderBottomColor: colors.border,
                },
                pressed && { opacity: 0.6 },
              ]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {f.brand ? `${f.brand} ${f.name}` : f.name}
                  </Text>
                  {/* Your own foods can share a name with a staple — the same
                      tin of beans, scanned, sits beside the generic one. Two
                      identical-looking rows is the sort of thing that makes
                      people distrust a list, so the source is on the row. */}
                  {f.source !== 'bundled' && (
                    <Pill label={f.source === 'scanned' ? 'Scanned' : 'Yours'} color={colors.lime} />
                  )}
                </View>
                <Text variant="caption" color={colors.textDim}>
                  {f.servingLabel} · P{Math.round(f.proteinG)} C{Math.round(f.carbsG)} F{Math.round(f.fatG)}
                </Text>
              </View>
              <Text variant="bodyStrong" color={colors.calorie}>
                {f.calories}
                <Text variant="caption" color={colors.textFaint}>
                  {' '}
                  kcal
                </Text>
              </Text>
            </Pressable>
          ))}
        </Card>
      )}
    </View>
  );
}

function ManualMode({ slot, onSaved, addFood }: { slot: MealSlot; onSaved: () => void; addFood: AddFn }) {
  const [name, setName] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [calories, setCalories] = useState('');

  const derived = caloriesFromMacros({ proteinG: num(protein), carbsG: num(carbs), fatG: num(fat) });

  const save = () => {
    const macros: FoodMacros = {
      calories: num(calories) || derived,
      proteinG: num(protein),
      carbsG: num(carbs),
      fatG: num(fat),
    };
    addFood({ slot, name: name.trim() || 'Food', quantity: 1, servingLabel: '1 serving', macros, source: 'manual', isEstimate: false });
    onSaved();
  };

  return (
    <View style={{ gap: spacing.md }}>
      <Input label="Name" value={name} onChangeText={setName} placeholder="e.g. Homemade chili" />
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}><Input label="Protein" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" suffix="g" /></View>
        <View style={{ flex: 1 }}><Input label="Carbs" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" suffix="g" /></View>
        <View style={{ flex: 1 }}><Input label="Fat" value={fat} onChangeText={setFat} keyboardType="decimal-pad" suffix="g" /></View>
      </View>
      <Input label={`Calories (auto: ${derived})`} value={calories} onChangeText={setCalories} keyboardType="number-pad" suffix="kcal" placeholder={String(derived)} />
      <Button title="Add Food" onPress={save} disabled={!protein && !carbs && !fat && !calories} />
    </View>
  );
}

function AIMode({ slot, onSaved, addFood }: { slot: MealSlot; onSaved: () => void; addFood: AddFn }) {
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const [estimate, setEstimate] = useState<{ name: string; serving: string; macros: FoodMacros } | null>(null);

  const analyze = async () => {
    setLoading(true);
    try {
      const res = await ai.analyzeFood({ description: desc });
      setEstimate({ name: res.name, serving: res.servingLabel, macros: res.macros });
    } finally {
      setLoading(false);
    }
  };

  const patch = (k: keyof FoodMacros, v: string) =>
    setEstimate((e) => (e ? { ...e, macros: sanitizeMacros({ ...e.macros, [k]: num(v) }).macros } : e));

  const save = () => {
    if (!estimate) return;
    addFood({ slot, name: estimate.name, quantity: 1, servingLabel: estimate.serving, macros: estimate.macros, source: 'photo', isEstimate: true });
    onSaved();
  };

  return (
    <View style={{ gap: spacing.md }}>
      <Card tone="alt">
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
          <Icon name="bolt" size={18} color={colors.primary} />
          <Text variant="caption" color={colors.textDim} style={{ flex: 1 }}>
            AI returns an ESTIMATE. Describe your meal (or attach a photo in a native build) and edit any value before saving.
          </Text>
        </View>
      </Card>
      <Input label="Describe your meal" value={desc} onChangeText={setDesc} placeholder="e.g. chicken burrito bowl with rice, beans, salsa" multiline />
      <Button title="Estimate with AI" onPress={analyze} loading={loading} icon={<Icon name="camera" size={18} color={colors.onPrimary} />} />

      {estimate && (
        <Card style={{ gap: spacing.sm }}>
          <Input label="Food" value={estimate.name} onChangeText={(name) => setEstimate((e) => (e ? { ...e, name } : e))} />
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}><Input label="Calories" value={String(estimate.macros.calories)} onChangeText={(v) => patch('calories', v)} keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><Input label="Protein" value={String(estimate.macros.proteinG)} onChangeText={(v) => patch('proteinG', v)} keyboardType="decimal-pad" suffix="g" /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}><Input label="Carbs" value={String(estimate.macros.carbsG)} onChangeText={(v) => patch('carbsG', v)} keyboardType="decimal-pad" suffix="g" /></View>
            <View style={{ flex: 1 }}><Input label="Fat" value={String(estimate.macros.fatG)} onChangeText={(v) => patch('fatG', v)} keyboardType="decimal-pad" suffix="g" /></View>
          </View>
          <Button title="Save Estimate" onPress={save} />
        </Card>
      )}
    </View>
  );
}

const num = (s: string) => parseFloat(s) || 0;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function currentSlot(): MealSlot {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

const styles = StyleSheet.create({
  frequent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
  },
});

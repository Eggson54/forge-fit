import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Input, Screen, SegmentedControl, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { colors, spacing } from '../../src/theme';
import type { FoodMacros, MealSlot, SavedFood } from '../../src/domain/types';
import { caloriesFromMacros, sanitizeMacros } from '../../src/domain/nutrition';
import { searchFoods } from '../../src/data/foods';
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
  const results = searchFoods(q);
  const save = (f: SavedFood) => {
    addFood({ slot, name: f.name, quantity: 1, servingLabel: f.servingLabel, macros: f, source: 'search', isEstimate: false });
    onSaved();
  };
  return (
    <View style={{ gap: spacing.sm }}>
      <Input value={q} onChangeText={setQ} placeholder="Search foods (e.g. chicken)" autoFocus autoCapitalize="none" />
      {results.map((f) => (
        <Card key={f.id} onPress={() => save(f)}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text variant="body">{f.name}</Text>
              <Text variant="caption" color={colors.textDim}>
                {f.servingLabel} · P{f.proteinG} C{f.carbsG} F{f.fatG}
              </Text>
            </View>
            <Text variant="bodyStrong" color={colors.primary}>
              {f.calories}
            </Text>
          </View>
        </Card>
      ))}
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

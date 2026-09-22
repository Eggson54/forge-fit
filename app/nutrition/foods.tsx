import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, EmptyState, Input, Pill, Screen, SectionHeader, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { colors, spacing } from '../../src/theme';
import {
  BARCODE_NOTE,
  FOOD_LIBRARY_NOTE,
  caloriesFromMacros,
  checkMacros,
} from '../../src/domain/foodLibrary';
import { FOOD_DB } from '../../src/data/foods';
import { useFoodStore } from '../../src/stores/useFoodStore';

/**
 * The foods this person added themselves.
 *
 * Only theirs — the bundled staples are not listed, because a list somebody
 * cannot edit or delete is not a library, it is furniture. The count is shown
 * so it is clear the staples exist without making them scrollable.
 */
export default function MyFoods() {
  const mine = useFoodStore((s) => s.mine);
  const add = useFoodStore((s) => s.add);
  const remove = useFoodStore((s) => s.remove);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [serving, setServing] = useState('1 serving');
  const [macros, setMacros] = useState({ calories: '', proteinG: '', carbsG: '', fatG: '', fiberG: '' });

  const num = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const entered = {
    calories: num(macros.calories),
    proteinG: num(macros.proteinG),
    carbsG: num(macros.carbsG),
    fatG: num(macros.fatG),
    ...(macros.fiberG.trim() ? { fiberG: num(macros.fiberG) } : null),
  };
  const implied = caloriesFromMacros(entered);
  const problems = checkMacros(entered);

  const save = () => {
    add({
      name,
      brand,
      servingLabel: serving,
      macros: entered.calories > 0 ? entered : { ...entered, calories: implied },
    });
    setAdding(false);
    setName('');
    setBrand('');
    setServing('1 serving');
    setMacros({ calories: '', proteinG: '', carbsG: '', fatG: '', fiberG: '' });
  };

  const scanned = mine.filter((f) => f.source === 'scanned');
  const custom = mine.filter((f) => f.source === 'custom');

  return (
    <Screen gradient>
      <ScreenHeader title="My foods" subtitle={`${mine.length} yours · ${FOOD_DB.length} built in`} />

      <Card style={{ gap: spacing.md }}>
        <Button
          title="Scan a barcode"
          onPress={() => router.push('/nutrition/scan')}
        />
        {!adding && <Button title="Add one by hand" variant="secondary" onPress={() => setAdding(true)} />}
        <Text variant="caption" color={colors.textFaint}>{FOOD_LIBRARY_NOTE}</Text>
      </Card>

      {adding && (
        <>
          <SectionHeader title="New food" />
          <Card style={{ gap: spacing.md }}>
            <Input value={name} onChangeText={setName} placeholder="Name" />
            <Input value={brand} onChangeText={setBrand} placeholder="Brand (optional)" />
            <Input value={serving} onChangeText={setServing} placeholder="Serving, e.g. 100 g" />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {(['calories', 'proteinG'] as const).map((k) => (
                <View key={k} style={{ flex: 1 }}>
                  <Text variant="label" color={colors.textDim}>{k === 'calories' ? 'Calories' : 'Protein'}</Text>
                  <Input value={macros[k]} onChangeText={(v) => setMacros((m) => ({ ...m, [k]: v }))} keyboardType="decimal-pad" placeholder={k === 'calories' ? 'kcal' : 'protein g'} />
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {(['carbsG', 'fatG', 'fiberG'] as const).map((k) => (
                <View key={k} style={{ flex: 1 }}>
                  <Text variant="label" color={colors.textDim}>
                    {k === 'carbsG' ? 'Carbs' : k === 'fatG' ? 'Fat' : 'Fibre'}
                  </Text>
                  <Input value={macros[k]} onChangeText={(v) => setMacros((m) => ({ ...m, [k]: v }))} keyboardType="decimal-pad" placeholder={k === 'carbsG' ? 'carbs g' : k === 'fatG' ? 'fat g' : 'fibre g'} />
                </View>
              ))}
            </View>
            {problems.length > 0 && (
              <Text variant="caption" color={colors.amber}>{problems[0]!.message}</Text>
            )}
            {entered.calories === 0 && implied > 0 && (
              <Text variant="caption" color={colors.textFaint}>
                Leave calories blank and {implied} kcal is used, worked out from the macros.
              </Text>
            )}
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button title="Save" disabled={!name.trim() || implied === 0} onPress={save} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Cancel" variant="ghost" onPress={() => setAdding(false)} />
              </View>
            </View>
          </Card>
        </>
      )}

      {mine.length === 0 && !adding && (
        <EmptyState
          icon="nutrition"
          title="Nothing of your own yet"
          subtitle={`The ${FOOD_DB.length} staples that ship with the app are already searchable. Anything else you eat, add once and it is there forever — and it ranks above the built-in ones.`}
        />
      )}

      {custom.length > 0 && (
        <>
          <SectionHeader title="Added by hand" />
          {custom.map((f) => (
            <FoodRow key={f.id} food={f} onRemove={() => remove(f.id)} />
          ))}
        </>
      )}

      {scanned.length > 0 && (
        <>
          <SectionHeader title="Scanned" />
          {scanned.map((f) => (
            <FoodRow key={f.id} food={f} onRemove={() => remove(f.id)} />
          ))}
          <Text variant="caption" color={colors.textFaint}>{BARCODE_NOTE}</Text>
        </>
      )}
    </Screen>
  );
}

function FoodRow({
  food,
  onRemove,
}: {
  food: ReturnType<typeof useFoodStore.getState>['mine'][number];
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <Card style={{ gap: 4, marginBottom: spacing.sm }}>
      <View style={styles.row}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {food.brand ? `${food.brand} ${food.name}` : food.name}
          </Text>
          <Text variant="caption" color={colors.textFaint}>
            {food.servingLabel} · {Math.round(food.calories)} kcal · {food.proteinG}g protein
            {food.uses ? ` · logged ${food.uses}×` : ''}
          </Text>
        </View>
        {food.barcode && <Pill label="Scanned" color={colors.textDim} />}
      </View>
      {confirming ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button title="Delete it" variant="danger" onPress={onRemove} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Keep" variant="ghost" onPress={() => setConfirming(false)} />
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="trash" size={13} color={colors.textFaint} />
          <Text variant="caption" color={colors.textFaint} onPress={() => setConfirming(true)}>
            Remove — meals already logged with it are unaffected
          </Text>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});

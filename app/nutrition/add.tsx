import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
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
import { usdaFoods } from '../../src/services/usdaFoods';
import { USDA_NOTE, type UsdaFoodResult } from '../../src/domain/usda';
import {
  CONFIDENCE_COPY,
  PHOTO_ESTIMATE_NOTE,
  PHOTO_PRIVACY_NOTE,
  checkEstimate,
  estimateSource,
  type PhotoEstimate,
} from '../../src/domain/photoEstimate';
import { mealPhoto } from '../../src/services/mealPhoto';

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

  /**
   * USDA FoodData Central, searched only once typing pauses.
   *
   * The key behind this lives on the server and is rate limited per key
   * rather than per user, so a request per keystroke spends an hourly
   * allowance that belongs to everyone on the deployment. Three characters
   * because two-letter searches return noise from a database this size.
   */
  const [remote, setRemote] = useState<UsdaFoodResult[]>([]);
  const [remoteState, setRemoteState] = useState<'idle' | 'loading' | 'ok' | 'off' | 'error'>('idle');
  const [remoteNote, setRemoteNote] = useState('');

  useEffect(() => {
    if (!usdaFoods.enabled()) {
      setRemoteState('off');
      return;
    }
    const query = q.trim();
    if (query.length < 3) {
      setRemote([]);
      setRemoteState('idle');
      return;
    }

    let live = true;
    setRemoteState('loading');
    const timer = setTimeout(() => {
      void usdaFoods.search(query, { pageSize: 12 }).then((outcome) => {
        // The query may have moved on while this was in flight; a late
        // response for "chic" landing under "chickpea" is worse than none.
        if (!live) return;
        if (outcome.kind === 'ok') {
          setRemote(outcome.data);
          setRemoteState('ok');
          return;
        }
        setRemote([]);
        setRemoteState(outcome.kind === 'not_configured' ? 'off' : 'error');
        setRemoteNote('reason' in outcome ? outcome.reason : 'That search did not come back.');
      });
    }, 400);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);

  const saveRemote = (f: UsdaFoodResult) => {
    addFood({
      slot,
      name: f.brand ? `${f.brand} ${f.name}` : f.name,
      quantity: portion,
      servingLabel: f.servingLabel,
      macros: scaleMacros(f.macros, portion),
      source: 'search',
      // Laboratory reference data is not an estimate — but a record missing
      // macros is being completed with zeroes here, and that must not read
      // as something that was measured.
      isEstimate: f.missing.length > 0,
    });
    onSaved();
  };

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

      {/* USDA sits below the local results on purpose. What somebody has
          logged before, or typed in themselves, is a better answer than a
          reference record however good the reference is. */}
      {remoteState !== 'off' && q.trim().length >= 3 && (
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <Text variant="overline" color={colors.textDim}>
            USDA FoodData Central
          </Text>

          {remoteState === 'loading' && (
            <Text variant="caption" color={colors.textFaint}>
              Searching USDA…
            </Text>
          )}
          {remoteState === 'error' && (
            <Text variant="caption" color={colors.textFaint}>
              {remoteNote}
            </Text>
          )}
          {remoteState === 'ok' && remote.length === 0 && (
            <Text variant="caption" color={colors.textFaint}>
              Nothing in USDA for that. Manual entry always works.
            </Text>
          )}

          {remote.length > 0 && (
            <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
              {remote.map((f, i) => (
                <Pressable
                  key={f.fdcId}
                  onPress={() => saveRemote(f)}
                  accessibilityRole="button"
                  accessibilityLabel={`Log ${f.name}, ${f.macros.calories} calories per ${f.servingLabel}`}
                  style={({ pressed }) => [
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.md,
                      paddingVertical: spacing.md,
                      borderBottomWidth: i === remote.length - 1 ? 0 : StyleSheet.hairlineWidth,
                      borderBottomColor: colors.border,
                    },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text variant="bodyStrong" numberOfLines={2} style={{ flexShrink: 1 }}>
                        {f.brand ? `${f.brand} ${f.name}` : f.name}
                      </Text>
                    </View>
                    <Text variant="caption" color={colors.textDim}>
                      {f.servingLabel} · P{Math.round(f.macros.proteinG)} C{Math.round(f.macros.carbsG)} F
                      {Math.round(f.macros.fatG)}
                    </Text>
                    {f.category && (
                      <Text variant="caption" color={colors.textFaint}>
                        {f.category}
                      </Text>
                    )}
                    {/* A reference record with holes in it is still worth
                        offering — but saying which values are missing is the
                        difference between a gap and a silent zero. */}
                    {f.missing.length > 0 && (
                      <Text variant="caption" color={colors.warning}>
                        No {f.missing.join(', ')} on this record — check before saving.
                      </Text>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text variant="bodyStrong" color={colors.calorie}>
                      {f.macros.calories}
                      <Text variant="caption" color={colors.textFaint}> kcal</Text>
                    </Text>
                    <Pill label={f.dataType === 'Branded' ? 'Brand' : 'Lab'} color={colors.info} />
                  </View>
                </Pressable>
              ))}
            </Card>
          )}

          {remoteState === 'ok' && remote.length > 0 && (
            <Text variant="caption" color={colors.textFaint}>
              {USDA_NOTE}
            </Text>
          )}
        </View>
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
  const [photo, setPhoto] = useState<{ uri: string; base64: string; bytes: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [estimate, setEstimate] = useState<PhotoEstimate | null>(null);

  const canPhoto = mealPhoto.available();
  const canCamera = mealPhoto.cameraAvailable();

  const takePhoto = async (how: 'capture' | 'choose') => {
    setError('');
    const outcome = how === 'capture' ? await mealPhoto.capture() : await mealPhoto.choose();
    if (outcome.kind === 'ok') {
      setPhoto({ uri: outcome.uri, base64: outcome.base64, bytes: outcome.bytes });
      // A new photo invalidates the estimate on screen. Leaving the old one
      // visible under a new picture is how somebody logs the wrong meal.
      setEstimate(null);
      return;
    }
    if (outcome.kind === 'cancelled') return;
    setError(outcome.reason);
  };

  const analyze = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await ai.analyzeFood({
        ...(desc.trim() ? { description: desc.trim() } : null),
        ...(photo ? { imageBase64: photo.base64 } : null),
      });
      setEstimate({
        name: res.name,
        servingLabel: res.servingLabel,
        macros: res.macros,
        confidence: res.confidence,
        note: res.note,
      });
    } catch {
      // The coach and the estimator both go through a server the athlete
      // runs. When it is down, saying so beats a spinner that never stops.
      setError('The AI server did not answer. You can still type the macros in by hand.');
    } finally {
      setLoading(false);
    }
  };

  const patch = (k: keyof FoodMacros, v: string) =>
    setEstimate((e) => (e ? { ...e, macros: sanitizeMacros({ ...e.macros, [k]: num(v) }).macros } : e));

  const save = () => {
    if (!estimate) return;
    addFood({
      slot,
      name: estimate.name,
      quantity: 1,
      servingLabel: estimate.servingLabel,
      macros: estimate.macros,
      // Only a photograph is recorded as one. This used to say 'photo' for a
      // typed description too, which made the history lie about where a
      // number came from.
      source: estimateSource(Boolean(photo)),
      isEstimate: true,
    });
    onSaved();
  };

  const problems = estimate ? checkEstimate(estimate) : [];
  const nothingToSend = !photo && !desc.trim();

  return (
    <View style={{ gap: spacing.md }}>
      <Card tone="alt">
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
          <Icon name="bolt" size={18} color={colors.primary} />
          <Text variant="caption" color={colors.textDim} style={{ flex: 1 }}>
            {PHOTO_ESTIMATE_NOTE}
          </Text>
        </View>
      </Card>

      {canPhoto ? (
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {canCamera && (
              <View style={{ flex: 1 }}>
                <Button
                  title="Take a photo"
                  variant="secondary"
                  onPress={() => void takePhoto('capture')}
                  icon={<Icon name="camera" size={18} color={colors.text} />}
                />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Button title="Choose a photo" variant="secondary" onPress={() => void takePhoto('choose')} />
            </View>
          </View>

          {photo && (
            <Card style={{ gap: spacing.sm }}>
              <Image
                source={{ uri: photo.uri }}
                style={{ width: '100%', height: 180, borderRadius: radius.md }}
                resizeMode="cover"
                accessibilityLabel="The meal photo you attached"
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text variant="caption" color={colors.textFaint} style={{ flex: 1 }}>
                  {Math.round(photo.bytes / 1024)} KB after shrinking. {PHOTO_PRIVACY_NOTE}
                </Text>
              </View>
              <Button title="Remove photo" variant="ghost" onPress={() => setPhoto(null)} />
            </Card>
          )}
        </View>
      ) : (
        <Text variant="caption" color={colors.textFaint}>
          This build cannot open a camera, so describe the meal instead. Photo estimates need a development build.
        </Text>
      )}

      <Input
        label={photo ? 'Anything the photo does not show (optional)' : 'Describe your meal'}
        value={desc}
        onChangeText={setDesc}
        placeholder={photo ? 'e.g. cooked in two tablespoons of oil' : 'e.g. chicken burrito bowl with rice, beans, salsa'}
        multiline
      />

      <Button
        title={photo ? 'Estimate from the photo' : 'Estimate with AI'}
        onPress={() => void analyze()}
        loading={loading}
        disabled={nothingToSend}
        icon={<Icon name="bolt" size={18} color={colors.onPrimary} />}
      />
      {nothingToSend && (
        <Text variant="caption" color={colors.textFaint}>
          Attach a photo or describe the meal first.
        </Text>
      )}
      {error !== '' && (
        <Text variant="caption" color={colors.danger}>
          {error}
        </Text>
      )}

      {estimate && (
        <Card style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text variant="label" color={colors.textDim} style={{ flex: 1 }}>
              Estimate
            </Text>
            <Pill
              label={`${cap(estimate.confidence)} confidence`}
              color={estimate.confidence === 'low' ? colors.warning : colors.info}
            />
          </View>
          <Text variant="caption" color={colors.textDim}>
            {CONFIDENCE_COPY[estimate.confidence]}
          </Text>

          {/* A model can return macros that do not add up to the calories it
              also returned. Overwriting one silently would hide that; the
              athlete is the one who knows which is closer. */}
          {problems.map((prob) => (
            <Text key={`${prob.field}-${prob.message}`} variant="caption" color={colors.warning}>
              {prob.message}
            </Text>
          ))}

          <Input label="Food" value={estimate.name} onChangeText={(name) => setEstimate((e) => (e ? { ...e, name } : e))} />
          <Input
            label="Portion"
            value={estimate.servingLabel}
            onChangeText={(servingLabel) => setEstimate((e) => (e ? { ...e, servingLabel } : e))}
          />
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}><Input label="Calories" value={String(estimate.macros.calories)} onChangeText={(v) => patch('calories', v)} keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><Input label="Protein" value={String(estimate.macros.proteinG)} onChangeText={(v) => patch('proteinG', v)} keyboardType="decimal-pad" suffix="g" /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}><Input label="Carbs" value={String(estimate.macros.carbsG)} onChangeText={(v) => patch('carbsG', v)} keyboardType="decimal-pad" suffix="g" /></View>
            <View style={{ flex: 1 }}><Input label="Fat" value={String(estimate.macros.fatG)} onChangeText={(v) => patch('fatG', v)} keyboardType="decimal-pad" suffix="g" /></View>
          </View>
          <Button title="Save as an estimate" onPress={save} />
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

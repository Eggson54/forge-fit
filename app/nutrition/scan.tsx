import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Chip, Input, Screen, SectionHeader, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { colors, radius, spacing } from '../../src/theme';
import {
  BARCODE_NOTE,
  PORTIONS,
  caloriesFromMacros,
  checkMacros,
  isProductBarcode,
  scaleMacros,
  type LibraryFood,
} from '../../src/domain/foodLibrary';
import type { MealSlot } from '../../src/domain/types';
import { OFF_ATTRIBUTION, OFF_NOTE, type LookupResult } from '../../src/domain/productLookup';
import { products } from '../../src/services/products';
import { useFoodStore } from '../../src/stores/useFoodStore';
import { useLogStore } from '../../src/stores/useLogStore';

/**
 * Scan a barcode, and log what is behind it.
 *
 * There is no product database behind this, and the screen says so rather
 * than failing mysteriously on the first scan. The trade is explicit: the
 * first tin of a thing costs thirty seconds of typing, and every tin after
 * that is one scan and a tap. For the dozen packaged things somebody
 * actually buys week after week, that pays back immediately — and it keeps
 * working in a supermarket basement with no signal, which is where a lot of
 * food logging happens.
 */
export default function ScanFood() {
  const params = useLocalSearchParams<{ slot?: string }>();
  const slot = (params.slot as MealSlot) ?? 'snack';

  const byBarcode = useFoodStore((s) => s.byBarcode);
  const addFood = useFoodStore((s) => s.add);
  const noteUse = useFoodStore((s) => s.noteUse);
  const log = useLogStore((s) => s.addFood);

  const [code, setCode] = useState<string | null>(null);
  const [known, setKnown] = useState<LibraryFood | null>(null);
  const [manual, setManual] = useState('');
  const [portion, setPortion] = useState(1);

  // New-food form
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [serving, setServing] = useState('1 serving');
  const [macros, setMacros] = useState({ calories: '', proteinG: '', carbsG: '', fatG: '', fiberG: '' });

  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [looking, setLooking] = useState(false);

  const [camera, setCamera] = useState<{ Cam: React.ComponentType<Record<string, unknown>>; usePerm: () => [{ granted: boolean } | null, () => void] } | null>(null);
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied' | 'unavailable'>('unknown');
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setPermission('unavailable');
      return;
    }
    try {
      // Required lazily: a build without the native camera should still show
      // the type-it-in path rather than a white screen.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('expo-camera');
      setCamera({ Cam: mod.CameraView, usePerm: mod.useCameraPermissions });
      void mod.Camera?.requestCameraPermissionsAsync?.()
        .then((r: { granted: boolean }) => setPermission(r?.granted ? 'granted' : 'denied'))
        .catch(() => setPermission('unavailable'));
    } catch {
      setPermission('unavailable');
    }
  }, []);

  const meet = (raw: string) => {
    // A QR code on a cereal box is not a product code, and treating it as one
    // would fill the library with URLs.
    if (!isProductBarcode(raw)) return;
    if (handled.current === raw) return;
    handled.current = raw;
    setCode(raw);
    setLookup(null);

    const mine = byBarcode(raw);
    setKnown(mine);
    // Your own entry always wins. Somebody who corrected a wrong figure once
    // should not have it quietly replaced by the wrong one again.
    if (mine) return;

    setLooking(true);
    void products.lookup(raw).then((result) => {
      setLookup(result);
      setLooking(false);
      if (result.kind === 'found') {
        // Filled in, not saved. Everything stays editable against the packet,
        // because it is a database anybody can edit and sometimes they are
        // wrong.
        setName(result.product.name);
        setBrand(result.product.brand ?? '');
        setServing(result.product.servingLabel);
        setMacros({
          calories: String(result.product.macros.calories),
          proteinG: String(result.product.macros.proteinG),
          carbsG: String(result.product.macros.carbsG),
          fatG: String(result.product.macros.fatG),
          fiberG: result.product.macros.fiberG != null ? String(result.product.macros.fiberG) : '',
        });
      } else if (result.kind === 'no_nutrition' && result.name) {
        setName(result.name);
      }
    });
  };

  const logIt = (food: LibraryFood, multiplier: number) => {
    const scaled = scaleMacros(food, multiplier);
    log({
      slot,
      name: food.brand ? `${food.brand} ${food.name}` : food.name,
      quantity: multiplier,
      servingLabel: food.servingLabel,
      macros: scaled,
      source: 'search',
      isEstimate: Boolean(food.estimated),
    });
    noteUse(food.id);
    router.back();
  };

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
  const problems = checkMacros(entered);
  const implied = caloriesFromMacros(entered);

  const saveNew = () => {
    if (!code || !name.trim()) return;
    const food = addFood({
      name,
      brand,
      servingLabel: serving,
      macros: entered.calories > 0 ? entered : { ...entered, calories: implied },
      barcode: code,
    });
    logIt(food, portion);
  };

  return (
    <Screen gradient>
      <ScreenHeader title="Scan a barcode" />

      {/* ---------------------------------------------------- scanning -- */}
      {!code && (
        <>
          {permission === 'granted' && camera ? (
            <View style={styles.viewfinder}>
              <camera.Cam
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
                onBarcodeScanned={({ data }: { data: string }) => meet(data)}
              />
              <View style={styles.reticle} pointerEvents="none" />
            </View>
          ) : (
            <Card style={{ gap: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Icon name="camera" size={18} color={colors.textDim} />
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {permission === 'denied' ? 'Camera access is off' : 'No camera here'}
                </Text>
              </View>
              <Text variant="caption" color={colors.textDim}>
                {permission === 'denied'
                  ? 'Turn it on in your system settings, or type the numbers under the barcode below — they are the same thing.'
                  : 'Scanning needs a development build on a phone. You can type the numbers under the barcode instead.'}
              </Text>
            </Card>
          )}

          <SectionHeader title="Or type the number" />
          <Card style={{ gap: spacing.md }}>
            <Input
              value={manual}
              onChangeText={setManual}
              keyboardType="number-pad"
              placeholder="The digits under the barcode"
            />
            <Button
              title="Look it up"
              disabled={!isProductBarcode(manual)}
              onPress={() => meet(manual)}
            />
            {manual.length > 0 && !isProductBarcode(manual) && (
              <Text variant="caption" color={colors.textFaint}>
                A product barcode is 8, 12 or 13 digits.
              </Text>
            )}
          </Card>

          <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
            {products.enabled() ? OFF_NOTE : BARCODE_NOTE}
          </Text>
          {products.enabled() && (
            <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
              {OFF_ATTRIBUTION}
            </Text>
          )}
        </>
      )}

      {/* --------------------------------------------- a code we know -- */}
      {code && known && (
        <>
          <Card style={{ gap: spacing.md }}>
            <Text variant="overline" color={colors.success}>KNOWN</Text>
            <Text variant="h3">{known.brand ? `${known.brand} ${known.name}` : known.name}</Text>
            <Text variant="caption" color={colors.textDim}>
              {known.servingLabel} · {Math.round(known.calories)} kcal · {known.proteinG}g protein
            </Text>
            <View style={styles.chips}>
              {PORTIONS.map((p) => (
                <Chip key={p.label} label={p.label} selected={portion === p.multiplier} onPress={() => setPortion(p.multiplier)} />
              ))}
            </View>
            <Text variant="bodyStrong">
              {Math.round(scaleMacros(known, portion).calories)} kcal · {scaleMacros(known, portion).proteinG}g protein
            </Text>
            <Button title="Log it" onPress={() => logIt(known, portion)} />
            <Button title="Scan another" variant="ghost" onPress={() => { handled.current = null; setCode(null); setKnown(null); }} />
          </Card>
        </>
      )}

      {/* ------------------------------------------ a code we have not -- */}
      {code && !known && (
        <>
          <Card style={{ gap: spacing.sm }}>
            {looking ? (
              <>
                <Text variant="overline" color={colors.textFaint}>LOOKING IT UP</Text>
                <Text variant="body" color={colors.textDim}>Asking Open Food Facts about {code}…</Text>
              </>
            ) : lookup?.kind === 'found' ? (
              <>
                <Text variant="overline" color={colors.success}>FOUND IN OPEN FOOD FACTS</Text>
                <Text variant="body" color={colors.textDim}>
                  Filled in below. Check it against the packet before saving — anybody can edit that database, and
                  sometimes a figure is wrong.
                </Text>
                {lookup.product.per100g && (
                  <Text variant="caption" color={colors.amber}>
                    This product publishes no serving size, so the figures are per 100 g. Set the portion to match what
                    you actually ate.
                  </Text>
                )}
                {lookup.product.missing.length > 0 && (
                  <Text variant="caption" color={colors.amber}>
                    No {lookup.product.missing.join(', ')} on record — those are zero below, which is a gap rather than
                    a measurement.
                  </Text>
                )}
              </>
            ) : lookup?.kind === 'no_nutrition' ? (
              <>
                <Text variant="overline" color={colors.amber}>KNOWN, BUT NO FIGURES</Text>
                <Text variant="body" color={colors.textDim}>
                  Open Food Facts has this product but nobody has added its nutrition yet. The name is filled in.
                </Text>
              </>
            ) : lookup?.kind === 'unreachable' ? (
              <>
                <Text variant="overline" color={colors.amber}>COULD NOT LOOK IT UP</Text>
                <Text variant="body" color={colors.textDim}>{lookup.reason}</Text>
              </>
            ) : (
              <>
                <Text variant="overline" color={colors.amber}>NEW TO THE APP</Text>
                <Text variant="body" color={colors.textDim}>
                  Nothing behind this code, here or in Open Food Facts. Copy the figures off the label once and every
                  future tin of it is a single scan.
                </Text>
              </>
            )}
            <Text variant="caption" color={colors.textFaint}>{code}</Text>
          </Card>

          <SectionHeader title="What is it" />
          <Card style={{ gap: spacing.md }}>
            <Input value={name} onChangeText={setName} placeholder="Name, e.g. Baked Beans" />
            <Input value={brand} onChangeText={setBrand} placeholder="Brand (optional)" />
            <Input value={serving} onChangeText={setServing} placeholder="Serving, e.g. 1/2 can or 100 g" />
            <Text variant="caption" color={colors.textFaint}>
              Use whatever serving the label's figures are for. The app scales from there.
            </Text>
          </Card>

          <SectionHeader title="Per serving" />
          <Card style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {(['calories', 'proteinG'] as const).map((k) => (
                <View key={k} style={{ flex: 1 }}>
                  <Text variant="label" color={colors.textDim}>{k === 'calories' ? 'Calories' : 'Protein'}</Text>
                  <Input
                    value={macros[k]}
                    onChangeText={(v) => setMacros((m) => ({ ...m, [k]: v }))}
                    keyboardType="decimal-pad"
                    placeholder={k === 'calories' ? 'kcal' : 'protein g'}
                  />
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {(['carbsG', 'fatG', 'fiberG'] as const).map((k) => (
                <View key={k} style={{ flex: 1 }}>
                  <Text variant="label" color={colors.textDim}>
                    {k === 'carbsG' ? 'Carbs' : k === 'fatG' ? 'Fat' : 'Fibre'}
                  </Text>
                  <Input
                    value={macros[k]}
                    onChangeText={(v) => setMacros((m) => ({ ...m, [k]: v }))}
                    keyboardType="decimal-pad"
                    // Named rather than a bare "g": three identical
                    // placeholders under three different labels is a field
                    // nobody can identify by voice, and a screen reader reads
                    // the placeholder.
                    placeholder={k === 'carbsG' ? 'carbs g' : k === 'fatG' ? 'fat g' : 'fibre g'}
                  />
                </View>
              ))}
            </View>

            {/* Advisory, never blocking: labels round, and fibre and alcohol
                sit outside the four-four-nine model, so a mismatch is a
                prompt to look again rather than a refusal to save. */}
            {problems.length > 0 && (
              <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
                <Icon name="help" size={14} color={colors.amber} />
                <Text variant="caption" color={colors.amber} style={{ flex: 1 }}>
                  {problems[0]!.message}
                </Text>
              </View>
            )}
            {entered.calories === 0 && implied > 0 && (
              <Text variant="caption" color={colors.textFaint}>
                Leave calories blank and the app will use {implied} kcal, worked out from the macros.
              </Text>
            )}
          </Card>

          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            <Button title="Save and log it" disabled={!name.trim() || implied === 0} onPress={saveNew} />
            <Button
              title="Scan something else"
              variant="ghost"
              onPress={() => { handled.current = null; setCode(null); setName(''); setBrand(''); setLookup(null); }}
            />
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  viewfinder: {
    height: 300, borderRadius: radius.md, overflow: 'hidden',
    backgroundColor: colors.surface, marginBottom: spacing.md,
  },
  reticle: {
    position: 'absolute', left: '12%', right: '12%', top: '34%', height: '32%',
    borderWidth: 2, borderColor: colors.primary, borderRadius: radius.sm, opacity: 0.85,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});

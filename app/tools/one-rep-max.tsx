import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Input, Screen, SectionHeader, StatTile, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { colors, radius, spacing } from '../../src/theme';
import { brzycki1RM, epley1RM, percentOfMax, weightForReps } from '../../src/domain/strength';
import { round } from '../../src/domain/units';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';

const REP_ROWS = [1, 2, 3, 5, 8, 10, 12, 15];
const QUICK_REPS = [1, 3, 5, 8, 10, 12];

/**
 * Rep-max calculator. Works entirely in display units — an athlete entering
 * pounds should read pounds back without a conversion in the middle — and
 * shows two formulas rather than presenting an estimate as a measurement.
 */
export default function OneRepMax() {
  const units = useProfileStore((s) => s.profile.units);
  const prs = useWorkoutStore((s) => s.prs);
  const allExercises = useWorkoutStore((s) => s.allExercises());

  const unitLabel = units === 'imperial' ? 'lb' : 'kg';
  const [weight, setWeight] = useState(units === 'imperial' ? '185' : '85');
  const [reps, setReps] = useState('5');

  const w = parseFloat(weight);
  const r = parseInt(reps, 10);
  const valid = !isNaN(w) && w > 0 && !isNaN(r) && r > 0;

  const epley = valid ? epley1RM(w, r) : 0;
  const brzycki = valid ? brzycki1RM(w, r) : null;

  const rows = useMemo(
    () => (valid ? REP_ROWS.map((n) => ({ reps: n, weight: weightForReps(epley, n), pct: percentOfMax(n) })) : []),
    [epley, valid],
  );

  // Your best logged lift, so the estimate can be checked against something
  // real rather than floating on its own.
  const bestLogged = useMemo(() => {
    const entries = Object.entries(prs);
    if (!entries.length) return null;
    const [id, kg] = entries.sort((a, b) => b[1] - a[1])[0]!;
    const name = allExercises.find((e) => e.id === id)?.name ?? 'your best lift';
    return { name, value: units === 'imperial' ? round(kg / 0.45359237, 1) : round(kg, 1) };
  }, [prs, allExercises, units]);

  return (
    <Screen gradient>
      <ScreenHeader title="Rep Max Calculator" />

      <Card tone="alt" style={{ marginBottom: spacing.lg }}>
        <Text variant="caption" color={colors.textDim}>
          An estimate from a formula, not a measurement. It drifts further from reality the more reps you put in, and it
          knows nothing about your technique on a maximal attempt. Treat it as a way to pick working weights.
        </Text>
      </Card>

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Input
            label="Weight lifted"
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
            suffix={unitLabel}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Input label="Reps" value={reps} onChangeText={setReps} keyboardType="number-pad" suffix="reps" />
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
        {QUICK_REPS.map((n) => (
          <Pressable key={n} onPress={() => setReps(String(n))} style={[styles.quick, r === n && styles.quickOn]}>
            <Text variant="label" color={r === n ? colors.onPrimary : colors.textDim}>
              {n}
            </Text>
          </Pressable>
        ))}
      </View>

      <SectionHeader title="Estimated one-rep max" />
      {valid ? (
        <>
          <Card style={{ flexDirection: 'row' }}>
            <StatTile value={`${round(epley, 1)}`} label={`Epley (${unitLabel})`} accent={colors.primary} />
            <StatTile
              value={brzycki == null ? '—' : `${round(brzycki, 1)}`}
              label={`Brzycki (${unitLabel})`}
              accent={colors.protein}
            />
            <StatTile value={`${percentOfMax(r).toFixed(1)}%`} label="of max lifted" accent={colors.water} />
          </Card>

          {brzycki != null && Math.abs(epley - brzycki) > epley * 0.03 && (
            <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
              The two formulas disagree by {round(Math.abs(epley - brzycki), 1)} {unitLabel} at {r} reps. That gap is the
              honest width of the estimate — the fewer reps you test with, the narrower it gets.
            </Text>
          )}

          <SectionHeader title="Working weights" />
          <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
            {rows.map((row, i) => (
                <Pressable
                  key={row.reps}
                  onPress={() => router.push({ pathname: '/tools/plates', params: { target: String(row.weight) } })}
                  style={[styles.row, i < rows.length - 1 && styles.rowBorder]}
                >
                  <Text variant="bodyStrong" style={{ width: 62 }}>
                    {row.reps} {row.reps === 1 ? 'rep' : 'reps'}
                  </Text>
                  <Text variant="caption" color={colors.textFaint} style={{ width: 46 }}>
                    {/* One decimal throughout: a column reading 96.8, 93.8,
                        75, 71.4 looks like two different precisions. */}
                    {row.pct.toFixed(1)}%
                  </Text>
                  <Text variant="bodyStrong" color={colors.primary} style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                    {row.weight} {unitLabel}
                  </Text>
                  {/* The plate maths stays one tap away rather than being a
                      screen the user has to remember exists. */}
                  <Icon name="sliders" size={14} color={colors.textFaint} strokeWidth={1.8} />
                </Pressable>
            ))}
          </Card>
          <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
            Tap a row to see what goes on the bar.
          </Text>
        </>
      ) : (
        <Card>
          <Text variant="body" color={colors.textDim}>
            Enter a weight and a rep count to see the estimate.
          </Text>
        </Card>
      )}

      {bestLogged && (
        <>
          <SectionHeader title="For comparison" />
          <Card>
            <Text variant="caption" color={colors.textDim}>
              Your highest estimated max from a logged set is{' '}
              <Text variant="bodyStrong" color={colors.amber}>
                {bestLogged.value} {unitLabel}
              </Text>{' '}
              on {bestLogged.name}.
            </Text>
          </Card>
        </>
      )}

      <Button
        title="Warm-up ramp for a working weight"
        variant="secondary"
        style={{ marginTop: spacing.lg }}
        onPress={() => router.push({ pathname: '/tools/warmup', params: valid ? { target: String(weightForReps(epley, 5)) } : {} })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  quick: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
  },
  quickOn: { backgroundColor: colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});

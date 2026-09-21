import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Card, EmptyState, Screen, SectionHeader, SegmentedControl, StatTile, Text } from '../../src/components/ui';
import { LineChart } from '../../src/components/ui/Charts';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { FadeIn } from '../../src/components/anim';
import { Icon } from '../../src/components/Icon';
import { colors, domainAccent, spacing } from '../../src/theme';
import { formatDayMonth } from '../../src/domain/date';
import { displayWeight } from '../../src/domain/units';
import {
  BAND_LABEL,
  BAND_TINT,
  BANDS,
  BODY_FAT_CAVEAT,
  bodyFatBand,
  bodyFatChange,
  bodyFatSeries,
  composition,
  defaultFormula,
  latestInputs,
  missingForBodyFat,
  siteLabelsUsedBy,
  type BodyFatFormula,
} from '../../src/domain/bodyFat';
import { useLogStore } from '../../src/stores/useLogStore';
import { useProfileStore } from '../../src/stores/useProfileStore';

/**
 * Body composition from the tape measurements already on file.
 *
 * The screen leads with the trend rather than the number, because the trend is
 * the part a circumference estimate is actually good for. Everything that
 * could be mistaken for a measurement is labelled as an estimate, and a real
 * reading the user has entered is marked as theirs.
 */
export default function BodyFat() {
  const profile = useProfileStore((s) => s.profile);
  const logs = useLogStore((s) => s.measurements);
  const latestWeightKg = useLogStore((s) => s.latestWeightKg());
  const units = profile.units;

  const [formula, setFormula] = useState<BodyFatFormula>(defaultFormula(profile.sex));

  const inputs = useMemo(() => latestInputs(logs), [logs]);
  const missing = missingForBodyFat({ formula, heightCm: profile.heightCm, ...inputs });
  const series = useMemo(
    () => bodyFatSeries(logs, formula, profile.heightCm),
    [logs, formula, profile.heightCm],
  );
  const change = bodyFatChange(series);

  const latest = series.length ? series[series.length - 1]! : null;
  const band = latest ? bodyFatBand(latest.pct, formula) : null;
  const split = composition(latestWeightKg, latest?.pct ?? null);

  return (
    <Screen gradient>
      <ScreenHeader title="Body composition" subtitle="Estimated from your tape measurements" />

      <Card style={{ gap: spacing.md, marginBottom: spacing.md }}>
        <Text variant="overline" color={colors.textFaint}>FORMULA</Text>
        <SegmentedControl
          options={[
            { label: 'Male', value: 'male' },
            { label: 'Female', value: 'female' },
          ]}
          value={formula}
          onChange={(f) => setFormula(f as BodyFatFormula)}
        />
        <Text variant="caption" color={colors.textFaint}>
          The two formulas read different sites — {siteLabelsUsedBy(formula).join(', ').toLowerCase()} for
          this one — and are not interchangeable. Pick the one you want to be measured by.
        </Text>
      </Card>

      {missing.length > 0 ? (
        <EmptyState
          icon="scale"
          title={`Still need ${missing.join(', ').toLowerCase()}`}
          subtitle="The estimate is built from a height and two or three girths. Without all of them there is no number to show."
          action={missing.includes('Height') ? 'Set your height' : 'Add measurements'}
          onAction={() => router.push(missing.includes('Height') ? '/settings/goals' : '/progress/measurements')}
        />
      ) : (
        <>
          {latest && band && (
            <FadeIn>
              <Card style={{ gap: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: `${BAND_TINT[band]}55` }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
                  <Text variant="display" color={BAND_TINT[band]}>
                    {latest.pct.toFixed(1)}
                  </Text>
                  <Text variant="title" color={colors.textDim} style={{ paddingBottom: 6 }}>
                    %
                  </Text>
                  <View style={{ flex: 1, minWidth: 0, paddingBottom: 8, alignItems: 'flex-end' }}>
                    <Text variant="label" color={BAND_TINT[band]}>{BAND_LABEL[band]}</Text>
                    <Text variant="caption" color={colors.textFaint}>
                      {latest.measured ? 'your measurement' : 'tape estimate'} · {formatDayMonth(latest.date)}
                    </Text>
                  </View>
                </View>

                <Ladder pct={latest.pct} formula={formula} />

                {split && (
                  <View style={{ flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: spacing.md }}>
                    <StatTile
                      value={`${displayWeight(split.leanMassKg, units).value}`}
                      label={`Lean mass (${displayWeight(split.leanMassKg, units).unit})`}
                      accent={colors.protein}
                    />
                    <StatTile
                      value={`${displayWeight(split.fatMassKg, units).value}`}
                      label={`Fat mass (${displayWeight(split.fatMassKg, units).unit})`}
                      accent={colors.amber}
                    />
                    {change ? (
                      <StatTile
                        value={`${change.deltaPct > 0 ? '+' : '−'}${Math.abs(change.deltaPct)}`}
                        label="Points, all time"
                        accent={change.deltaPct <= 0 ? colors.success : colors.textDim}
                      />
                    ) : (
                      <StatTile value="—" label="No trend yet" accent={colors.textDim} />
                    )}
                  </View>
                )}

                {/* Said plainly, next to the number, not buried at the bottom. */}
                <Text variant="caption" color={colors.textFaint}>
                  Lean mass is everything that is not fat — muscle, bone, organs, water — not muscle
                  on its own.
                </Text>
              </Card>
            </FadeIn>
          )}

          {series.length >= 2 ? (
            <>
              <SectionHeader title="Over time" accent={domainAccent.progress} />
              <Card style={{ gap: spacing.sm, marginBottom: spacing.md }}>
                <LineChart
                  data={series.map((p) => ({ label: formatDayMonth(p.date), value: p.pct }))}
                  width={300}
                  color={colors.protein}
                />
                <Text variant="caption" color={colors.textFaint}>
                  {change && change.deltaPct !== 0
                    ? `${Math.abs(change.deltaPct)} points ${change.deltaPct < 0 ? 'down' : 'up'} since ${formatDayMonth(change.first.date)}. Direction over weeks is what this is for.`
                    : 'Holding where it started. Direction over weeks is what this is for.'}
                </Text>
              </Card>
            </>
          ) : (
            <Card tone="alt" style={{ marginBottom: spacing.md }}>
              <Text variant="caption" color={colors.textDim}>
                One reading so far. Measure again in a couple of weeks — the same tape, the same
                time of day — and the trend line appears here.
              </Text>
            </Card>
          )}
        </>
      )}

      <Card tone="alt" style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="shield" size={14} color={colors.textDim} />
          <Text variant="overline" color={colors.textDim}>WHAT THIS IS NOT</Text>
        </View>
        <Text variant="caption" color={colors.textFaint}>{BODY_FAT_CAVEAT}</Text>
      </Card>

      <Pressable
        onPress={() => router.push('/progress/measurements')}
        accessibilityRole="link"
        accessibilityLabel="Go to measurements"
        style={{ paddingVertical: spacing.lg }}
      >
        <Text variant="label" color={colors.primary} center>
          Update your measurements ›
        </Text>
      </Pressable>
    </Screen>
  );
}

/** The bands as a strip, with a marker where this reading sits. */
function Ladder({ pct, formula }: { pct: number; formula: BodyFatFormula }) {
  const here = bodyFatBand(pct, formula);
  return (
    <View style={{ gap: 5 }}>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {BANDS.map((b) => (
          <View
            key={b}
            style={[
              styles.band,
              { backgroundColor: BAND_TINT[b], opacity: b === here ? 1 : 0.25 },
            ]}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {BANDS.map((b) => (
          <Text
            key={b}
            variant="caption"
            color={b === here ? BAND_TINT[b] : colors.textFaint}
            center
            numberOfLines={1}
            style={{ flex: 1, fontSize: 9 }}
          >
            {BAND_LABEL[b].split(' ')[0]}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { flex: 1, height: 5, borderRadius: 3 },
});

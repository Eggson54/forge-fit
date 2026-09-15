import React, { useMemo, useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { Button, Card, Chip, EmptyState, Input, LineChart, Screen, SectionHeader, Text, type Point } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { FadeIn } from '../../src/components/anim';
import { MuscleThumb } from '../../src/components/body/MuscleThumb';
import { colors, radius, spacing } from '../../src/theme';
import { cmToIn, inToCm, round } from '../../src/domain/units';
import { formatDateLong, formatDayMonth } from '../../src/domain/date';
import { MEASUREMENT_SITES, changeVerdict, latestBySite, siteChange, siteSeries, type ChangeVerdict, type MeasurementKey, type MeasurementSite } from '../../src/domain/measurements';
import type { Goal, MeasurementLog } from '../../src/domain/types';
import { useLogStore } from '../../src/stores/useLogStore';
import { useProfileStore } from '../../src/stores/useProfileStore';

export default function Measurements() {
  const { width } = useWindowDimensions();
  const chartW = width - spacing.xl * 2 - spacing.lg * 2;

  const units = useProfileStore((s) => s.profile.units);
  const goal = useProfileStore((s) => s.profile.goal);
  const measurements = useLogStore((s) => s.measurements);
  const addMeasurement = useLogStore((s) => s.addMeasurement);

  const [vals, setVals] = useState<Partial<Record<MeasurementKey, string>>>({});
  const [focused, setFocused] = useState<MeasurementKey | null>(null);
  const [chartSite, setChartSite] = useState<MeasurementKey | null>(null);

  const unit = units === 'imperial' ? 'in' : 'cm';
  const toDisplay = (cm: number) => round(units === 'imperial' ? cmToIn(cm) : cm, 1);
  const fromInput = (v: number) => round(units === 'imperial' ? inToCm(v) : v, 1);

  const latest = useMemo(() => latestBySite(measurements), [measurements]);

  // Sites with enough history to plot. Without this the chart chips offer
  // lines that immediately render as "log two entries".
  const plottable = useMemo(
    () => MEASUREMENT_SITES.filter((s) => siteSeries(measurements, s.key).length >= 2),
    [measurements],
  );
  const activeSite = plottable.find((s) => s.key === chartSite) ?? plottable[0] ?? null;
  const series: Point[] = useMemo(
    () =>
      activeSite
        ? siteSeries(measurements, activeSite.key)
            .slice(-14)
            .map((p) => ({ label: formatDayMonth(p.date), value: toDisplay(p.cm) }))
        : [],
    // toDisplay closes over units, which is the only other input that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [measurements, activeSite, units],
  );

  const typedCount = MEASUREMENT_SITES.filter((s) => !isNaN(parseFloat(vals[s.key] ?? ''))).length;

  // Most people fill the whole form in one sitting, so every site spans the same
  // dates. When they do, the range belongs in the header once instead of being
  // repeated down every row.
  const changes = useMemo(
    () =>
      MEASUREMENT_SITES.map((site) => ({ site, change: siteChange(measurements, site.key) })).filter(
        (c): c is { site: MeasurementSite; change: NonNullable<ReturnType<typeof siteChange>> } => c.change != null,
      ),
    [measurements],
  );
  const spans = new Set(changes.map((c) => `${c.change.first.date}|${c.change.last.date}`));
  const sharedSpan =
    spans.size === 1 && changes[0]
      ? `${formatDayMonth(changes[0].change.first.date)} → ${formatDayMonth(changes[0].change.last.date)}`
      : null;

  const save = () => {
    const entry: Partial<MeasurementLog> = {};
    for (const site of MEASUREMENT_SITES) {
      const v = parseFloat(vals[site.key] ?? '');
      if (!isNaN(v)) entry[site.key] = fromInput(v);
    }
    if (Object.keys(entry).length === 0) return;
    addMeasurement(entry as Omit<MeasurementLog, 'id' | 'date'>);
    setVals({});
    setFocused(null);
  };

  const focusedSite = MEASUREMENT_SITES.find((s) => s.key === focused) ?? null;
  const hasHistory = Object.keys(latest).length > 0;

  return (
    <Screen
      gradient
      footer={
        <Button
          title={typedCount > 0 ? `Save ${typedCount} measurement${typedCount === 1 ? '' : 's'}` : 'Save Measurements'}
          onPress={save}
          size="lg"
          disabled={typedCount === 0}
        />
      }
    >
      <ScreenHeader title="Body Measurements" />

      <Card>
        {/* The figure reacts to whichever field has focus, so the tape position
            in the hint is anchored to somewhere on the body. */}
        <View style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'center', marginBottom: spacing.lg }}>
          <MuscleThumb muscle={focusedSite?.muscle ?? 'full_body'} size={54} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyStrong">{focusedSite ? focusedSite.label : 'Measure what you track'}</Text>
            <Text variant="caption" color={colors.textDim}>
              {focusedSite
                ? focusedSite.hint
                : hasHistory
                  ? 'Greyed numbers are your last reading. Same tape, same spot, same time of day.'
                  : 'Leave the rest blank. Same tape, same spot, same time of day.'}
            </Text>
          </View>
        </View>

        <View style={{ gap: spacing.md }}>
          {pairs(MEASUREMENT_SITES).map((row, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: spacing.md }}>
              {row.map((site) => {
                const last = latest[site.key];
                const typed = parseFloat(vals[site.key] ?? '');
                const deltaCm = last && !isNaN(typed) ? fromInput(typed) - last.cm : null;
                const delta = last && !isNaN(typed) ? typed - toDisplay(last.cm) : null;
                return (
                  <View key={site.key} style={{ flex: 1, minWidth: 0 }}>
                    <Input
                      label={site.label}
                      value={vals[site.key] ?? ''}
                      onChangeText={(t) => setVals((v) => ({ ...v, [site.key]: t }))}
                      onFocus={() => setFocused(site.key)}
                      keyboardType="decimal-pad"
                      placeholder={last ? String(toDisplay(last.cm)) : '—'}
                      suffix={unit}
                    />
                    {/* The line is always rendered so typing a value doesn't
                        shove the next row of fields down. */}
                    <Text variant="caption" color={verdictColor(site, deltaCm, goal)} style={{ marginTop: 2 }}>
                      {delta != null && Math.abs(delta) >= 0.05
                        ? `${delta > 0 ? '+' : ''}${round(delta, 1)} ${unit} vs. last`
                        : ' '}
                    </Text>
                  </View>
                );
              })}
              {row.length === 1 && <View style={{ flex: 1 }} />}
            </View>
          ))}
        </View>
      </Card>

      {plottable.length > 0 && activeSite && (
        <>
          <SectionHeader title="Trend" />
          <FadeIn>
            <Card>
              {plottable.length > 1 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: spacing.md, marginHorizontal: -spacing.lg }}
                  contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
                >
                  {plottable.map((s) => (
                    <Chip
                      key={s.key}
                      label={s.label}
                      selected={activeSite.key === s.key}
                      onPress={() => setChartSite(s.key)}
                    />
                  ))}
                </ScrollView>
              )}
              <LineChart data={series} width={chartW} color={colors.protein} unit={` ${unit}`} />
            </Card>
          </FadeIn>

          <SectionHeader title={sharedSpan ? `Change · ${sharedSpan}` : 'Change so far'} />
          <Card>
            <View style={{ gap: spacing.md }}>
              {changes.map(({ site, change }) => {
                const delta = toDisplay(change.last.cm) - toDisplay(change.first.cm);
                return (
                  <View key={site.key} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    <Text variant="label" style={{ width: 56 }}>
                      {site.label}
                    </Text>
                    <Text variant="caption" color={colors.textFaint} style={{ flex: 1, minWidth: 0 }}>
                      {sharedSpan
                        ? `${siteSeries(measurements, site.key).length} readings`
                        : `${formatDayMonth(change.first.date)} → ${formatDayMonth(change.last.date)}`}
                    </Text>
                    <Text variant="bodyStrong" color={verdictColor(site, change.deltaCm, goal)}>
                      {delta > 0 ? '+' : ''}
                      {round(delta, 1)} {unit}
                    </Text>
                  </View>
                );
              })}
            </View>
            <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.md }}>
              Tape measurements swing with posture, time of day and how hard you pull. Treat the
              direction as the signal, not any single reading.
            </Text>
          </Card>
        </>
      )}

      <SectionHeader title="History" />
      {measurements.length === 0 ? (
        <EmptyState
          icon="scale"
          title="No measurements yet"
          subtitle="Fill in what you track above — you can leave the rest blank."
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          {measurements.slice(0, 12).map((m) => (
            <Card key={m.id}>
              <Text variant="bodyStrong" style={{ marginBottom: spacing.sm }}>
                {formatDateLong(m.date)}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {MEASUREMENT_SITES.map((site) => {
                  const v = m[site.key];
                  if (v == null) return null;
                  return (
                    <View key={site.key} style={styles.pill}>
                      <Text variant="caption" color={colors.textDim}>
                        {site.label}
                      </Text>
                      <Text variant="bodyStrong">
                        {toDisplay(v)} {unit}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const VERDICT_COLOR: Record<ChangeVerdict, string> = {
  toward: colors.success,
  away: colors.warning,
  neutral: colors.textDim,
};

function verdictColor(site: MeasurementSite, deltaCm: number | null, goal: Goal): string {
  if (deltaCm == null) return colors.textFaint;
  return VERDICT_COLOR[changeVerdict(site, deltaCm, goal)];
}

/** Chunk a list into rows of two for a paired form layout. */
function pairs<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out;
}

const styles = {
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceHigh,
  },
} as const;

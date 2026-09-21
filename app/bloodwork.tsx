import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Card, EmptyState, Input, Screen, SectionHeader, Text } from '../src/components/ui';
import { LineChart } from '../src/components/ui/Charts';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { FadeIn } from '../src/components/anim';
import { Icon } from '../src/components/Icon';
import { colors, domainAccent, radius, spacing } from '../src/theme';
import { formatDayMonth, todayISO } from '../src/domain/date';
import {
  BIOMARKERS,
  BIOMARKER_CAVEAT,
  GROUP_LABEL,
  biomarkerByKey,
  markerChange,
  markerSeries,
  panelDates,
  readAgainstRange,
  readPanel,
  summarisePanel,
  type BiomarkerDef,
  type BiomarkerGroup,
  type BiomarkerReading,
  type RangeVerdict,
} from '../src/domain/biomarkers';
import { useBiomarkerStore } from '../src/stores/useBiomarkerStore';
import { useProfileStore } from '../src/stores/useProfileStore';

/**
 * Blood results.
 *
 * A place to keep them and watch them move — not a place that tells you what
 * they mean. Every value is shown against a range, the range always says
 * whose it is, and anything outside points at the clinician who ordered the
 * test rather than at an explanation the app is in no position to give.
 */
export default function Bloodwork() {
  const readings = useBiomarkerStore((s) => s.readings);
  const record = useBiomarkerStore((s) => s.record);
  const removeDraw = useBiomarkerStore((s) => s.removeDraw);
  const sex = useProfileStore((s) => s.profile.sex);

  const dates = useMemo(() => panelDates(readings), [readings]);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const date = selected ?? dates[0] ?? todayISO();
  const summary = useMemo(() => summarisePanel(readings, date, sex), [readings, date, sex]);
  const headline = readPanel(summary);

  const onDraw = useMemo(
    () => readings.filter((r) => r.date === date).sort((a, b) => order(a.key) - order(b.key)),
    [readings, date],
  );

  if (readings.length === 0 && !adding) {
    return (
      <Screen gradient>
        <ScreenHeader title="Blood results" subtitle="Somewhere to keep them, and watch them move" />
        <EmptyState
          icon="document"
          title="Nothing entered yet"
          subtitle="Type in what came back from your last panel. The reference range off your own report matters more than the one this app would guess, so there is a field for it."
          action="Add results"
          onAction={() => setAdding(true)}
        />
        <Card tone="alt" style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <Text variant="caption" color={colors.textFaint}>{BIOMARKER_CAVEAT}</Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen gradient>
      <ScreenHeader title="Blood results" subtitle="Somewhere to keep them, and watch them move" />

      {dates.length > 0 && (
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.md }}>
          {dates.slice(0, 6).map((d) => (
            <Pressable
              key={d}
              onPress={() => setSelected(d)}
              accessibilityRole="button"
              accessibilityState={{ selected: d === date }}
              accessibilityLabel={`Draw on ${formatDayMonth(d)}`}
              style={[styles.chip, d === date && { backgroundColor: `${colors.primary}22`, borderColor: colors.primary }]}
            >
              <Text variant="caption" color={d === date ? colors.primary : colors.textDim}>
                {formatDayMonth(d)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {headline && (
        <FadeIn>
          <Card style={{ gap: spacing.sm, marginBottom: spacing.md }}>
            <Text variant="overline" color={colors.textFaint}>THIS DRAW</Text>
            <Text variant="body" color={colors.text}>{headline}</Text>
          </Card>
        </FadeIn>
      )}

      {onDraw.length > 0 && (
        <Card style={{ gap: spacing.md, marginBottom: spacing.md }}>
          {onDraw.map((r, i) => (
            <MarkerRow key={r.id} reading={r} sex={sex} first={i === 0} allReadings={readings} />
          ))}
        </Card>
      )}

      <SectionHeader
        title={adding ? 'Add a result' : 'Add more'}
        accent={domainAccent.progress}
        action={adding ? 'Done' : 'Add'}
        onAction={() => setAdding((v) => !v)}
      />

      {adding && (
        <AddResult
          date={date}
          onSave={(entry) => {
            record(entry);
            setSelected(entry.date);
          }}
        />
      )}

      {dates.includes(date) && (
        <Pressable
          onPress={() => {
            removeDraw(date);
            setSelected(null);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Delete the draw from ${formatDayMonth(date)}`}
          style={{ paddingVertical: spacing.md }}
        >
          <Text variant="caption" color={colors.danger} center>
            Delete this draw
          </Text>
        </Pressable>
      )}

      <Card tone="alt" style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="shield" size={14} color={colors.textDim} />
          <Text variant="overline" color={colors.textDim}>WHAT THIS IS NOT</Text>
        </View>
        <Text variant="caption" color={colors.textFaint}>{BIOMARKER_CAVEAT}</Text>
      </Card>

      <Pressable
        onPress={() => router.push('/bio-age')}
        accessibilityRole="link"
        accessibilityLabel="Go to fitness age"
        style={{ paddingVertical: spacing.lg }}
      >
        <Text variant="label" color={colors.primary} center>See your fitness age ›</Text>
      </Pressable>
    </Screen>
  );
}

function MarkerRow({
  reading,
  sex,
  first,
  allReadings,
}: {
  reading: BiomarkerReading;
  sex: ReturnType<typeof useProfileStore.getState>['profile']['sex'];
  first: boolean;
  allReadings: BiomarkerReading[];
}) {
  const def = biomarkerByKey(reading.key);
  const [open, setOpen] = useState(false);
  if (!def) return null;

  const read = readAgainstRange(reading, def, sex);
  const tint = VERDICT_TINT[read.verdict];
  const series = markerSeries(allReadings, reading.key);
  const change = markerChange(series);

  return (
    <View style={[{ gap: 6 }, !first && { borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: spacing.md }]}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={`${def.label} details`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
      >
        <Text variant="label" color={colors.text} style={{ flex: 1, minWidth: 0 }}>{def.label}</Text>
        <Text variant="label" color={tint}>
          {reading.value} <Text variant="caption" color={colors.textFaint}>{def.unit}</Text>
        </Text>
      </Pressable>

      {/* The range as a track with the value on it. Outside the range the
          marker pins to the end rather than running off the card. */}
      <View style={styles.track}>
        <View style={[styles.inRange, { backgroundColor: `${colors.success}33` }]} />
        <View
          style={[
            styles.pin,
            { left: `${Math.max(1, Math.min(99, read.position * 100))}%`, backgroundColor: tint },
          ]}
        />
      </View>

      <Text variant="caption" color={colors.textFaint}>{read.note}</Text>

      {open && (
        <View style={{ gap: spacing.sm, paddingTop: 4 }}>
          <Text variant="caption" color={colors.textDim}>{def.what}</Text>
          {change && (
            <Text variant="caption" color={colors.textFaint}>
              {change.delta > 0 ? '+' : '−'}
              {Math.abs(change.delta)} {def.unit} since {formatDayMonth(change.first.date)}
              {change.percent !== 0 ? ` (${change.percent > 0 ? '+' : '−'}${Math.abs(change.percent)}%)` : ''}.
              Whether that direction is good depends on you and the rest of the panel.
            </Text>
          )}
          {series.length >= 2 && (
            <LineChart
              data={series.map((s) => ({ label: formatDayMonth(s.date), value: s.value }))}
              width={290}
              color={tint}
            />
          )}
        </View>
      )}
    </View>
  );
}

function AddResult({
  date,
  onSave,
}: {
  date: string;
  onSave: (entry: Omit<BiomarkerReading, 'id'>) => void;
}) {
  const [group, setGroup] = useState<BiomarkerGroup>('lipids');
  const [key, setKey] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [low, setLow] = useState('');
  const [high, setHigh] = useState('');

  const groups = [...new Set(BIOMARKERS.map((b) => b.group))];
  const inGroup = BIOMARKERS.filter((b) => b.group === group);
  const def: BiomarkerDef | null = key ? biomarkerByKey(key) : null;
  const numeric = Number.parseFloat(value);
  const canSave = def != null && Number.isFinite(numeric);

  return (
    <Card style={{ gap: spacing.md, marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {groups.map((g) => (
          <Pressable
            key={g}
            onPress={() => {
              setGroup(g);
              setKey(null);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: g === group }}
            accessibilityLabel={GROUP_LABEL[g]}
            style={[styles.chip, g === group && { backgroundColor: `${colors.primary}22`, borderColor: colors.primary }]}
          >
            <Text variant="caption" color={g === group ? colors.primary : colors.textDim}>{GROUP_LABEL[g]}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {inGroup.map((b) => (
          <Pressable
            key={b.key}
            onPress={() => {
              setKey(b.key);
              // Prefill the typical range so the user can see what they are
              // overwriting rather than being asked cold.
              setLow(String(b.typical.low));
              setHigh(String(b.typical.high));
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: b.key === key }}
            accessibilityLabel={b.label}
            style={[styles.chip, b.key === key && { backgroundColor: `${colors.primary}22`, borderColor: colors.primary }]}
          >
            <Text variant="caption" color={b.key === key ? colors.primary : colors.textDim}>{b.label}</Text>
          </Pressable>
        ))}
      </View>

      {def && (
        <>
          <Text variant="caption" color={colors.textFaint}>{def.what}</Text>
          <Input
            value={value}
            onChangeText={setValue}
            placeholder={`Result (${def.unit})`}
            keyboardType="decimal-pad"
            accessibilityLabel={`${def.label} result`}
          />
          <Text variant="caption" color={colors.textFaint}>
            The reference range printed on your report. Labs differ, so yours beats the prefill.
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Input value={low} onChangeText={setLow} placeholder="Range low" keyboardType="decimal-pad" accessibilityLabel="Reference range low" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Input value={high} onChangeText={setHigh} placeholder="Range high" keyboardType="decimal-pad" accessibilityLabel="Reference range high" />
            </View>
          </View>

          <Pressable
            onPress={() => {
              if (!canSave) return;
              const l = Number.parseFloat(low);
              const h = Number.parseFloat(high);
              onSave({
                key: def.key,
                value: numeric,
                date,
                ...(Number.isFinite(l) && Number.isFinite(h) && h > l ? { refLow: l, refHigh: h } : null),
              });
              setValue('');
              setKey(null);
            }}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityLabel="Save result"
            style={[styles.save, !canSave && { opacity: 0.4 }]}
          >
            <Text variant="bodyStrong" color={colors.onPrimary}>Save result</Text>
          </Pressable>
        </>
      )}
    </Card>
  );
}

/** Keep a draw in catalog order so the same panel always reads the same way. */
function order(key: string): number {
  const i = BIOMARKERS.findIndex((b) => b.key === key);
  return i === -1 ? 999 : i;
}

const VERDICT_TINT: Record<RangeVerdict, string> = {
  in_range: colors.success,
  below: colors.amber,
  above: colors.amber,
};

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, justifyContent: 'center' },
  inRange: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 4 },
  pin: { position: 'absolute', top: -3, bottom: -3, width: 3, borderRadius: 2 },
  save: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Card, Screen, SectionHeader, Text } from '../src/components/ui';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { FadeIn } from '../src/components/anim';
import { Icon } from '../src/components/Icon';
import { colors, domainAccent, noOutline, radius, spacing } from '../src/theme';
import { todayISO } from '../src/domain/date';
import {
  BUILT_IN_FACTORS,
  JOURNAL_CAVEAT,
  MIN_PAIRS,
  entriesInWindow,
  findCorrelations,
  journalStreak,
  readJournal,
  type Correlation,
  type FactorDef,
  type Outcome,
} from '../src/domain/journal';
import { useJournalStore } from '../src/stores/useJournalStore';
import { useLogStore } from '../src/stores/useLogStore';
import { useVitalsStore } from '../src/stores/useVitalsStore';

/**
 * The journal, and the only interesting question about one: does any of it
 * go with anything?
 *
 * Usually not, and this screen is willing to say so — "nothing stands out
 * yet" is printed as a real answer rather than as a gap waiting to be filled.
 * The word "cause" never appears, because days someone drinks late are also
 * days they eat late, sleep less and train differently, and nothing here can
 * pull those apart.
 */
export default function Journal() {
  const today = todayISO();
  const entries = useJournalStore((s) => s.entries);
  const enabledKeys = useJournalStore((s) => s.enabledKeys);
  const customFactors = useJournalStore((s) => s.customFactors);
  const setValue = useJournalStore((s) => s.set);
  const setNote = useJournalStore((s) => s.setNote);
  const toggleFactor = useJournalStore((s) => s.toggleFactor);

  const sleepLogs = useLogStore((s) => s.sleep);
  const vitals = useVitalsStore((s) => s.days);

  const factors = useMemo(
    () => [...BUILT_IN_FACTORS, ...customFactors].filter((f) => enabledKeys.includes(f.key)),
    [customFactors, enabledKeys],
  );
  const todayEntry = entries.find((e) => e.date === today) ?? null;
  const streak = journalStreak(entries, today);

  // What the factors are compared against. Each carries the smallest
  // difference worth reporting in its own units, rather than leaving that to
  // whatever the data happens to look like.
  const outcomes = useMemo<Outcome[]>(() => {
    const sleep: Record<string, number> = {};
    for (const l of sleepLogs) if (l.minutes > 0) sleep[l.date] = l.minutes;
    const hrv: Record<string, number> = {};
    for (const d of vitals) if (typeof d.hrvMs === 'number') hrv[d.date] = d.hrvMs;

    const out: Outcome[] = [
      { key: 'sleep', label: 'Sleep', byDate: sleep, unit: 'min', higherIsBetter: true, minEffect: 15 },
    ];
    if (Object.keys(hrv).length > 0) {
      out.push({ key: 'hrv', label: 'HRV', byDate: hrv, unit: 'ms', higherIsBetter: true, minEffect: 4 });
    }
    return out;
  }, [sleepLogs, vitals]);

  const windowed = useMemo(() => entriesInWindow(entries, today, 60), [entries, today]);
  const correlations = useMemo(
    () => findCorrelations(windowed, [...BUILT_IN_FACTORS, ...customFactors], outcomes),
    [windowed, customFactors, outcomes],
  );

  const [showFactors, setShowFactors] = useState(false);

  return (
    <Screen gradient>
      <ScreenHeader
        title="Journal"
        subtitle={streak > 0 ? `${streak} ${streak === 1 ? 'day' : 'days'} running` : 'Today'}
      />

      <FadeIn>
        <Card style={{ gap: spacing.md, marginBottom: spacing.md }}>
          <Text variant="overline" color={colors.textFaint}>TODAY</Text>
          {factors.map((f) => (
            <FactorRow
              key={f.key}
              factor={f}
              value={todayEntry?.values[f.key]}
              onChange={(v) => setValue(f.key, v)}
            />
          ))}

          <TextInput
            defaultValue={todayEntry?.note ?? ''}
            onEndEditing={(e) => setNote(e.nativeEvent.text)}
            placeholder="Anything worth remembering about today…"
            placeholderTextColor={colors.textFaint}
            multiline
            accessibilityLabel="Journal note"
            selectionColor={colors.primary}
            style={[styles.note, noOutline]}
          />
        </Card>
      </FadeIn>

      <SectionHeader
        title="Patterns"
        accent={domainAccent.progress}
        action={showFactors ? 'Done' : 'Which factors'}
        onAction={() => setShowFactors((v) => !v)}
      />

      {showFactors ? (
        <Card style={{ gap: spacing.md, marginBottom: spacing.md }}>
          {[...BUILT_IN_FACTORS, ...customFactors].map((f) => (
            <Pressable
              key={f.key}
              onPress={() => toggleFactor(f.key)}
              accessibilityRole="switch"
              accessibilityState={{ checked: enabledKeys.includes(f.key) }}
              accessibilityLabel={f.label}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
            >
              <Icon
                name={enabledKeys.includes(f.key) ? 'check' : 'plus'}
                size={15}
                color={enabledKeys.includes(f.key) ? colors.success : colors.textFaint}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="label" color={colors.text}>{f.label}</Text>
                {f.hint && <Text variant="caption" color={colors.textFaint}>{f.hint}</Text>}
              </View>
            </Pressable>
          ))}
          <Text variant="caption" color={colors.textFaint}>
            Turning one off stops the question being asked. The days you already answered it on keep
            their answers.
          </Text>
        </Card>
      ) : (
        <>
          <Card style={{ gap: spacing.sm, marginBottom: spacing.md }}>
            <Text variant="body" color={colors.text}>{readJournal(correlations, windowed)}</Text>
            {correlations.length === 0 && windowed.length > 0 && windowed.length < MIN_PAIRS && (
              <Text variant="caption" color={colors.textFaint}>
                Nothing is compared until there are {MIN_PAIRS} days with both a factor and something to
                compare it against, and at least four days on each side of the split.
              </Text>
            )}
          </Card>

          {correlations.map((c, i) => (
            <FadeIn key={`${c.factorKey}-${c.outcomeKey}`} delay={Math.min(200, i * 50)}>
              <CorrelationCard correlation={c} />
            </FadeIn>
          ))}
        </>
      )}

      <Card tone="alt" style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="shield" size={14} color={colors.textDim} />
          <Text variant="overline" color={colors.textDim}>PATTERNS, NOT CAUSES</Text>
        </View>
        <Text variant="caption" color={colors.textFaint}>{JOURNAL_CAVEAT}</Text>
      </Card>

      <Pressable
        onPress={() => router.push('/scores')}
        accessibilityRole="link"
        accessibilityLabel="Go to today's scores"
        style={{ paddingVertical: spacing.lg }}
      >
        <Text variant="label" color={colors.primary} center>See today&apos;s scores ›</Text>
      </Pressable>
    </Screen>
  );
}

function FactorRow({
  factor,
  value,
  onChange,
}: {
  factor: FactorDef;
  value: number | undefined;
  onChange: (value: number) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text variant="label" color={colors.text} style={{ flex: 1, minWidth: 0 }}>{factor.label}</Text>
        {value != null && (
          <Text variant="caption" color={colors.primary}>
            {factor.kind === 'toggle' ? (value > 0 ? 'Yes' : 'No') : `${value}${factor.unit ? ` ${factor.unit}` : ''}`}
          </Text>
        )}
      </View>

      {factor.kind === 'toggle' ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {[
            { label: 'No', v: 0 },
            { label: 'Yes', v: 1 },
          ].map((o) => (
            <Chip key={o.label} label={o.label} selected={value === o.v} onPress={() => onChange(o.v)} />
          ))}
        </View>
      ) : factor.kind === 'scale' ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Chip key={n} label={String(n)} selected={value === n} onPress={() => onChange(n)} grow />
          ))}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {countChoices(factor).map((n) => (
            <Chip
              key={n}
              label={`${n}${factor.unit === 'min' ? '' : ''}`}
              selected={value === n}
              onPress={() => onChange(n)}
              grow
            />
          ))}
        </View>
      )}
      {factor.hint && <Text variant="caption" color={colors.textFaint}>{factor.hint}</Text>}
    </View>
  );
}

/** Sensible steps for a count, so nobody types a number for "two drinks". */
function countChoices(factor: FactorDef): number[] {
  if (factor.unit === 'min') return [0, 15, 30, 60, 120];
  return [0, 1, 2, 3, 5];
}

function Chip({
  label,
  selected,
  onPress,
  grow,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  grow?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={[
        styles.chip,
        grow && { flex: 1, minWidth: 0 },
        selected && { backgroundColor: `${colors.primary}22`, borderColor: colors.primary },
      ]}
    >
      <Text variant="caption" color={selected ? colors.primary : colors.textDim} center>
        {label}
      </Text>
    </Pressable>
  );
}

function CorrelationCard({ correlation: c }: { correlation: Correlation }) {
  const tint = c.favourable ? colors.success : colors.amber;
  const withWidth = Math.max(4, Math.min(100, (c.withMean / Math.max(c.withMean, c.withoutMean)) * 100));
  const withoutWidth = Math.max(4, Math.min(100, (c.withoutMean / Math.max(c.withMean, c.withoutMean)) * 100));

  return (
    <Card style={{ gap: spacing.md, marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text variant="label" color={colors.text} style={{ flex: 1, minWidth: 0 }}>
          {c.factorLabel} → {c.outcomeLabel}
        </Text>
        <Text variant="caption" color={tint}>
          {c.difference > 0 ? '+' : '−'}
          {Math.abs(c.difference)} {c.outcomeUnit}
        </Text>
      </View>

      <View style={{ gap: 6 }}>
        <Bar label="Higher days" value={c.withMean} width={withWidth} tint={tint} />
        <Bar label="Other days" value={c.withoutMean} width={withoutWidth} tint={colors.textDim} />
      </View>

      <Text variant="caption" color={colors.textFaint}>{c.note}</Text>
      <Text variant="caption" color={colors.textFaint}>
        {c.smallerGroup} days in the smaller group of the two.
      </Text>
    </Card>
  );
}

function Bar({ label, value, width, tint }: { label: string; value: number; width: number; tint: string }) {
  return (
    <View style={{ gap: 3 }}>
      <View style={{ flexDirection: 'row' }}>
        <Text variant="caption" color={colors.textFaint} style={{ flex: 1, minWidth: 0 }}>{label}</Text>
        <Text variant="caption" color={colors.textDim}>{Math.round(value)}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${width}%`, backgroundColor: tint }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  note: {
    color: colors.text,
    fontSize: 14,
    minHeight: 64,
    textAlignVertical: 'top',
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
  },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});

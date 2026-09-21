import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, EmptyState, Screen, SectionHeader, StatTile, Text } from '../src/components/ui';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { FadeIn } from '../src/components/anim';
import { Icon } from '../src/components/Icon';
import { colors, domainAccent, radius, spacing } from '../src/theme';
import { formatDayMonth, lastNDays, todayISO } from '../src/domain/date';
import {
  CYCLE_CAVEAT,
  FLOW_LABEL,
  PHASE_LABEL,
  PHASE_NOTE,
  SYMPTOM_LABEL,
  cycleStats,
  cycleToday,
  periodsFrom,
  predictNext,
  readCycle,
  symptomPatterns,
  type CycleSymptom,
  type Flow,
  type Phase,
} from '../src/domain/cycle';
import { useCycleStore } from '../src/stores/useCycleStore';

const FLOWS: Flow[] = ['spotting', 'light', 'medium', 'heavy'];
const SYMPTOMS = Object.keys(SYMPTOM_LABEL) as CycleSymptom[];

/**
 * Cycle tracking.
 *
 * Predictions are windows rather than dates, and they only appear once there
 * is enough of this person's own history to make one mean anything. The
 * caveat is not decoration: cycle apps have been treated as contraception and
 * as diagnostics, and people have been hurt by both.
 */
export default function Cycle() {
  const enabled = useCycleStore((s) => s.enabled);
  const setEnabled = useCycleStore((s) => s.setEnabled);
  const days = useCycleStore((s) => s.days);
  const setFlow = useCycleStore((s) => s.setFlow);
  const toggleSymptom = useCycleStore((s) => s.toggleSymptom);

  const today = todayISO();
  const [selected, setSelected] = useState(today);

  const periods = useMemo(() => periodsFrom(days), [days]);
  const stats = useMemo(() => cycleStats(periods), [periods]);
  const current = useMemo(() => cycleToday(periods, stats, today), [periods, stats, today]);
  const prediction = useMemo(() => predictNext(periods, stats, today), [periods, stats, today]);
  const patterns = useMemo(() => symptomPatterns(days, periods), [days, periods]);

  const entry = days.find((d) => d.date === selected) ?? null;
  const strip = useMemo(() => lastNDays(14).reverse(), []);

  if (!enabled) {
    return (
      <Screen gradient>
        <ScreenHeader title="Cycle" subtitle="Off until you turn it on" />
        <EmptyState
          icon="calendar"
          title="Cycle tracking is off"
          subtitle="It stays off unless you ask for it — guessing from a profile would be presumptuous and often wrong. Everything logged here stays on your device with the rest of your data."
          action="Turn it on"
          onAction={() => setEnabled(true)}
        />
        <Card tone="alt" style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <Text variant="caption" color={colors.textFaint}>{CYCLE_CAVEAT}</Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen gradient>
      <ScreenHeader title="Cycle" subtitle={stats ? `${stats.averageLength}-day average` : 'Building a history'} />

      <FadeIn>
        <Card style={{ gap: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: current ? `${PHASE_TINT[current.phase]}44` : colors.border }}>
          <Text variant="body" color={colors.text}>{readCycle(current, prediction, stats)}</Text>
          {current && (
            <>
              <View style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {(['menstrual', 'follicular', 'ovulatory', 'luteal'] as Phase[]).map((p) => (
                    <View
                      key={p}
                      style={[styles.phaseBar, { backgroundColor: PHASE_TINT[p], opacity: p === current.phase ? 1 : 0.22 }]}
                    />
                  ))}
                </View>
                {/* Labelled, because an unlabelled four-colour strip is a
                    decoration rather than a diagram. */}
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {(['menstrual', 'follicular', 'ovulatory', 'luteal'] as Phase[]).map((p) => (
                    <Text
                      key={p}
                      variant="caption"
                      center
                      numberOfLines={1}
                      color={p === current.phase ? PHASE_TINT[p] : colors.textFaint}
                      style={{ flex: 1, fontSize: 9 }}
                    >
                      {PHASE_LABEL[p]}
                    </Text>
                  ))}
                </View>
              </View>
              <Text variant="caption" color={colors.textFaint}>{PHASE_NOTE[current.phase]}</Text>
            </>
          )}
          {prediction && (
            <View style={{ flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: spacing.md }}>
              <StatTile value={formatDayMonth(prediction.expected)} label="Estimated" accent={colors.primary} />
              <StatTile
                value={`${formatDayMonth(prediction.earliest)}–${formatDayMonth(prediction.latest)}`}
                label="Window"
                accent={colors.textDim}
              />
            </View>
          )}
          {prediction && <Text variant="caption" color={colors.textFaint}>{prediction.note}</Text>}
        </Card>
      </FadeIn>

      <SectionHeader title="Log a day" accent={domainAccent.progress} />
      <Card style={{ gap: spacing.md, marginBottom: spacing.md }}>
        <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
          {strip.map((d) => {
            const has = days.find((x) => x.date === d);
            return (
              <Pressable
                key={d}
                onPress={() => setSelected(d)}
                accessibilityRole="button"
                accessibilityState={{ selected: d === selected }}
                accessibilityLabel={formatDayMonth(d)}
                style={[
                  styles.day,
                  has?.flow && { backgroundColor: `${colors.danger}33`, borderColor: colors.danger },
                  d === selected && { borderColor: colors.primary, borderWidth: 1.5 },
                ]}
              >
                <Text variant="caption" color={d === selected ? colors.primary : colors.textDim} style={{ fontSize: 10 }}>
                  {d.slice(8)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text variant="caption" color={colors.textFaint}>
          {selected === today ? 'Today' : formatDayMonth(selected)}
        </Text>

        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          <Chip
            label="None"
            selected={!entry?.flow}
            onPress={() => setFlow(null, selected)}
          />
          {FLOWS.map((f) => (
            <Chip
              key={f}
              label={FLOW_LABEL[f]}
              selected={entry?.flow === f}
              onPress={() => setFlow(f, selected)}
            />
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {SYMPTOMS.map((sym) => (
            <Chip
              key={sym}
              label={SYMPTOM_LABEL[sym]}
              selected={Boolean(entry?.symptoms?.includes(sym))}
              onPress={() => toggleSymptom(sym, selected)}
            />
          ))}
        </View>
      </Card>

      {stats && (
        <>
          <SectionHeader title="Your history" accent={domainAccent.progress} />
          <Card style={{ marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row' }}>
              <StatTile value={`${stats.averageLength}`} label="Average days" accent={colors.primary} />
              <StatTile value={`${stats.shortest}–${stats.longest}`} label="Range" accent={colors.textDim} />
              <StatTile value={`${stats.averagePeriodDays}`} label="Period days" accent={colors.danger} />
            </View>
          </Card>
        </>
      )}

      {patterns.length > 0 && (
        <>
          <SectionHeader title="What you log most" accent={domainAccent.progress} />
          <Card style={{ gap: spacing.sm, marginBottom: spacing.md }}>
            {patterns.slice(0, 6).map((p) => (
              <View key={p.symptom} style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Text variant="caption" color={colors.text} style={{ flex: 1, minWidth: 0 }}>{p.label}</Text>
                <Text variant="caption" color={colors.textFaint}>
                  {p.days} {p.days === 1 ? 'day' : 'days'}
                  {p.typicalDay != null ? ` · usually around day ${p.typicalDay}` : ''}
                </Text>
              </View>
            ))}
          </Card>
        </>
      )}

      <Card tone="alt" style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="shield" size={14} color={colors.textDim} />
          <Text variant="overline" color={colors.textDim}>READ THIS ONE</Text>
        </View>
        <Text variant="caption" color={colors.textFaint}>{CYCLE_CAVEAT}</Text>
      </Card>

      <View style={{ paddingVertical: spacing.lg }}>
        <Button title="Turn cycle tracking off" variant="ghost" onPress={() => setEnabled(false)} />
        <Text variant="caption" color={colors.textFaint} center style={{ paddingTop: spacing.sm }}>
          Turning it off hides the screen and keeps what you logged. Delete it with the rest of your
          data from Privacy.
        </Text>
      </View>

      <Pressable
        onPress={() => router.push('/settings/privacy')}
        accessibilityRole="link"
        accessibilityLabel="Go to privacy"
        style={{ paddingBottom: spacing.lg }}
      >
        <Text variant="label" color={colors.primary} center>Privacy &amp; data ›</Text>
      </Pressable>
    </Screen>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={[styles.chip, selected && { backgroundColor: `${colors.primary}22`, borderColor: colors.primary }]}
    >
      <Text variant="caption" color={selected ? colors.primary : colors.textDim}>{label}</Text>
    </Pressable>
  );
}

const PHASE_TINT: Record<Phase, string> = {
  menstrual: colors.danger,
  follicular: colors.lime,
  ovulatory: colors.success,
  luteal: colors.amber,
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
  day: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phaseBar: { flex: 1, height: 5, borderRadius: 3 },
});

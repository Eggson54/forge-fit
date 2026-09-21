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
  MIN_BASELINE_DAYS,
  VITALS_CAVEAT,
  VITAL_DECIMALS,
  VITAL_KEYS,
  VITAL_LABEL,
  VITAL_UNIT,
  readAllVitals,
  readMonitor,
  seriesFor,
  type Deviation,
  type VitalKey,
  type VitalReading,
} from '../src/domain/vitals';
import { useVitalsStore } from '../src/stores/useVitalsStore';
import { useIntegrationStore } from '../src/stores/useIntegrationStore';

/**
 * The passive signals, each against the athlete's own baseline.
 *
 * Published normal ranges are close to useless for these — two healthy people
 * the same age can differ tenfold in HRV — so nothing here is compared with a
 * population. It is all "against your own last thirty days", and no signal
 * appears at all until there are enough days to have a normal.
 */
export default function HealthMonitor() {
  const days = useVitalsStore((s) => s.days);
  const setManual = useVitalsStore((s) => s.setManual);
  const healthState = useIntegrationStore((s) => s.providers.apple_health.state);
  const today = todayISO();

  const readings = useMemo(() => readAllVitals(days, { today }), [days, today]);
  const headline = readMonitor(readings);
  const [entering, setEntering] = useState<VitalKey | null>(null);

  const missing = VITAL_KEYS.filter((k) => !readings.some((r) => r.key === k));
  const isSample = days.length > 0 && days.every((d) => d.source === 'demo');

  return (
    <Screen gradient>
      <ScreenHeader title="Health monitor" subtitle="Each signal against your own normal" />

      {readings.length === 0 ? (
        <EmptyState
          icon="shield"
          title="No baseline yet"
          subtitle={`These only mean anything against your own history, so nothing shows until there are ${MIN_BASELINE_DAYS} days of a signal. Connect Apple Health, or type a reading in below.`}
          action={healthState === 'connected' ? 'Sync Apple Health' : 'Set up integrations'}
          onAction={() =>
            healthState === 'connected'
              ? void useIntegrationStore.getState().sync('apple_health')
              : router.push('/settings/integrations')
          }
        />
      ) : (
        <>
          {isSample && (
            <Card tone="alt" style={{ gap: 6, marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="help" size={13} color={colors.amber} />
                <Text variant="overline" color={colors.amber}>SAMPLE DATA</Text>
              </View>
              <Text variant="caption" color={colors.textFaint}>
                Made-up numbers, so the screen has something to show. Clear them on the integrations
                screen whenever you like.
              </Text>
            </Card>
          )}

          {headline && (
            <FadeIn>
              <Card style={{ gap: spacing.sm, marginBottom: spacing.md }}>
                <Text variant="overline" color={colors.textFaint}>TODAY</Text>
                <Text variant="body" color={colors.text}>{headline}</Text>
              </Card>
            </FadeIn>
          )}

          {readings.map((r, i) => (
            <FadeIn key={r.key} delay={Math.min(200, i * 40)}>
              <VitalCard reading={r} days={days} />
            </FadeIn>
          ))}
        </>
      )}

      {missing.length > 0 && (
        <>
          <SectionHeader title="Nothing yet for" accent={domainAccent.progress} />
          <Card style={{ gap: spacing.md }}>
            {missing.map((k) => (
              <View key={k} style={{ gap: 6 }}>
                <Pressable
                  onPress={() => setEntering(entering === k ? null : k)}
                  accessibilityRole="button"
                  accessibilityLabel={`Enter ${VITAL_LABEL[k]}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
                >
                  <Text variant="label" color={colors.text} style={{ flex: 1, minWidth: 0 }}>
                    {VITAL_LABEL[k]}
                  </Text>
                  <Text variant="caption" color={colors.primary}>
                    {entering === k ? 'Cancel' : 'Enter one'}
                  </Text>
                </Pressable>
                {entering === k && (
                  <ManualEntry
                    label={`${VITAL_LABEL[k]} (${VITAL_UNIT[k]})`}
                    onSave={(v) => {
                      setManual(k, v);
                      setEntering(null);
                    }}
                  />
                )}
              </View>
            ))}
            <Text variant="caption" color={colors.textFaint}>
              A hand-entered reading is kept as yours — a later sync fills in the blanks around it
              and never writes over it.
            </Text>
          </Card>
        </>
      )}

      <Card tone="alt" style={{ gap: spacing.sm, marginTop: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="shield" size={14} color={colors.textDim} />
          <Text variant="overline" color={colors.textDim}>WHAT THIS IS NOT</Text>
        </View>
        <Text variant="caption" color={colors.textFaint}>{VITALS_CAVEAT}</Text>
      </Card>

      <Pressable
        onPress={() => router.push('/readiness')}
        accessibilityRole="link"
        accessibilityLabel="Go to readiness"
        style={{ paddingVertical: spacing.lg }}
      >
        <Text variant="label" color={colors.primary} center>See today&apos;s readiness ›</Text>
      </Pressable>
    </Screen>
  );
}

function VitalCard({ reading, days }: { reading: VitalReading; days: Parameters<typeof seriesFor>[0] }) {
  const tint = TINT[reading.deviation](reading.favourable);
  const decimals = VITAL_DECIMALS[reading.key];
  const series = seriesFor(days, reading.key).slice(-30);

  return (
    <Card style={{ gap: spacing.md, marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
        <Text variant="metric" color={tint}>{reading.value.toFixed(decimals)}</Text>
        <Text variant="caption" color={colors.textFaint} style={{ paddingBottom: 4 }}>
          {reading.unit}
        </Text>
        <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end' }}>
          <Text variant="label" color={colors.text}>{reading.label}</Text>
          <View style={[styles.pill, { backgroundColor: `${tint}22` }]}>
            <Text variant="caption" color={tint}>
              {reading.delta > 0 ? '+' : reading.delta < 0 ? '−' : ''}
              {Math.abs(reading.delta).toFixed(decimals)} vs normal
            </Text>
          </View>
        </View>
      </View>

      {series.length >= 2 && (
        <LineChart
          data={series.map((p) => ({ label: formatDayMonth(p.date), value: p.value }))}
          width={300}
          color={tint}
        />
      )}

      <Text variant="caption" color={colors.textFaint}>{reading.note}</Text>
    </Card>
  );
}

function ManualEntry({ label, onSave }: { label: string; onSave: (value: number) => void }) {
  const [text, setText] = useState('');
  const value = Number.parseFloat(text);
  const valid = Number.isFinite(value) && value > 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Input
          value={text}
          onChangeText={setText}
          placeholder={label}
          keyboardType="decimal-pad"
          accessibilityLabel={label}
        />
      </View>
      <Pressable
        onPress={() => valid && onSave(value)}
        disabled={!valid}
        accessibilityRole="button"
        accessibilityLabel="Save reading"
        style={[styles.save, !valid && { opacity: 0.4 }]}
      >
        <Icon name="check" size={16} color={colors.onPrimary} />
      </Pressable>
    </View>
  );
}

/**
 * Colour by how unusual *and* by direction.
 *
 * A resting heart rate well below normal and one well above are both "off",
 * and painting them the same colour would tell somebody their best morning in
 * a month was a problem.
 */
const TINT: Record<Deviation, (favourable: boolean) => string> = {
  normal: () => colors.textDim,
  slightly_off: (f) => (f ? colors.lime : colors.amber),
  off: (f) => (f ? colors.success : colors.fat),
};

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, marginTop: 2 },
  save: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

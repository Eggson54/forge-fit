import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Card, EmptyState, LineChart, Pill, Screen, SectionHeader, StatTile, Text } from '../src/components/ui';
import { FadeIn } from '../src/components/anim';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Icon } from '../src/components/Icon';
import { colors, domainAccent, spacing } from '../src/theme';
import { formatDayMonth } from '../src/domain/date';
import { formatDuration } from '../src/domain/track';
import { FITNESS_CAVEAT, FORM_LABEL } from '../src/domain/fitness';
import { PREDICTIONS_CAVEAT, type Confidence } from '../src/domain/predictions';
import { BEST_EFFORTS_NOTE } from '../src/domain/bestEfforts';
import { ZONES_CAVEAT } from '../src/domain/zones';
import { useTraining } from '../src/stores/useTraining';

const CONFIDENCE_TINT: Record<Confidence, string> = {
  good: colors.success,
  fair: colors.amber,
  stretch: colors.textFaint,
};

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  good: 'Well supported',
  fair: 'A stretch',
  stretch: 'Arithmetic',
};

export default function Training() {
  const t = useTraining();

  return (
    <Screen gradient>
      <ScreenHeader title="Training" subtitle="Fitness, form and what it predicts" />

      {t.fitness ? (
        <FadeIn>
          <Card style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text variant="overline" color={colors.textFaint} style={{ flex: 1 }}>
                FITNESS & FORM
              </Text>
              <Pill label={FORM_LABEL[t.fitness.band]} color={colors.primary} />
            </View>

            <View style={{ flexDirection: 'row' }}>
              <StatTile value={`${Math.round(t.fitness.current.fitness)}`} label="Fitness" accent={colors.primary} />
              <StatTile value={`${Math.round(t.fitness.current.fatigue)}`} label="Fatigue" accent={colors.amber} />
              <StatTile
                value={`${t.fitness.current.form > 0 ? '+' : ''}${Math.round(t.fitness.current.form)}`}
                label="Form"
                accent={t.fitness.current.form >= 0 ? colors.success : colors.steps}
              />
            </View>

            {/* Both curves on one axis, because the gap between them *is* the
                third number and drawing it separately hides that. */}
            <LineChart
              data={t.series.slice(-90).map((p) => ({ label: formatDayMonth(p.date), value: p.fitness }))}
              overlay={t.series.slice(-90).map((p) => ({ label: formatDayMonth(p.date), value: p.fatigue }))}
              overlayColor={colors.amber}
              color={colors.primary}
              height={140}
            />
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Legend color={colors.primary} label="Fitness" />
              <Legend color={colors.amber} label="Fatigue" />
            </View>

            <Text variant="body" color={colors.textDim}>{t.fitness.detail}</Text>
            <Text variant="caption" color={colors.textFaint}>{t.fitness.caveat}</Text>
          </Card>
        </FadeIn>
      ) : (
        <EmptyState
          icon="chart"
          title="Not enough history yet"
          subtitle="Fitness and fatigue need about three weeks of logged training before the curves mean anything. Until then they only show themselves filling up from zero."
        />
      )}

      {t.bests.length > 0 && (
        <>
          <SectionHeader title="Best efforts" accent={domainAccent.progress} />
          <Card style={{ gap: spacing.xs }}>
            {t.bests.map((b) => (
              <View key={b.key} style={styles.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="body">{b.label}</Text>
                  <Text
                    variant="caption"
                    color={colors.textFaint}
                    numberOfLines={1}
                    onPress={() => router.push(`/record/${b.activityId}`)}
                  >
                    {b.activityName} · {formatDayMonth(b.date)}
                  </Text>
                </View>
                <Text variant="bodyStrong" color={colors.primary}>{formatDuration(b.seconds)}</Text>
              </View>
            ))}
            <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.xs }}>
              {BEST_EFFORTS_NOTE}
            </Text>
          </Card>
        </>
      )}

      {t.predictions.length > 0 && (
        <>
          <SectionHeader title="If you raced today" accent={domainAccent.progress} />
          {t.predictions.map((p) => (
            <Card key={p.target.key} style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text variant="bodyStrong" style={{ flex: 1 }}>{p.target.label}</Text>
                <Text variant="metric" color={CONFIDENCE_TINT[p.confidence]}>{formatDuration(p.seconds)}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="target" size={12} color={CONFIDENCE_TINT[p.confidence]} />
                <Text variant="caption" color={CONFIDENCE_TINT[p.confidence]}>
                  {CONFIDENCE_LABEL[p.confidence]} · {p.extrapolation}× the evidence
                </Text>
              </View>
              <Text variant="caption" color={colors.textFaint}>{p.note}</Text>
            </Card>
          ))}
          <Text variant="caption" color={colors.textFaint}>{PREDICTIONS_CAVEAT}</Text>
        </>
      )}

      <SectionHeader title="Your zones" accent={domainAccent.progress} />
      <Card style={{ gap: spacing.sm }}>
        {t.zones ? (
          <>
            <Text variant="bodyStrong">
              Maximum {t.zones.maxHr} bpm
              <Text variant="caption" color={t.zones.basis === 'measured' ? colors.success : colors.amber}>
                {t.zones.basis === 'measured' ? '  · measured' : '  · estimated from your age'}
              </Text>
            </Text>
            {t.zones.basis === 'estimated' && (
              <Text variant="caption" color={colors.textFaint}>{ZONES_CAVEAT}</Text>
            )}
          </>
        ) : (
          <Text variant="caption" color={colors.textDim}>
            Add your age, or a maximum heart rate you have actually seen, and every heart-rate number in the app gets a
            scale to sit on.
          </Text>
        )}
        <Text variant="caption" color={colors.primary} onPress={() => router.push('/settings/goals')}>
          Set it in Goals & targets ›
        </Text>
      </Card>

      <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
        {FITNESS_CAVEAT} Built from {t.days} {t.days === 1 ? 'day' : 'days'} with something logged.
      </Text>
    </Screen>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 9, height: 3, borderRadius: 2, backgroundColor: color }} />
      <Text variant="caption" color={colors.textFaint}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
});

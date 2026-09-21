import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Card, EmptyState, Screen, SectionHeader, Text } from '../src/components/ui';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { FadeIn } from '../src/components/anim';
import { Icon } from '../src/components/Icon';
import { colors, domainAccent, radius, spacing } from '../src/theme';
import {
  BIO_AGE_CAVEAT,
  CONFIDENCE_NOTE,
  type MarkerContribution,
} from '../src/domain/bioAge';
import { useBioAge } from '../src/stores/useBioAge';
import { useProfileStore } from '../src/stores/useProfileStore';

/**
 * Fitness age.
 *
 * The number is the point of the screen and also its biggest risk, so the
 * whole layout is built to keep it from being read as a medical result: every
 * marker shows what it is, what is typical at this person's age, and how many
 * years it is worth — and the confidence level sits next to the figure rather
 * than in a footnote.
 */
export default function BioAgeScreen() {
  const { now, projection } = useBioAge();
  const age = useProfileStore((s) => s.profile.age);

  if (!now) {
    return (
      <Screen gradient>
        <ScreenHeader title="Fitness age" subtitle="Your markers, expressed in years" />
        <EmptyState
          icon="levels"
          title={age == null ? 'Set your age first' : 'Not enough markers yet'}
          subtitle={
            age == null
              ? 'This compares your markers against what is typical at your age, so it needs to know your age.'
              : 'Built from resting heart rate, HRV, an estimated VO₂ max, sleep, body composition and how much you move. Connect Apple Health or log a few of those and it fills in.'
          }
          action={age == null ? 'Open your profile' : 'Set up integrations'}
          onAction={() => router.push(age == null ? '/settings/goals' : '/settings/integrations')}
        />
        <Card tone="alt" style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <Text variant="caption" color={colors.textFaint}>{BIO_AGE_CAVEAT}</Text>
        </Card>
      </Screen>
    );
  }

  const tint = now.delta <= 0 ? colors.success : colors.amber;

  return (
    <Screen gradient>
      <ScreenHeader title="Fitness age" subtitle="Your markers, expressed in years" />

      <FadeIn>
        <Card style={{ gap: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: `${tint}44` }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
            <Text variant="display" color={tint}>{now.years.toFixed(1)}</Text>
            <View style={{ flex: 1, minWidth: 0, paddingBottom: 8 }}>
              <Text variant="caption" color={colors.textFaint}>
                against {now.chronologicalAge} actual
              </Text>
              <View style={[styles.pill, { backgroundColor: `${tint}22` }]}>
                <Text variant="caption" color={tint}>
                  {now.delta === 0 ? 'level' : `${Math.abs(now.delta).toFixed(1)} years ${now.delta < 0 ? 'younger' : 'older'}`}
                </Text>
              </View>
            </View>
          </View>

          {/* The two ages on one line, so the gap is a distance rather than a
              pair of numbers to compare in your head. */}
          <Scale actual={now.chronologicalAge} fitness={now.years} tint={tint} />

          <Text variant="body" color={colors.text}>{now.headline}</Text>
          <Text variant="caption" color={colors.textFaint}>
            Confidence: {now.confidence}. {CONFIDENCE_NOTE[now.confidence]}
          </Text>
        </Card>
      </FadeIn>

      {projection && (
        <FadeIn delay={80}>
          <Card tone="alt" style={{ gap: spacing.sm, marginBottom: spacing.md }}>
            <Text variant="overline" color={colors.textDim}>IF THIS HOLDS</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
              <Text variant="metric" color={projection.delta <= 0 ? colors.success : colors.amber}>
                {projection.years.toFixed(1)}
              </Text>
              <Text variant="caption" color={colors.textFaint}>in {projection.horizonDays} days</Text>
            </View>
            <Text variant="caption" color={colors.textFaint}>{projection.note}</Text>
          </Card>
        </FadeIn>
      )}

      <SectionHeader title="What moved it" accent={domainAccent.progress} />
      <Card style={{ gap: spacing.md, marginBottom: spacing.md }}>
        {now.markers.map((m, i) => (
          <Marker key={m.key} marker={m} first={i === 0} />
        ))}
        <Text variant="caption" color={colors.textFaint}>
          Each marker is scored against what is typical at {now.chronologicalAge}, not against a fixed
          young-adult benchmark — otherwise this would just be your age again with noise on top.
        </Text>
      </Card>

      <Card tone="alt" style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="shield" size={14} color={colors.textDim} />
          <Text variant="overline" color={colors.textDim}>WHAT THIS IS NOT</Text>
        </View>
        <Text variant="caption" color={colors.textFaint}>{BIO_AGE_CAVEAT}</Text>
      </Card>

      <Pressable
        onPress={() => router.push('/health')}
        accessibilityRole="link"
        accessibilityLabel="Go to health monitor"
        style={{ paddingVertical: spacing.lg }}
      >
        <Text variant="label" color={colors.primary} center>See the signals behind it ›</Text>
      </Pressable>
    </Screen>
  );
}

/** Actual and fitness age on one axis, so the gap reads as a distance. */
function Scale({ actual, fitness, tint }: { actual: number; fitness: number; tint: string }) {
  const low = Math.floor(Math.min(actual, fitness) - 6);
  const high = Math.ceil(Math.max(actual, fitness) + 6);
  const at = (value: number) => ((value - low) / Math.max(1, high - low)) * 100;
  return (
    <View style={{ gap: 6, paddingTop: spacing.sm }}>
      <View style={styles.axis}>
        <View style={[styles.tick, { left: `${at(actual)}%`, backgroundColor: colors.textDim }]} />
        <View style={[styles.tick, { left: `${at(fitness)}%`, backgroundColor: tint, width: 3 }]} />
      </View>
      <View style={{ flexDirection: 'row' }}>
        <Text variant="caption" color={colors.textFaint} style={{ flex: 1 }}>{low}</Text>
        <Text variant="caption" color={colors.textFaint}>{high}</Text>
      </View>
    </View>
  );
}

function Marker({ marker, first }: { marker: MarkerContribution; first: boolean }) {
  const tint = marker.years < -0.3 ? colors.success : marker.years > 0.3 ? colors.amber : colors.textDim;
  return (
    <View
      style={[
        { gap: 5 },
        !first && { borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: spacing.md },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text variant="label" color={colors.text} style={{ flex: 1, minWidth: 0 }}>{marker.label}</Text>
        <Text variant="caption" color={tint}>
          {marker.years === 0 ? '—' : `${marker.years > 0 ? '+' : '−'}${Math.abs(marker.years).toFixed(1)} yr`}
        </Text>
      </View>
      <Text variant="caption" color={colors.textFaint}>{marker.note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, marginTop: 3 },
  axis: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt },
  tick: { position: 'absolute', top: -3, bottom: -3, width: 2, borderRadius: 2 },
});

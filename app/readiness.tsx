import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Card, EmptyState, Screen, SectionHeader, Text } from '../src/components/ui';
import { AnimatedProgressRing, FadeIn } from '../src/components/anim';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Icon } from '../src/components/Icon';
import { colors, domainAccent, spacing } from '../src/theme';
import {
  BAND_LABEL,
  BAND_TINT,
  READINESS_CAVEAT,
  type ReadinessComponent,
} from '../src/domain/readiness';
import { useReadiness } from '../src/stores/useReadiness';

/**
 * How ready today looks, from what the app was told.
 *
 * The number is the least interesting thing here, so the screen spends most of
 * its space on the five components behind it: which ones are dragging, by how
 * much, and what each one actually measured. A score with no breakdown is a
 * horoscope.
 */
export default function ReadinessScreen() {
  const reading = useReadiness();

  if (!reading) {
    return (
      <Screen gradient>
        <ScreenHeader title="Readiness" subtitle="From your sleep, your sessions and your week" />
        <EmptyState
          icon="moon"
          title="Nothing to read yet"
          subtitle="This is built from logged sleep, how your last session felt, and how this week compares with your recent normal. Log a night's sleep or finish a session and it fills in."
          action="Log your sleep"
          onAction={() => router.push('/log')}
        />
        <Card tone="alt" style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <Text variant="caption" color={colors.textFaint}>{READINESS_CAVEAT}</Text>
        </Card>
      </Screen>
    );
  }

  const tint = BAND_TINT[reading.band];

  return (
    <Screen gradient>
      <ScreenHeader title="Readiness" subtitle="From your sleep, your sessions and your week" />

      <FadeIn>
        <Card style={{ gap: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: `${tint}44` }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <AnimatedProgressRing progress={reading.score / 100} size={104} stroke={10} color={tint}>
              <Text variant="metric" color={tint}>{reading.score}</Text>
              <Text variant="caption" color={colors.textFaint}>of 100</Text>
            </AnimatedProgressRing>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text variant="title" color={tint}>{BAND_LABEL[reading.band]}</Text>
              <Text variant="caption" color={colors.textDim}>{reading.headline}</Text>
            </View>
          </View>
        </Card>
      </FadeIn>

      <SectionHeader title="What went into it" accent={domainAccent.progress} />
      <Card style={{ gap: spacing.md, marginBottom: spacing.md }}>
        {reading.components.map((c, i) => (
          <Component key={c.key} c={c} first={i === 0} />
        ))}
        <Text variant="caption" color={colors.textFaint}>
          Anything the app was not told is left out of the sum rather than scored as a zero —
          not knowing how you slept is not the same as sleeping badly.
        </Text>
      </Card>

      <Card tone="alt" style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="shield" size={14} color={colors.textDim} />
          <Text variant="overline" color={colors.textDim}>WHAT THIS IS NOT</Text>
        </View>
        <Text variant="caption" color={colors.textFaint}>{READINESS_CAVEAT}</Text>
      </Card>

      <Pressable
        onPress={() => router.push('/workout/recovery')}
        accessibilityRole="link"
        accessibilityLabel="Go to recovery"
        style={{ paddingVertical: spacing.lg }}
      >
        <Text variant="label" color={colors.primary} center>See what's recovered ›</Text>
      </Pressable>
    </Screen>
  );
}

function Component({ c, first }: { c: ReadinessComponent; first: boolean }) {
  const tint = c.score >= 0.85 ? colors.success : c.score >= 0.6 ? colors.lime : c.score >= 0.4 ? colors.amber : colors.fat;
  return (
    <View style={[styles.row, !first && { borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: spacing.md }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text variant="label" color={colors.text} style={{ flex: 1, minWidth: 0 }}>{c.label}</Text>
        {/* The weight is on screen because a component worth 16% of the number
            and one worth 32% should not look alike. */}
        <Text variant="caption" color={colors.textFaint}>{Math.round(c.weight * 100)}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(c.score * 100)}%`, backgroundColor: tint }]} />
      </View>
      <Text variant="caption" color={colors.textFaint}>{c.note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6 },
  track: { height: 5, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});

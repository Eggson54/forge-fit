import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Card, EmptyState, Screen, SectionHeader, StatTile, Text } from '../src/components/ui';
import { AnimatedProgressRing, FadeIn } from '../src/components/anim';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Icon } from '../src/components/Icon';
import { colors, domainAccent, spacing } from '../src/theme';
import { groupThousands } from '../src/domain/units';
import { MAX_STRAIN, SCORES_CAVEAT, bandFor, formatHours, type Score, type ScorePart } from '../src/domain/scores';
import { BAND_LABEL, BAND_TINT } from '../src/domain/readiness';
import { MORE_SCORES_CAVEAT, type StressReading } from '../src/domain/moreScores';
import { useScores } from '../src/stores/useScores';
import { useMoreScores } from '../src/stores/useMoreScores';
import { useReadiness } from '../src/stores/useReadiness';

/**
 * Today, as numbers.
 *
 * Each card shows its working, because a score with no breakdown is an oracle
 * and people either believe an oracle too much or stop looking at it. A score
 * the app cannot compute is absent rather than shown as a middling number —
 * a 50 nobody earned reads exactly like a 50 somebody did.
 */
export default function Scores() {
  const s = useScores();
  const more = useMoreScores();
  const readiness = useReadiness();

  const anything =
    s.sleep || s.nutrition || s.strain.value > 0 || s.energy || s.cardio || readiness;

  if (!anything) {
    return (
      <Screen gradient>
        <ScreenHeader title="Today" subtitle="Your scores, and what went into them" />
        <EmptyState
          icon="chart"
          title="Nothing to score yet"
          subtitle="Log a night's sleep, a meal or a session and these fill in. Nothing here is guessed from an empty day."
          action="Log something"
          onAction={() => router.push('/log')}
        />
      </Screen>
    );
  }

  return (
    <Screen gradient>
      <ScreenHeader title="Today" subtitle="Your scores, and what went into them" />

      {readiness && (
        <FadeIn>
          <Card
            onPress={() => router.push('/readiness')}
            style={{ gap: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: `${BAND_TINT[readiness.band]}44` }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
              <AnimatedProgressRing progress={readiness.score / 100} size={92} stroke={9} color={BAND_TINT[readiness.band]}>
                <Text variant="metric" color={BAND_TINT[readiness.band]}>{readiness.score}</Text>
              </AnimatedProgressRing>
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text variant="overline" color={colors.textFaint}>RECOVERY</Text>
                <Text variant="title" color={BAND_TINT[readiness.band]}>{BAND_LABEL[readiness.band]}</Text>
                <Text variant="caption" color={colors.textDim} numberOfLines={3}>{readiness.headline}</Text>
              </View>
            </View>
          </Card>
        </FadeIn>
      )}

      <FadeIn delay={60}>
        <Card style={{ gap: spacing.md, marginBottom: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
            <Text variant="display" color={strainTint(s.strain.value)}>{s.strain.value.toFixed(1)}</Text>
            <Text variant="caption" color={colors.textFaint} style={{ paddingBottom: 8 }}>
              of {MAX_STRAIN}
            </Text>
            <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end', paddingBottom: 6 }}>
              <Text variant="overline" color={colors.textFaint}>STRAIN</Text>
              {s.strainTarget && (
                <Text variant="caption" color={colors.textDim}>
                  today&apos;s range {s.strainTarget.low}–{s.strainTarget.high}
                </Text>
              )}
            </View>
          </View>

          {/* The target range as a band on the bar, not a single number: the
              inputs here are indirect and false precision would be worse. */}
          <View style={styles.track}>
            {s.strainTarget && (
              <View
                style={[
                  styles.targetBand,
                  {
                    left: `${(s.strainTarget.low / MAX_STRAIN) * 100}%`,
                    width: `${((s.strainTarget.high - s.strainTarget.low) / MAX_STRAIN) * 100}%`,
                  },
                ]}
              />
            )}
            <View
              style={[
                styles.fill,
                { width: `${(s.strain.value / MAX_STRAIN) * 100}%`, backgroundColor: strainTint(s.strain.value) },
              ]}
            />
          </View>

          <Text variant="caption" color={colors.textFaint}>{s.strain.headline}</Text>
          {s.strain.parts.map((p) => (
            <Part key={p.label} part={p} />
          ))}
        </Card>
      </FadeIn>

      {s.sleep && <ScoreCard title="SLEEP" score={s.sleep} delay={120} onPress={() => router.push('/progress/habits')} />}
      {s.nutrition && (
        <ScoreCard title="NUTRITION" score={s.nutrition} delay={180} onPress={() => router.push('/(tabs)/nutrition')} />
      )}

      {s.energy && (
        <FadeIn delay={240}>
          <Card style={{ gap: spacing.md, marginBottom: spacing.md }} onPress={() => router.push('/nutrition/energy')}>
            <Text variant="overline" color={colors.textFaint}>ENERGY BANK</Text>
            <View style={{ flexDirection: 'row' }}>
              <StatTile value={groupThousands(s.energy.inKcal)} label="In" accent={colors.calorie} />
              <StatTile value={groupThousands(s.energy.maintenanceKcal + s.energy.activeKcal)} label="Out (est.)" accent={colors.steps} />
              <StatTile
                value={`${s.energy.balance > 0 ? '+' : '−'}${groupThousands(Math.abs(s.energy.balance))}`}
                label="Balance"
                accent={s.energy.balance <= 0 ? colors.success : colors.amber}
              />
            </View>
            <Text variant="caption" color={colors.textFaint}>
              {s.energy.note} Both sides are estimates — the out side especially.
            </Text>
          </Card>
        </FadeIn>
      )}

      {s.cardio && (
        <FadeIn delay={300}>
          <Card style={{ gap: spacing.sm, marginBottom: spacing.md }} onPress={() => router.push('/progress/cardio')}>
            <Text variant="overline" color={colors.textFaint}>CARDIO LOAD</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
              <Text variant="metric" color={loadTint(s.cardio.verdict)}>{s.cardio.ratio.toFixed(2)}×</Text>
              <Text variant="caption" color={colors.textDim}>
                {s.cardio.acuteMinutes} min this week vs {s.cardio.chronicWeeklyMinutes} usual
              </Text>
            </View>
            <Text variant="caption" color={colors.textFaint}>{s.cardio.note}</Text>
          </Card>
        </FadeIn>
      )}

      {more.stress && (
        <FadeIn delay={330}>
          <Card style={{ gap: spacing.md, marginBottom: spacing.md }}>
            <Text variant="overline" color={colors.textFaint}>STRESS</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
              <Text variant="metric" color={stressTint(more.stress.band)}>{more.stress.score}</Text>
              <Text variant="label" color={stressTint(more.stress.band)}>
                {more.stress.band.replace('_', ' ')}
              </Text>
            </View>
            <Text variant="caption" color={colors.textDim}>{more.stress.headline}</Text>
            {more.stress.parts.map((part) => (
              <View key={part.label} style={{ gap: 2 }}>
                <Text variant="label" color={colors.textDim}>{part.label}</Text>
                <Text variant="caption" color={colors.textFaint}>{part.note}</Text>
              </View>
            ))}
          </Card>
        </FadeIn>
      )}

      {more.cardioFocus.focus !== 'none' && (
        <FadeIn delay={360}>
          <Card style={{ gap: spacing.sm, marginBottom: spacing.md }} onPress={() => router.push('/progress/cardio')}>
            <Text variant="overline" color={colors.textFaint}>CONDITIONING MIX</Text>
            <View style={{ flexDirection: 'row' }}>
              <StatTile value={`${Math.round(more.cardioFocus.easyShare * 100)}%`} label="Easy" accent={colors.success} />
              <StatTile value={`${Math.round(more.cardioFocus.easyMinutes)}m`} label="Base" accent={colors.steps} />
              <StatTile value={`${Math.round(more.cardioFocus.hardMinutes)}m`} label="Intensity" accent={colors.primary} />
            </View>
            <Text variant="caption" color={colors.textFaint}>{more.cardioFocus.note}</Text>
          </Card>
        </FadeIn>
      )}

      {more.hrRecovery && (
        <FadeIn delay={390}>
          <Card style={{ gap: spacing.sm, marginBottom: spacing.md }} onPress={() => router.push('/health')}>
            <Text variant="overline" color={colors.textFaint}>HEART-RATE RECOVERY</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
              <Text variant="metric" color={more.hrRecovery.drop > 0 ? colors.success : colors.amber}>
                {more.hrRecovery.drop > 0 ? '−' : ''}{Math.abs(more.hrRecovery.drop)}
              </Text>
              <Text variant="caption" color={colors.textDim}>bpm from the window's high</Text>
            </View>
            <Text variant="caption" color={colors.textFaint}>{more.hrRecovery.note}</Text>
          </Card>
        </FadeIn>
      )}

      {more.sleepNeed && (
        <FadeIn delay={420}>
          <Card style={{ gap: spacing.sm, marginBottom: spacing.md }} onPress={() => router.push('/progress/habits')}>
            <Text variant="overline" color={colors.textFaint}>SLEEP NEED</Text>
            <View style={{ flexDirection: 'row' }}>
              <StatTile value={formatHours(more.sleepNeed.suggested)} label="Your nights suggest" accent={colors.sleep} />
              <StatTile value={formatHours(more.sleepNeed.current)} label="Your target" accent={colors.textDim} />
            </View>
            <Text variant="caption" color={colors.textFaint}>{more.sleepNeed.note}</Text>
          </Card>
        </FadeIn>
      )}

      {(more.weightProjection || more.bodyFatProjection) && (
        <FadeIn delay={450}>
          <Card style={{ gap: spacing.sm, marginBottom: spacing.md }} onPress={() => router.push('/progress/weight')}>
            <Text variant="overline" color={colors.textFaint}>IF THE TREND HOLDS</Text>
            {more.weightProjection && (
              <Text variant="caption" color={colors.textDim}>{more.weightProjection.note}</Text>
            )}
            {more.bodyFatProjection && (
              <Text variant="caption" color={colors.textDim}>{more.bodyFatProjection.note}</Text>
            )}
            <Text variant="caption" color={colors.textFaint}>
              A projection is a line drawn through what has already happened. It knows nothing about next month.
            </Text>
          </Card>
        </FadeIn>
      )}

      <SectionHeader title="How to read these" accent={domainAccent.progress} />
      <Card tone="alt" style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="shield" size={14} color={colors.textDim} />
          <Text variant="overline" color={colors.textDim}>INDEXES, NOT MEASUREMENTS</Text>
        </View>
        <Text variant="caption" color={colors.textFaint}>{SCORES_CAVEAT}</Text>
        <Text variant="caption" color={colors.textFaint}>{MORE_SCORES_CAVEAT}</Text>
      </Card>

      <Pressable
        onPress={() => router.push('/health')}
        accessibilityRole="link"
        accessibilityLabel="Go to health monitor"
        style={{ paddingVertical: spacing.lg }}
      >
        <Text variant="label" color={colors.primary} center>See your health monitor ›</Text>
      </Pressable>
    </Screen>
  );
}

function ScoreCard({
  title,
  score,
  delay,
  onPress,
}: {
  title: string;
  score: Score;
  delay: number;
  onPress: () => void;
}) {
  return (
    <FadeIn delay={delay}>
      <Card style={{ gap: spacing.md, marginBottom: spacing.md }} onPress={onPress}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <AnimatedProgressRing progress={score.value / 100} size={72} stroke={8} color={score.band.tint}>
            <Text variant="label" color={score.band.tint}>{score.value}</Text>
          </AnimatedProgressRing>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="overline" color={colors.textFaint}>{title}</Text>
            <Text variant="label" color={score.band.tint}>{score.band.label}</Text>
            <Text variant="caption" color={colors.textDim} numberOfLines={3}>{score.headline}</Text>
          </View>
        </View>
        <View style={{ gap: spacing.sm, borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: spacing.md }}>
          {score.parts.map((p) => (
            <Part key={p.label} part={p} />
          ))}
        </View>
      </Card>
    </FadeIn>
  );
}

function Part({ part }: { part: ScorePart }) {
  const tint = bandFor(part.score * 100).tint;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Text variant="caption" color={colors.text} style={{ flex: 1, minWidth: 0 }}>{part.label}</Text>
        <Text variant="caption" color={colors.textFaint}>{Math.round(part.weight * 100)}%</Text>
      </View>
      <View style={styles.thin}>
        <View style={[styles.fill, { width: `${Math.round(part.score * 100)}%`, backgroundColor: tint }]} />
      </View>
      <Text variant="caption" color={colors.textFaint}>{part.note}</Text>
    </View>
  );
}

function strainTint(value: number): string {
  if (value >= 17) return colors.fat;
  if (value >= 13) return colors.amber;
  if (value >= 8) return colors.lime;
  return colors.info;
}

function loadTint(verdict: 'detraining' | 'steady' | 'building' | 'spiking'): string {
  if (verdict === 'spiking') return colors.fat;
  if (verdict === 'detraining') return colors.textDim;
  if (verdict === 'building') return colors.lime;
  return colors.success;
}

const styles = StyleSheet.create({
  track: { height: 12, borderRadius: 6, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  thin: { height: 5, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6 },
  targetBand: { position: 'absolute', top: 0, bottom: 0, backgroundColor: `${colors.success}33` },
});

function stressTint(band: StressReading['band']): string {
  if (band === 'high') return colors.danger;
  if (band === 'elevated') return colors.amber;
  if (band === 'moderate') return colors.steps;
  return colors.success;
}

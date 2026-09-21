import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Card, EmptyState, Screen, SectionHeader, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { FadeIn } from '../../src/components/anim';
import { Icon } from '../../src/components/Icon';
import { colors, domainAccent, radius, spacing } from '../../src/theme';
import { formatDayMonth, todayISO } from '../../src/domain/date';
import {
  RECOVERY_BLURB,
  RECOVERY_CAVEAT,
  RECOVERY_LABEL,
  readRecovery,
  recoveryBoard,
  recoveryFraction,
  type MuscleRecovery,
  type RecoveryState,
} from '../../src/domain/recovery';
import { VOLUME_LANDMARKS, volumeStatus } from '../../src/domain/volume';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';

/**
 * How long it has been since each muscle worked.
 *
 * The weekly body map on the progress tab answers "how much"; this answers
 * "how recently", and the two disagree often enough to be worth separating.
 * Twenty sets of chest, all on one Monday, reads as healthy volume there and
 * as six days of nothing here.
 */
export default function Recovery() {
  const workouts = useWorkoutStore((s) => s.completedWorkouts());
  const today = todayISO();

  const board = useMemo(() => recoveryBoard(workouts, today), [workouts, today]);
  const reading = readRecovery(board);

  if (workouts.length === 0) {
    return (
      <Screen gradient>
        <ScreenHeader title="Recovery" subtitle="Time since each muscle last worked" />
        <EmptyState
          icon="timer"
          title="Nothing trained yet"
          subtitle="Finish a session and this fills in — one row per muscle, longest wait at the top."
          action="Start a workout"
          onAction={() => router.push('/(tabs)/workout')}
        />
      </Screen>
    );
  }

  return (
    <Screen gradient>
      <ScreenHeader title="Recovery" subtitle="Time since each muscle last worked" />

      {reading && (
        <FadeIn>
          <Card style={{ gap: spacing.sm, marginBottom: spacing.md, borderWidth: 1, borderColor: `${domainAccent.training}33` }}>
            <Text variant="overline" color={colors.textDim}>WHERE YOU STAND</Text>
            <Text variant="body" color={colors.text}>{reading}</Text>
          </Card>
        </FadeIn>
      )}

      <SectionHeader title="By muscle" accent={domainAccent.training} />
      <Card style={{ gap: spacing.md, marginBottom: spacing.md }}>
        {board.map((row, i) => (
          <Row key={row.muscle} row={row} first={i === 0} />
        ))}
      </Card>

      <Card tone="alt" style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="shield" size={14} color={colors.textDim} />
          <Text variant="overline" color={colors.textDim}>WHAT THIS CANNOT SEE</Text>
        </View>
        <Text variant="caption" color={colors.textFaint}>{RECOVERY_CAVEAT}</Text>
      </Card>

      <Pressable
        onPress={() => router.push('/workout/generate')}
        accessibilityRole="link"
        accessibilityLabel="Build a session"
        style={{ paddingVertical: spacing.lg }}
      >
        <Text variant="label" color={colors.primary} center>Build a session around this ›</Text>
      </Pressable>
    </Screen>
  );
}

function Row({ row, first }: { row: MuscleRecovery; first: boolean }) {
  const tint = STATE_TINT[row.state];
  const fill = recoveryFraction(row.daysSince);
  const landmark = VOLUME_LANDMARKS[row.muscle];
  const volume = volumeStatus(row.muscle, row.setsThisWeek);

  return (
    <View style={[styles.row, !first && { borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: spacing.md }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text variant="label" color={colors.text} style={{ flex: 1, minWidth: 0 }}>{row.label}</Text>
        <View style={[styles.pill, { backgroundColor: `${tint}22` }]}>
          <Text variant="caption" color={tint}>{RECOVERY_LABEL[row.state]}</Text>
        </View>
      </View>

      {/* A bar that fills as the wait passes, rather than a number alone. */}
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(fill * 100)}%`, backgroundColor: tint }]} />
      </View>

      <Text variant="caption" color={colors.textFaint}>
        {row.daysSince == null
          ? RECOVERY_BLURB.untrained
          : `${row.daysSince === 0 ? 'Today' : row.daysSince === 1 ? 'Yesterday' : `${row.daysSince} days ago`}${row.lastDate && row.daysSince > 1 ? ` · ${formatDayMonth(row.lastDate)}` : ''} · ${row.setsThisWeek} ${row.setsThisWeek === 1 ? 'set' : 'sets'} this week${landmark ? ` of ${landmark.min}–${landmark.max}` : ''}${volume === 'low' && row.setsThisWeek > 0 ? ' — under the usual range' : ''}`}
      </Text>
    </View>
  );
}

const STATE_TINT: Record<RecoveryState, string> = {
  today: colors.info,
  recovering: colors.amber,
  ready: colors.success,
  overdue: colors.fat,
  untrained: colors.textDim,
};

const styles = StyleSheet.create({
  row: { gap: 6 },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  track: { height: 5, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});

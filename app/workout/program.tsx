import React, { useMemo } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, EmptyState, LinearProgress, Pill, Screen, SectionHeader, StatTile, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { FadeIn } from '../../src/components/anim';
import { MuscleThumb } from '../../src/components/body/MuscleThumb';
import { Icon } from '../../src/components/Icon';
import { colors, spacing } from '../../src/theme';
import { formatDayMonth, todayISO } from '../../src/domain/date';
import { isStale, programPosition, projectedDates, weekMultiplier } from '../../src/domain/program';
import { programById } from '../../src/data/programs';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { useProgramStore } from '../../src/stores/useProgramStore';

export default function CurrentProgram() {
  const enrolment = useProgramStore((s) => s.enrolment);
  const startNext = useProgramStore((s) => s.startNextSession);
  const leave = useProgramStore((s) => s.leave);
  const restart = useProgramStore((s) => s.restart);
  const experience = useProfileStore((s) => s.profile.experience);

  const program = enrolment ? programById(enrolment.programId) : undefined;
  const position = useMemo(
    () => (program && enrolment ? programPosition(program, enrolment) : null),
    [program, enrolment],
  );

  if (!program || !enrolment || !position) {
    return (
      <Screen gradient>
        <ScreenHeader title="Your Plan" />
        <EmptyState
          icon="calendar"
          title="No plan running"
          subtitle="A plan gives each session a job, so you're not deciding what to train while standing in the gym."
          action="Browse plans"
          onAction={() => router.replace('/workout/programs')}
        />
      </Screen>
    );
  }

  const stale = isStale(enrolment, todayISO());
  const upcoming = projectedDates(program, todayISO(), Math.min(4, position.sessionsTotal - position.sessionsDone));
  const multiplier = weekMultiplier(program, position.week);

  const confirmLeave = () => {
    Alert.alert('Leave this plan?', 'Your logged workouts stay; only the plan itself is dropped.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => { leave(); router.replace('/workout/programs'); } },
    ]);
  };

  return (
    <Screen gradient>
      <ScreenHeader title={program.name} />

      {stale && (
        <Card tone="alt" style={{ marginBottom: spacing.md }}>
          <Text variant="bodyStrong">This plan has been idle a while</Text>
          <Text variant="caption" color={colors.textDim} style={{ marginTop: spacing.xs }}>
            Picking up mid-plan after a long break usually means starting heavier than you should. Restarting from week
            one is not a punishment — it's the faster route back.
          </Text>
          <Button title="Restart from week one" variant="secondary" style={{ marginTop: spacing.md }} onPress={restart} />
        </Card>
      )}

      <Card style={{ marginBottom: spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
          <Text variant="overline" color={colors.textDim}>
            Week {position.week} of {program.weeks}
          </Text>
          <Text variant="caption" color={colors.textDim}>
            {position.sessionsDone} / {position.sessionsTotal} sessions
          </Text>
        </View>
        <LinearProgress progress={position.sessionsDone / position.sessionsTotal} color={colors.primary} />
      </Card>

      {position.finished ? (
        <Card>
          <Text variant="h3">Plan complete</Text>
          <Text variant="caption" color={colors.textDim} style={{ marginTop: spacing.xs }}>
            {position.sessionsTotal} sessions over {program.weeks} weeks. Run it again from week one with your new
            numbers, or pick a different structure.
          </Text>
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            <Button title="Run it again" onPress={restart} />
            <Button title="Browse other plans" variant="secondary" onPress={() => router.replace('/workout/programs')} />
          </View>
        </Card>
      ) : (
        <>
          <SectionHeader title="Next session" />
          <FadeIn>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <MuscleThumb muscle={position.day!.focus[0] ?? 'full_body'} size={34} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="h3" numberOfLines={1}>
                    {position.day!.name}
                  </Text>
                  <Text variant="caption" color={colors.textDim}>
                    {position.day!.exercises.length} exercises ·{' '}
                    {position.day!.exercises.reduce((a, e) => a + e.sets, 0)} sets
                  </Text>
                </View>
                {multiplier > 1 && <Pill label={`×${multiplier}`} color={colors.amber} />}
              </View>

              <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                {position.day!.exercises.map((e) => (
                  <View key={e.exerciseId} style={styles.row}>
                    <Text variant="label" style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
                      {e.name}
                    </Text>
                    <Text variant="caption" color={colors.textFaint}>
                      {e.sets} × {e.targetReps}
                    </Text>
                  </View>
                ))}
              </View>

              {multiplier > 1 && (
                <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.md }}>
                  Week {position.week} suggests about {Math.round((multiplier - 1) * 100)}% more than your week-one
                  weights. It's a suggestion on your own numbers — the logger still fills weights from what you lifted.
                </Text>
              )}

              <Button
                title="Start this session"
                style={{ marginTop: spacing.md }}
                onPress={() => {
                  const id = startNext(experience);
                  if (id) router.push('/workout/active');
                }}
              />
            </Card>
          </FadeIn>

          <SectionHeader title="Coming up" />
          <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
            {upcoming.map((date, i) => {
              const day = program.days[(position.sessionsDone + i) % program.daysPerWeek];
              return (
                <View key={date} style={[styles.upcoming, i < upcoming.length - 1 && styles.border]}>
                  <Text variant="caption" color={i === 0 ? colors.primary : colors.textFaint} style={{ width: 54 }}>
                    {i === 0 ? 'Today' : formatDayMonth(date)}
                  </Text>
                  <Text variant="label" style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
                    {day?.name ?? '—'}
                  </Text>
                  <Icon name="chevron_right" size={14} color={colors.textFaint} />
                </View>
              );
            })}
          </Card>
          <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
            Dates are a suggested cadence. The plan advances when you finish a session, not when a day passes — a missed
            Tuesday costs you nothing.
          </Text>
        </>
      )}

      <Card style={{ flexDirection: 'row', marginTop: spacing.lg }}>
        <StatTile value={`${position.sessionsDone}`} label="Sessions done" accent={colors.primary} />
        <StatTile value={`${program.daysPerWeek}`} label="Per week" accent={colors.lime} />
        <StatTile value={`${program.weeks}`} label="Weeks" accent={colors.water} />
      </Card>

      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        <Button title="Browse other plans" variant="ghost" onPress={() => router.push('/workout/programs')} />
        <Button title="Leave this plan" variant="ghost" onPress={confirmLeave} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  upcoming: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  border: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});

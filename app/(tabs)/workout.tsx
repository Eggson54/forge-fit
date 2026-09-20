import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Card, EmptyState, IconButton, Pill, Screen, SectionHeader, Text, Well } from '../../src/components/ui';
import { Stagger } from '../../src/components/anim';
import { Icon, type IconName } from '../../src/components/Icon';
import { Masthead } from '../../src/components/Masthead';
import { colors, domainAccent, radius, spacing } from '../../src/theme';
import { formatDayMonth, formatDurationShort, lastNDays, todayISO } from '../../src/domain/date';
import { workoutStats } from '../../src/domain/strength';
import { suggestToday } from '../../src/domain/suggestion';
import { displayVolume } from '../../src/domain/units';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { useProgramStore } from '../../src/stores/useProgramStore';
import { useRoutineStore } from '../../src/stores/useRoutineStore';
import { useGymStore } from '../../src/stores/useGymStore';
import { programById } from '../../src/data/programs';
import { exerciseById } from '../../src/data/exercises';

export default function WorkoutTab() {
  const workouts = useWorkoutStore((s) => s.workouts);
  const activeId = useWorkoutStore((s) => s.activeId);
  const startEmpty = useWorkoutStore((s) => s.startEmptyWorkout);
  const profile = useProfileStore((s) => s.profile);
  const units = profile.units;
  const bodyweightKg = profile.weightKg ?? null;
  const routines = useRoutineStore((s) => s.routines);
  const startRoutine = useRoutineStore((s) => s.start);
  const enrolment = useProgramStore((s) => s.enrolment);
  const position = useProgramStore((s) => s.position());
  const startProgramSession = useProgramStore((s) => s.startNextSession);
  const claimedGyms = useGymStore((s) => s.claims.length);

  const enrolledProgram = enrolment ? programById(enrolment.programId) : null;
  const planDay = position && !position.finished ? position.day : null;

  const allCompleted = workouts.filter((w) => w.status === 'completed');
  const completed = allCompleted.slice(0, 4);
  const active = workouts.find((w) => w.id === activeId);

  const today = todayISO();
  const weekDates = lastNDays(7);
  const suggestion = React.useMemo(
    () =>
      suggestToday({
        workouts: allCompleted,
        today,
        weekDates,
        trainingDaysPerWeek: profile.trainingDaysPerWeek,
        routines: routines.map((r) => ({
          id: r.id,
          name: r.name,
          // Routines store only the primary muscle per exercise; pull the
          // secondaries from the library so a push day counts as triceps work.
          muscles: r.exercises.flatMap((e) => [
            e.primaryMuscle,
            ...(exerciseById(e.exerciseId)?.secondaryMuscles ?? []),
          ]),
        })),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allCompleted, today, profile.trainingDaysPerWeek, routines],
  );

  const startBlank = () => {
    if (active) {
      router.push('/workout/active');
      return;
    }
    startEmpty('Workout');
    router.push('/workout/active');
  };

  // One primary action that does the most sensible thing, rather than a wall of
  // tiles that all look equally like the way in.
  const primary = active
    ? { eyebrow: 'IN PROGRESS', title: active.name, detail: `${active.exercises.length} exercises · tap to resume`, cta: 'Resume' }
    : planDay && enrolledProgram
      ? {
          eyebrow: `${enrolledProgram.name.toUpperCase()} · WEEK ${position!.week}`,
          title: planDay.name,
          detail: `${planDay.exercises.length} exercises from your plan`,
          cta: 'Start this session',
        }
      : suggestion.kind === 'routine' && suggestion.routineId
        ? { eyebrow: 'YOUR ROUTINE', title: suggestion.title, detail: suggestion.reason, cta: 'Start this routine' }
        : suggestion.kind === 'rest'
          ? { eyebrow: 'TODAY', title: 'Rest day', detail: suggestion.reason, cta: 'Train anyway' }
          : { eyebrow: 'SUGGESTED', title: suggestion.title, detail: suggestion.reason, cta: 'Start a workout' };

  const onPrimary = () => {
    if (active) return router.push('/workout/active');
    if (planDay) {
      const id = startProgramSession(profile.experience);
      if (id) return router.push('/workout/active');
    }
    if (suggestion.kind === 'routine' && suggestion.routineId) {
      startRoutine(suggestion.routineId, profile.experience);
      return router.push('/workout/active');
    }
    return startBlank();
  };

  return (
    <Screen gradient>
      <Masthead
        eyebrow="Session"
        title="Train"
        accent={domainAccent.training}
        right={
          <IconButton accessibilityLabel="Search lifts and screens" onPress={() => router.push('/search')}>
            <Icon name="search" size={20} color={colors.text} />
          </IconButton>
        }
      />

      <Card
        elevation="floating"
        onPress={onPrimary}
        accent={active ? colors.success : colors.primary}
        style={{ gap: spacing.md }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            {active ? <Pill label="IN PROGRESS" filled /> : (
              <Text variant="overline" color={colors.primary}>{primary.eyebrow}</Text>
            )}
            <Text variant="h2" numberOfLines={2}>{primary.title}</Text>
            <Text variant="caption" color={colors.textDim}>{primary.detail}</Text>
          </View>
          <View style={styles.playDisc}>
            <Icon name={active ? 'timer' : 'dumbbell'} size={22} color={colors.onPrimary} strokeWidth={2} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text variant="label" color={colors.primary}>{primary.cta}</Text>
          <Icon name="chevron_right" size={15} color={colors.primary} strokeWidth={2.4} />
        </View>
      </Card>

      {/* The other two ways in, deliberately smaller than the one above. */}
      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
        <StartCard icon="bolt" title="AI Generate" subtitle="From your goal" onPress={() => router.push('/workout/generate')} />
        <StartCard
          icon="list"
          title="Routines"
          subtitle={routines.length ? `${routines.length} saved` : 'Build a template'}
          onPress={() => router.push('/workout/routines')}
        />
      </View>

      <SectionHeader title="Everything else" accent={domainAccent.training} />
      {/* Ten destinations that used to be ten full-width tiles, which gave a
          tape measure the same weight as starting a session. */}
      <Well padded={false}>
        <View style={styles.grid}>
          {[
            { icon: 'search' as IconName, label: 'Exercises', href: '/workout/library' },
            { icon: 'clock' as IconName, label: 'History', href: '/workout/history' },
            { icon: 'trophy' as IconName, label: 'Records', href: '/workout/records', tint: colors.amber },
            {
              icon: 'calendar' as IconName,
              label: enrolment ? 'Your plan' : 'Plans',
              href: enrolment ? '/workout/program' : '/workout/programs',
            },
            { icon: 'sliders' as IconName, label: 'Plate math', href: '/tools/plates' },
            // A bar chart said nothing about warming up; a flame does.
            { icon: 'flame' as IconName, label: 'Warm-up', href: '/tools/warmup', tint: colors.amber },
            { icon: 'timer' as IconName, label: 'Intervals', href: '/tools/interval' },
            { icon: 'target' as IconName, label: 'Rep max', href: '/tools/one-rep-max' },
            { icon: 'scale' as IconName, label: 'Measure', href: '/progress/measurements' },
            {
              icon: 'map' as IconName,
              label: 'Iron Map',
              href: '/gyms',
              badge: claimedGyms > 0 ? String(claimedGyms) : undefined,
              tint: domainAccent.gyms,
            },
            // Not another trophy: a trophy here meant a personal record three
            // tiles earlier, and the same glyph twice in one grid means neither.
            { icon: 'rivals' as IconName, label: 'Rivals', href: '/leaderboard', tint: colors.lime },
          ].map((t) => (
            <Pressable
              key={t.label}
              onPress={() => router.push(t.href as never)}
              accessibilityRole="link"
              accessibilityLabel={t.label}
              style={styles.tool}
            >
              <View style={styles.toolIcon}>
                <Icon name={t.icon} size={18} color={t.tint ?? colors.textDim} strokeWidth={1.8} />
                {t.badge && (
                  <View style={styles.badge}>
                    <Text variant="caption" color={colors.bg} style={{ fontSize: 9, lineHeight: 12 }}>
                      {t.badge}
                    </Text>
                  </View>
                )}
              </View>
              <Text variant="caption" color={colors.textDim} numberOfLines={1}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      </Well>

      <SectionHeader
        title="Recent workouts"
        accent={domainAccent.training}
        action={allCompleted.length ? 'See all' : undefined}
        onAction={() => router.push('/workout/history')}
      />
      {/* The empty state carries no action: the primary card above is already
          the same tap, and two calls to action on one screen read as indecision. */}
      {completed.length === 0 ? (
        <EmptyState
          icon="dumbbell"
          title="No workouts yet"
          subtitle="Start your first session and your coach starts tracking."
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          <Stagger step={45}>
            {completed.map((wk) => {
              const stats = workoutStats(wk, bodyweightKg);
              const vol = displayVolume(stats.totalVolumeKg, units);
              return (
                <Card key={wk.id} onPress={() => router.push(`/workout/${wk.id}`)}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="bodyStrong" numberOfLines={1}>{wk.name}</Text>
                      <Text variant="caption" color={colors.textDim}>
                        {formatDayMonth(wk.completedAt ?? wk.date)} · {formatDurationShort(wk.durationSeconds ?? 0)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text variant="bodyStrong" color={colors.primary}>
                        {vol.value} {vol.unit}
                      </Text>
                      <Text variant="caption" color={colors.textDim}>
                        {stats.totalSets} sets · {stats.totalReps} reps
                      </Text>
                    </View>
                  </View>
                </Card>
              );
            })}
          </Stagger>
        </View>
      )}
    </Screen>
  );
}

function StartCard({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Card onPress={onPress} elevation="raised" style={{ flex: 1, gap: spacing.sm }}>
      <Icon name={icon} size={20} color={colors.text} strokeWidth={1.9} />
      <View>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" color={colors.textDim} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </Card>
  );
}

const styles = {
  playDisc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  grid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    paddingVertical: spacing.sm,
  },
  tool: {
    width: '25%' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingVertical: spacing.md,
    paddingHorizontal: 2,
  },
  toolIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  badge: {
    position: 'absolute' as const,
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: domainAccent.gyms,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
};

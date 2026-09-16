import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Pressable, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { AdSlot, Card, IconButton, Screen, SectionHeader, Text } from '../../src/components/ui';
import { AnimatedNumber, AnimatedProgressRing, FadeIn } from '../../src/components/anim';
import { Icon } from '../../src/components/Icon';
import { CoachCard } from '../../src/components/CoachCard';
import { WeekStrip, type WeekDay } from '../../src/components/WeekStrip';
import { colors, gradients, spacing } from '../../src/theme';
import { addDaysISO, formatSleep, lastNDays, timeOfDay, todayISO, weekdayIndex } from '../../src/domain/date';
import { displayVolume } from '../../src/domain/units';
import { workoutStats } from '../../src/domain/strength';
import { suggestToday } from '../../src/domain/suggestion';
import { exerciseById } from '../../src/data/exercises';
import { useRoutineStore } from '../../src/stores/useRoutineStore';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { useLogStore } from '../../src/stores/useLogStore';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';
import { useGamificationStore } from '../../src/stores/useGamificationStore';
import { buildCoachContext, useDailySummary } from '../../src/stores/useDailySummary';
import { ai } from '../../src/services/ai';
import { analytics } from '../../src/services/analytics';
import type { CoachMessageResult } from '../../src/services/ai/types';
import { useProgramStore } from '../../src/stores/useProgramStore';
import { programById } from '../../src/data/programs';
import { waterQuickAdds } from '../../src/domain/nutrition';

const GREETING: Record<ReturnType<typeof timeOfDay>, string> = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
  night: 'Still up',
};

export default function Home() {
  const profile = useProfileStore((s) => s.profile);
  const coachSettings = useProfileStore((s) => s.effectiveCoach());
  const summary = useDailySummary();
  const streak = useGamificationStore((s) => s.streaks.daily);
  const addWater = useLogStore((s) => s.addWater);
  // The largest configured amount: the quick action is for the common case of
  // finishing a bottle, not for sipping.
  const waterAdd = waterQuickAdds(profile.waterQuickAddOz).slice(-1)[0] ?? 16;
  const completed = useWorkoutStore((s) => s.completedWorkouts());
  const routines = useRoutineStore((s) => s.routines);
  const startRoutine = useRoutineStore((s) => s.start);

  const today = todayISO();
  // Sunday-anchored, to match the calendar on Progress and the strip's letters.
  const weekDates = useMemo(() => {
    const offset = weekdayIndex(today);
    return lastNDays(7, addDaysISO(today, 6 - offset));
  }, [today]);

  const weekDays: WeekDay[] = useMemo(() => {
    const trained = new Set(completed.map((w) => w.date));
    return weekDates.map((date) => ({
      date,
      trained: trained.has(date),
      isToday: date === today,
      isFuture: date > today,
    }));
  }, [weekDates, completed, today]);

  const programPos = useProgramStore((s) => s.position());
  const enrolment = useProgramStore((s) => s.enrolment);
  const startProgramSession = useProgramStore((s) => s.startNextSession);
  const enrolledProgram = enrolment ? programById(enrolment.programId) : null;

  // Null unless a plan is running and has a session waiting.
  const planSuggestion =
    enrolledProgram && programPos && !programPos.finished && programPos.day
      ? {
          title: programPos.day.name,
          reason: `${enrolledProgram.name} · week ${programPos.week} of ${enrolledProgram.weeks} · ${programPos.day.exercises.length} exercises`,
        }
      : null;

  const suggestion = useMemo(
    () =>
      suggestToday({
        workouts: completed,
        today,
        weekDates,
        trainingDaysPerWeek: profile.trainingDaysPerWeek,
        routines: routines.map((r) => ({
          id: r.id,
          name: r.name,
          // Routines store only the primary muscle per exercise; pull the
          // secondaries from the library so a push day counts as triceps work.
          muscles: r.exercises.flatMap((e) => [e.primaryMuscle, ...(exerciseById(e.exerciseId)?.secondaryMuscles ?? [])]),
        })),
      }),
    [completed, today, weekDates, profile.trainingDaysPerWeek, routines],
  );

  const [coachMsg, setCoachMsg] = useState<CoachMessageResult | null>(null);
  const [coachLoading, setCoachLoading] = useState(true);

  const loadCoach = useCallback(async () => {
    setCoachLoading(true);
    try {
      const ctx = buildCoachContext(summary);
      const msg = await ai.coachMessage({ context: ctx, settings: coachSettings });
      setCoachMsg(msg);
      analytics.track('coach_message_viewed', { personality: coachSettings.personality });
    } finally {
      setCoachLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.discipline.score, coachSettings.personality, coachSettings.aggression, coachSettings.enabled]);

  useEffect(() => {
    loadCoach();
  }, [loadCoach]);

  // Finalize today's outcome into streaks + achievements (idempotent per day).
  useEffect(() => {
    const g = useGamificationStore.getState();
    const proteinHit = summary.proteinG >= summary.proteinTarget * 0.9;
    const nutritionHit = summary.calories > 0 && Math.abs(summary.calories - summary.caloriesTarget) <= summary.caloriesTarget * 0.15;
    const hydrationHit = summary.waterOz >= summary.waterTarget * 0.9;
    g.recordDay({
      date: summary.date,
      workoutDone: summary.workoutCompleted,
      proteinHit,
      nutritionHit,
      hydrationHit,
      dayComplete: summary.discipline.score >= 80,
      // Rest days are the ones the week's target does not call for. Hitting
      // four of four planned sessions should not read as a broken streak on
      // the three days off.
      restDay: !summary.workoutPlanned,
    });
    g.noteDisciplineScore(summary.discipline.score);
    const streaks = useGamificationStore.getState().streaks;
    g.syncAchievements({
      workoutsCompleted: useWorkoutStore.getState().completedWorkouts().length,
      currentDailyStreak: streaks.daily,
      proteinStreak: streaks.protein,
      hydrationStreak: streaks.hydration,
      prsSet: Object.keys(useWorkoutStore.getState().prs).length,
      progressPhotos: useLogStore.getState().photos.length,
      bestDisciplineScore: useGamificationStore.getState().bestDisciplineScore,
    });
  }, [summary.date, summary.discipline.score, summary.workoutCompleted, summary.proteinG, summary.caloriesTarget, summary.calories, summary.waterOz, summary.proteinTarget, summary.waterTarget, summary.workoutPlanned]);

  const w = summary.workoutCompleted;

  // Today's session detail for the workout card.
  const todayWorkout = useWorkoutStore((st) => st.workouts.find((x) => x.date === summary.date));
  const todayStats = todayWorkout ? workoutStats(todayWorkout, profile.weightKg ?? null) : null;
  const todayVol = todayStats ? displayVolume(todayStats.totalVolumeKg, profile.units) : null;

  return (
    <Screen
      gradient
      refreshControl={<RefreshControl refreshing={false} onRefresh={loadCoach} tintColor={colors.primary} />}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
        <View>
          <Text variant="caption" color={colors.textDim}>
            {GREETING[timeOfDay()]}
          </Text>
          <Text variant="h1">{profile.name || 'Athlete'}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
          <StreakBadge count={streak} />
          <IconButton accessibilityLabel="Reminders" onPress={() => router.push('/reminders')}>
            <Icon name="bell" size={22} color={colors.text} />
          </IconButton>
        </View>
      </View>

      {/* Coach */}
      <FadeIn delay={40}>
        <CoachCard message={coachMsg} personality={coachSettings.personality} loading={coachLoading} onPress={() => router.push('/coach')} />
      </FadeIn>

      {/* Discipline + Workout */}
      <FadeIn delay={120} style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
        <Card style={{ flex: 1, alignItems: 'center', gap: spacing.sm }}>
          <AnimatedProgressRing progress={summary.discipline.score / 100} size={120} stroke={12} gradientColors={gradients.discipline}>
            <View style={{ alignItems: 'center' }}>
              <AnimatedNumber value={summary.discipline.score} variant="metricLg" />
              <Text variant="caption" color={colors.textDim}>
                DISCIPLINE
              </Text>
            </View>
          </AnimatedProgressRing>
          <Text variant="caption" color={colors.textDim} center>
            {disciplineWord(summary.discipline.score)}
          </Text>
        </Card>

        <Card
          style={{ flex: 1, justifyContent: 'space-between' }}
          onPress={() => {
            // An enrolled plan already answers "what today is for", so it wins
            // over a gap-based guess.
            if (planSuggestion) {
              const id = startProgramSession(profile.experience);
              if (id) router.push('/workout/active');
              return;
            }
            if (suggestion.kind === 'routine' && suggestion.routineId) {
              startRoutine(suggestion.routineId, profile.experience);
              router.push('/workout/active');
            } else {
              router.push('/(tabs)/workout');
            }
          }}
        >
          <View style={{ gap: 4 }}>
            <Text variant="overline" color={colors.textDim}>
              {summary.workoutName ? "TODAY'S WORKOUT" : planSuggestion ? 'YOUR PLAN' : 'SUGGESTED'}
            </Text>
            <Text variant="h3" numberOfLines={2}>
              {summary.workoutName ?? planSuggestion?.title ?? suggestion.title}
            </Text>
          </View>
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            {todayStats && todayStats.totalSets > 0 ? (
              <View style={{ gap: 2 }}>
                <Text variant="caption" color={colors.textDim}>
                  {todayWorkout!.exercises.length} exercises · {todayStats.totalSets} sets
                </Text>
                <Text variant="bodyStrong" color={colors.primary}>
                  {todayVol!.value} {todayVol!.unit} volume
                </Text>
              </View>
            ) : (
              <Text variant="caption" color={colors.textDim}>
                {planSuggestion?.reason ?? suggestion.reason}
              </Text>
            )}
            {/* The card is tappable, so say where it goes rather than only
                stating that nothing is planned. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Icon
                name={w ? 'check' : suggestion.kind === 'rest' ? 'moon' : 'dumbbell'}
                size={18}
                color={w ? colors.success : suggestion.kind === 'rest' ? colors.sleep : colors.primary}
              />
              <Text
                variant="label"
                color={w ? colors.success : suggestion.kind === 'rest' ? colors.sleep : colors.primary}
              >
                {w
                  ? 'Completed'
                  : planSuggestion
                    ? 'Start this session ›'
                  : suggestion.kind === 'routine'
                    ? 'Start this routine ›'
                    : suggestion.kind === 'rest'
                      ? 'Train anyway ›'
                      : 'Start a workout ›'}
              </Text>
            </View>
          </View>
        </Card>
      </FadeIn>

      <FadeIn delay={80}>
        <Card style={{ marginTop: spacing.md }}>
          <WeekStrip days={weekDays} target={profile.trainingDaysPerWeek} onPress={() => router.push('/(tabs)/progress')} />
        </Card>
      </FadeIn>

      {/* Metrics */}
      <SectionHeader title="Today" />
      <Card>
        <MetricRow
          icon="flame"
          color={colors.calorie}
          label="Calories"
          value={`${summary.calories}`}
          target={`${summary.caloriesTarget}`}
          progress={summary.calories / summary.caloriesTarget}
        />
        <MetricRow
          icon="bolt"
          color={colors.protein}
          label="Protein"
          value={`${Math.round(summary.proteinG)}g`}
          target={`${summary.proteinTarget}g`}
          progress={summary.proteinG / summary.proteinTarget}
        />
        <MetricRow
          icon="water"
          color={colors.water}
          label="Water"
          value={`${Math.round(summary.waterOz)} oz`}
          target={`${summary.waterTarget} oz`}
          progress={summary.waterOz / summary.waterTarget}
        />
        <MetricRow
          icon="steps"
          color={colors.steps}
          label="Steps"
          value={summary.steps.toLocaleString()}
          target={summary.stepsTarget.toLocaleString()}
          progress={summary.steps / summary.stepsTarget}
          onPress={() => router.push('/log?focus=steps')}
        />
        <MetricRow
          icon="moon"
          color={colors.sleep}
          label="Sleep"
          value={summary.sleepMinutes ? formatSleep(summary.sleepMinutes) : '—'}
          target={formatSleep(summary.sleepTarget)}
          progress={summary.sleepMinutes / summary.sleepTarget}
          onPress={() => router.push('/log?focus=sleep')}
          last
        />
      </Card>

      {/* Quick actions */}
      <SectionHeader title="Quick add" />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <QuickAction icon="dumbbell" tint={colors.primary} label="Workout" onPress={() => router.push('/(tabs)/workout')} />
        <QuickAction icon="nutrition" tint={colors.calorie} label="Food" onPress={() => router.push('/nutrition/add')} />
        {/* The athlete's own bottle size, not a hardcoded 16oz. */}
        <QuickAction
          icon="water"
          tint={colors.water}
          label={`+${waterAdd} oz`}
          onPress={() => addWater(waterAdd)}
        />
        <QuickAction
          icon="steps"
          tint={colors.steps}
          label="Steps"
          onPress={() => router.push({ pathname: '/log', params: { focus: 'steps' } })}
        />
        <QuickAction
          icon="scale"
          tint={colors.protein}
          label="Weigh in"
          onPress={() => router.push({ pathname: '/log', params: { focus: 'weight' } })}
        />
      </View>

      <View style={{ marginTop: spacing.lg }}>
        <AdSlot placement="home_feed" />
      </View>
    </Screen>
  );
}

function StreakBadge({ count }: { count: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,90,31,0.12)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}>
      <Icon name="flame" size={16} color={colors.primary} />
      <Text variant="bodyStrong" color={colors.primary}>
        {count}
      </Text>
    </View>
  );
}

function MetricRow({
  icon,
  color,
  label,
  value,
  target,
  progress,
  last,
  onPress,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  color: string;
  label: string;
  value: string;
  target: string;
  progress: number;
  last?: boolean;
  onPress?: () => void;
}) {
  const pct = Math.max(0, Math.min(1, isFinite(progress) ? progress : 0));
  const fill = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const a = Animated.timing(fill, { toValue: pct, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [pct, fill]);
  const widthPct = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        { paddingVertical: spacing.md, borderBottomWidth: last ? 0 : 0.5, borderBottomColor: colors.border },
        pressed && { opacity: 0.6 },
      ]}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Icon name={icon} size={18} color={color} />
          <Text variant="bodyStrong">{label}</Text>
        </View>
        <Text variant="label" color={colors.textDim}>
          <Text variant="bodyStrong" color={colors.text}>
            {value}
          </Text>{' '}
          / {target}
        </Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: 'hidden' }}>
        <Animated.View style={{ width: widthPct, height: '100%', backgroundColor: color, borderRadius: 3 }} />
      </View>
    </Pressable>
  );
}

function QuickAction({
  icon,
  label,
  tint,
  onPress,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  tint: string;
  onPress: () => void;
}) {
  return (
    <Card style={{ flex: 1, alignItems: 'center', gap: 6 }} padded={false} onPress={onPress}>
      <View style={{ alignItems: 'center', gap: 6, paddingVertical: spacing.md, paddingHorizontal: 4 }}>
        <Icon name={icon} size={21} color={tint} strokeWidth={1.9} />
        <Text variant="caption" numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Card>
  );
}

const disciplineWord = (s: number) => (s >= 90 ? 'Elite day' : s >= 75 ? 'Strong' : s >= 50 ? 'Keep pushing' : s > 0 ? "Let's move" : 'Log your day');

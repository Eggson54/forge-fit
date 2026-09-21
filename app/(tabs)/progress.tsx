import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { BarChart, Card, Chip, DayStrip, LineChart, ListRow, Screen, SectionHeader, StatTile, Text, type Point } from '../../src/components/ui';
import { FadeIn, Shimmer } from '../../src/components/anim';
import { BodyMap } from '../../src/components/BodyMap';
import { Masthead } from '../../src/components/Masthead';
import { LoadReadingCard } from '../../src/components/LoadReadingCard';
import { TrainingCalendar } from '../../src/components/TrainingCalendar';
import { Icon } from '../../src/components/Icon';
import { colors, domainAccent, spacing } from '../../src/theme';
import { addDaysISO, lastNDays, todayISO } from '../../src/domain/date';
import { VOLUME_LANDMARKS, volumeStatus, weeklySetsPerMuscle } from '../../src/domain/volume';
import { daysElapsedInWeek, readLoad, weeklyVolumeSeries } from '../../src/domain/volumeTrend';
import type { MuscleGroup } from '../../src/domain/types';
import { displayWeight, kgToLb } from '../../src/domain/units';
import { epley1RM } from '../../src/domain/strength';
import { movingAverage } from '../../src/domain/trend';
import { useLogStore } from '../../src/stores/useLogStore';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';
import { useGamificationStore } from '../../src/stores/useGamificationStore';
import { ai } from '../../src/services/ai';
import type { ProgressAnalysisResult } from '../../src/services/ai/types';
import { cardioInWeek, totalCardio } from '../../src/domain/cardio';

export default function Progress() {
  const { width } = useWindowDimensions();
  const chartW = width - spacing.xl * 2 - spacing.lg * 2;

  const profile = useProfileStore((s) => s.profile);
  const weightLogs = useLogStore((s) => s.weight);
  const workouts = useWorkoutStore((s) => s.completedWorkouts());
  const streaks = useGamificationStore((s) => s.streaks);

  // Sorted by date rather than insertion order: persisted logs can come back in
  // either direction after a rehydrate, and oldest/newest drive the delta below.
  const weightByDate = useMemo(
    () => [...weightLogs].sort((a, b) => (a.date < b.date ? -1 : 1)),
    [weightLogs],
  );

  // Weight series (chronological), with the same 7-day average the weight
  // screen draws — a raw scale line reads as chaos at this size.
  const weightWindow = useMemo(() => weightByDate.slice(-14), [weightByDate]);
  const toDisplayKg = (kg: number) => (profile.units === 'imperial' ? Math.round(kgToLb(kg) * 10) / 10 : Math.round(kg * 10) / 10);
  const weightSeries: Point[] = useMemo(
    () => weightWindow.map((w) => ({ label: w.date.slice(5), value: toDisplayKg(w.weightKg) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weightWindow, profile.units],
  );
  const weightAverage: Point[] = useMemo(
    () =>
      movingAverage(weightWindow.map((w) => ({ date: w.date, value: w.weightKg })), 7).map((p) => ({
        label: p.date.slice(5),
        value: toDisplayKg(p.value),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weightWindow, profile.units],
  );

  /**
   * Strength per lift. Plotting the best e1RM of each SESSION compared a
   * deadlift day against an arm day, so the line sawtoothed between exercises
   * and said nothing about whether the athlete was getting stronger. Each lift
   * gets its own series and the chart shows one at a time.
   */
  const byExercise = useMemo(() => {
    const map = new Map<string, { name: string; points: Point[] }>();
    for (const w of [...workouts].sort((a, b) => (a.date < b.date ? -1 : 1))) {
      for (const ex of w.exercises) {
        let best = 0;
        for (const set of ex.sets) {
          if (set.completed && set.weightKg && set.reps) best = Math.max(best, epley1RM(set.weightKg, set.reps));
        }
        if (best <= 0) continue;
        const entry = map.get(ex.exerciseId) ?? { name: ex.name, points: [] };
        entry.points.push({
          label: w.date.slice(5),
          value: profile.units === 'imperial' ? Math.round(kgToLb(best)) : Math.round(best),
        });
        map.set(ex.exerciseId, entry);
      }
    }
    // Most-logged first, so the default pick is the lift the user actually tracks.
    return [...map.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.points.length - a.points.length)
      .slice(0, 5);
  }, [workouts, profile.units]);

  const [liftId, setLiftId] = useState<string | null>(null);
  const activeLift = byExercise.find((e) => e.id === liftId) ?? byExercise[0] ?? null;

  // Weekly workout consistency (last 8 weeks)
  const weeklyConsistency: Point[] = useMemo(() => {
    const weeks: Point[] = [];
    for (let i = 7; i >= 0; i--) {
      const end = new Date();
      end.setDate(end.getDate() - i * 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      const count = workouts.filter((w) => {
        const d = new Date(`${w.date}T00:00:00`);
        return d >= start && d <= end;
      }).length;
      weeks.push({ label: `${start.getMonth() + 1}/${start.getDate()}`, value: count });
    }
    return weeks;
  }, [workouts]);

  // Nutrition consistency: days in last 7 with logged calories
  const nutritionDays = useLogStore((s) => {
    const days = lastNDays(7);
    return days.map((d) => ({ label: d.slice(5), value: s.macrosForDate(d).calories > 0 ? 1 : 0 }));
  });
  const nutritionHitCount = nutritionDays.filter((d) => d.value === 1).length;
  const cardioSessions = useLogStore((s) => s.cardio);
  const cardioWeek = useMemo(() => totalCardio(cardioInWeek(cardioSessions, lastNDays(7))), [cardioSessions]);

  // Weekly training volume per muscle (last 7 days) for the body map.
  const weekVolume = useMemo(() => {
    const since = addDaysISO(todayISO(), -6);
    return weeklySetsPerMuscle(workouts.filter((w) => w.date >= since));
  }, [workouts]);
  const trackedMuscles = (Object.keys(VOLUME_LANDMARKS) as MuscleGroup[])
    .map((m) => ({ m, sets: weekVolume[m] ?? 0, status: volumeStatus(m, weekVolume[m] ?? 0) }))
    .sort((a, b) => b.sets - a.sets);

  // Working sets per week, and what that trend is saying.
  const loadSeries = useMemo(() => weeklyVolumeSeries(workouts, todayISO(), 8), [workouts]);
  const loadReading = useMemo(() => readLoad(loadSeries, daysElapsedInWeek(todayISO())), [loadSeries]);

  const latest = weightByDate[weightByDate.length - 1]?.weightKg ?? profile.weightKg ?? null;
  const startWeight = weightByDate[0]?.weightKg ?? latest;
  const change = latest != null && startWeight != null ? latest - startWeight : 0;
  const changeDisp = displayWeight(Math.abs(change), profile.units);
  // "+0" implies a measured result; with fewer than two weigh-ins there is none.
  const hasWeightTrend = weightByDate.length >= 2;

  const [analysis, setAnalysis] = useState<ProgressAnalysisResult | null>(null);
  const analysisPending = weightByDate.length >= 2 && !analysis;
  useEffect(() => {
    if (weightByDate.length < 2) return;
    ai.analyzeProgress({
      weightSeriesKg: weightByDate.map((w) => ({ date: w.date, value: w.weightKg })),
      goal: profile.goal,
      targetWeightKg: profile.targetWeightKg,
      units: profile.units,
    }).then(setAnalysis);
  }, [weightByDate, profile.goal, profile.targetWeightKg, profile.units]);

  return (
    <Screen gradient>
      <Masthead
        eyebrow="Where you are"
        title="Progress"
        accent={domainAccent.progress}
        right={
          <Pressable
            onPress={() => router.push('/progress/year')}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel="Your training year"
          >
            <Text variant="label" color={domainAccent.progress}>Year ›</Text>
          </Pressable>
        }
      />

      {/* Snapshot */}
      <Card style={{ flexDirection: 'row', marginBottom: spacing.md }}>
        <StatTile value={`${workouts.length}`} label="Workouts" accent={colors.primary} />
        <StatTile value={`${streaks.daily}`} label="Day streak" accent={colors.amber} />
        <StatTile
          value={hasWeightTrend ? `${change >= 0 ? '+' : '-'}${changeDisp.value}` : '—'}
          label={`Weight (${changeDisp.unit})`}
          accent={colors.protein}
        />
        <StatTile value={`${nutritionHitCount}/7`} label="Logged" accent={colors.water} />
        {/* Conditioning is the one column of the week the rest of this screen
            says nothing about. */}
        <StatTile value={`${Math.round(cardioWeek.minutes)}`} label="Cardio min" accent={colors.steps} />
      </Card>

      {/* Reserve the card while the analysis loads instead of popping it in and
          shoving the charts down the page. */}
      {(analysis || analysisPending) && (
        <Card tone="alt" style={{ marginBottom: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginBottom: 4 }}>
            <Icon name="bolt" size={16} color={colors.primary} />
            <Text variant="overline" color={colors.primary}>
              AI ANALYSIS{analysis ? ` · ${analysis.onTrack ? 'ON TRACK' : 'ADJUST'}` : ''}
            </Text>
          </View>
          {analysis ? (
            <Text variant="body">{analysis.summary}</Text>
          ) : (
            <View style={{ gap: 8, paddingVertical: 2 }}>
              <Shimmer height={14} radius={5} />
              <Shimmer height={14} radius={5} width="70%" />
            </View>
          )}
        </Card>
      )}

      <SectionHeader title="Training calendar" action="History" onAction={() => router.push('/workout/history')} />
      <FadeIn>
        <Card>
          <TrainingCalendar workouts={workouts} units={profile.units} />
        </Card>
      </FadeIn>

      <SectionHeader title="Body Map · weekly volume" />
      <FadeIn>
        <Card>
          <BodyMap volume={weekVolume} />
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {trackedMuscles.slice(0, 6).map(({ m, sets, status }) => {
              const lm = VOLUME_LANDMARKS[m]!;
              const barColor = status === 'optimal' ? colors.success : status === 'high' ? colors.warning : status === 'low' ? colors.primary : colors.surfaceHigh;
              return (
                <View key={m}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                    <Text variant="caption" style={{ textTransform: 'capitalize' }}>{m.replace('_', ' ')}</Text>
                    <Text variant="caption" color={colors.textDim}>{sets} / {lm.min}-{lm.max} sets</Text>
                  </View>
                  <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: 'hidden' }}>
                    <View style={{ width: `${Math.min(100, (sets / lm.max) * 100)}%`, height: '100%', backgroundColor: barColor, borderRadius: 3 }} />
                  </View>
                </View>
              );
            })}
          </View>
          <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
            Working sets per muscle this week vs. general hypertrophy ranges. Not medical advice.
          </Text>
        </Card>
      </FadeIn>

      <SectionHeader title="Weight" action="Log" onAction={() => router.push('/progress/weight')} />
      <Card>
        <LineChart
          data={weightSeries}
          overlay={weightAverage}
          overlayColor={colors.protein}
          color={colors.textDim}
          width={chartW}
          unit={profile.units === 'imperial' ? ' lb' : ' kg'}
        />
        <Text variant="caption" color={colors.textFaint} center style={{ marginTop: spacing.sm }}>
          Solid line is the 7-day average.
        </Text>
      </Card>

      <SectionHeader title="Strength · estimated 1RM" />
      <Card>
        {byExercise.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: spacing.md, marginHorizontal: -spacing.lg }}
            contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
          >
            {byExercise.map((e) => (
              <Chip key={e.id} label={e.name} selected={activeLift?.id === e.id} onPress={() => setLiftId(e.id)} />
            ))}
          </ScrollView>
        )}
        <LineChart
          data={activeLift?.points ?? []}
          width={chartW}
          color={colors.primary}
          unit={profile.units === 'imperial' ? ' lb' : ' kg'}
        />
      </Card>

      <SectionHeader title="Training load (8 weeks)" />
      <LoadReadingCard series={loadSeries} reading={loadReading} width={chartW} />

      <SectionHeader title="Workout consistency (8 weeks)" />
      <Card>
        <BarChart data={weeklyConsistency} width={chartW} color={colors.steps} targetLine={profile.trainingDaysPerWeek} />
        <Text variant="caption" color={colors.textFaint} center style={{ marginTop: spacing.sm }}>
          Dashed line = your weekly goal ({profile.trainingDaysPerWeek}/wk)
        </Text>
      </Card>

      <SectionHeader
        title={`Nutrition consistency · ${nutritionHitCount}/7 days`}
        action="Sleep & steps"
        onAction={() => router.push('/progress/habits')}
      />
      <Card>
        <DayStrip days={nutritionDays.map((d) => ({ label: d.label.slice(3), on: d.value === 1 }))} color={colors.water} />
      </Card>

      <SectionHeader title="More" />
      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        <ListRow icon="chart" tint={colors.lime} title="Today's Scores" subtitle="Recovery, strain, sleep, nutrition" onPress={() => router.push('/scores')} />
        <ListRow icon="shield" tint={colors.info} title="Health Monitor" onPress={() => router.push('/health')} />
        <ListRow icon="levels" tint={colors.success} title="Fitness Age" subtitle="Your markers, expressed in years" onPress={() => router.push('/bio-age')} />
        <ListRow icon="document" tint={colors.danger} title="Blood Results" subtitle="Your panels, against your own lab's ranges" onPress={() => router.push('/bloodwork')} />
        <ListRow icon="document" tint={colors.sleep} title="Journal" subtitle="Habits, and what they go with" onPress={() => router.push('/journal')} />
        <ListRow icon="steps" tint={colors.steps} title="Conditioning" onPress={() => router.push('/progress/cardio')} />
        <ListRow icon="camera" tint={colors.fat} title="Progress Photos" onPress={() => router.push('/progress/photos')} />
        <ListRow icon="scale" tint={colors.water} title="Body Measurements" onPress={() => router.push('/progress/measurements')} />
        <ListRow icon="chart" tint={colors.protein} title="Body Composition" onPress={() => router.push('/progress/body-fat')} />
        <ListRow icon="trophy" tint={colors.amber} title="Personal Records" onPress={() => router.push('/workout/records')} />
        <ListRow icon="shield" tint={colors.lime} title="Achievements & Streaks" onPress={() => router.push('/achievements')} />
        <ListRow icon="bolt" tint={colors.primary} title="Weekly AI Review" onPress={() => router.push('/weekly-review')} />
      </Card>
    </Screen>
  );
}


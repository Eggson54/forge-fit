import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, LinearProgress, Screen, SectionHeader, Text } from '../src/components/ui';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { FadeIn } from '../src/components/anim';
import { Icon, type IconName } from '../src/components/Icon';
import { colors, radius, spacing } from '../src/theme';
import { achievementProgress, nextAchievements, type AchievementInputs } from '../src/domain/achievements';
import { formatDateLong } from '../src/domain/date';
import type { Achievement } from '../src/domain/types';
import { useGamificationStore } from '../src/stores/useGamificationStore';
import { useLogStore } from '../src/stores/useLogStore';
import { useGymStore } from '../src/stores/useGymStore';
import { currentAchievementInputs } from '../src/stores/achievementInputs';
import { useWorkoutStore } from '../src/stores/useWorkoutStore';

export default function Achievements() {
  const achievements = useGamificationStore((s) => s.achievements);
  const streaks = useGamificationStore((s) => s.streaks);
  const bestDisciplineScore = useGamificationStore((s) => s.bestDisciplineScore);
  const workoutsCompleted = useWorkoutStore((s) => s.completedWorkouts().length);
  const prsSet = useWorkoutStore((s) => Object.keys(s.prs).length);
  const progressPhotos = useLogStore((s) => s.photos.length);

  // Read from one place rather than re-listing the metrics here — a second
  // copy of this list is a second chance for it to drift.
  const claims = useGymStore((st) => st.claims);
  const inputs: AchievementInputs = useMemo(
    () => currentAchievementInputs(),
    // Every field is read fresh inside; these are the stores that move it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workoutsCompleted, streaks.daily, streaks.protein, streaks.hydration, prsSet, progressPhotos, bestDisciplineScore, claims],
  );


  // One glyph per streak: five identical flames in different colours read as a
  // rendering mistake rather than five different habits.
  const streakItems: { label: string; value: number; color: string; icon: IconName }[] = [
    { label: 'Daily', value: streaks.daily, color: colors.primary, icon: 'flame' },
    { label: 'Workout', value: streaks.workout, color: colors.lime, icon: 'dumbbell' },
    { label: 'Protein', value: streaks.protein, color: colors.protein, icon: 'bolt' },
    { label: 'Nutrition', value: streaks.nutrition, color: colors.carbs, icon: 'nutrition' },
    { label: 'Hydration', value: streaks.hydration, color: colors.water, icon: 'water' },
  ];

  const unlocked = achievements.filter((a) => a.unlockedAt).length;
  const nearest = useMemo(() => nextAchievements(achievements, inputs, 1)[0], [achievements, inputs]);

  // Unlocked first, then the locked ones ordered by how close they are — a
  // grid that leads with "Log 100 workouts" at 10% tells you nothing.
  const ordered = useMemo(() => {
    const done = achievements.filter((a) => a.unlockedAt);
    const todo = achievements
      .filter((a) => !a.unlockedAt)
      .sort((x, y) => achievementProgress(y, inputs).ratio - achievementProgress(x, inputs).ratio);
    return [...done, ...todo];
  }, [achievements, inputs]);

  return (
    <Screen gradient>
      <ScreenHeader title="Achievements" />

      {nearest && (
        <FadeIn>
          <Card tone="alt" style={{ marginBottom: spacing.md }}>
            <Text variant="overline" color={colors.primary} style={{ marginBottom: spacing.sm }}>
              Closest badge
            </Text>
            <NextUp achievement={nearest} inputs={inputs} />
          </Card>
        </FadeIn>
      )}

      <SectionHeader title="Streaks" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {streakItems.map((s) => (
          <Card key={s.label} style={{ width: '31%', alignItems: 'center', gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name={s.icon} size={18} color={s.color} />
              <Text variant="metric" color={s.color}>
                {s.value}
              </Text>
            </View>
            <Text variant="caption" color={colors.textDim}>
              {s.label}
            </Text>
          </Card>
        ))}
      </View>

      <SectionHeader title={`Badges · ${unlocked}/${achievements.length}`} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {ordered.map((a) => (
          <BadgeCard key={a.id} achievement={a} inputs={inputs} />
        ))}
      </View>
    </Screen>
  );
}

function NextUp({ achievement, inputs }: { achievement: Achievement; inputs: AchievementInputs }) {
  const p = achievementProgress(achievement, inputs);
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
      <Medallion achievement={achievement} unlocked={false} size={46} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong">{achievement.title}</Text>
        <Text variant="caption" color={colors.textDim} style={{ marginBottom: spacing.sm }}>
          {p.remaining} to go · {achievement.description.toLowerCase()}
        </Text>
        <LinearProgress progress={p.ratio} color={achievement.tint} />
      </View>
    </View>
  );
}

function BadgeCard({ achievement, inputs }: { achievement: Achievement; inputs: AchievementInputs }) {
  const unlocked = !!achievement.unlockedAt;
  const p = achievementProgress(achievement, inputs);

  return (
    <Card style={{ width: '47.5%', gap: spacing.xs }}>
      <Medallion achievement={achievement} unlocked={unlocked} size={40} />
      <Text variant="bodyStrong" color={unlocked ? colors.text : colors.textDim}>
        {achievement.title}
      </Text>
      <Text variant="caption" color={unlocked ? colors.textDim : colors.textFaint}>
        {achievement.description}
      </Text>
      {unlocked ? (
        <Text variant="caption" color={colors.success}>
          {formatDateLong(achievement.unlockedAt!)}
        </Text>
      ) : (
        // A locked badge with no number is just a grey box. The count is the
        // whole reason to keep going.
        <View style={{ gap: 4, marginTop: 2 }}>
          <Text variant="caption" color={colors.textFaint}>
            {p.current} / {p.target}
          </Text>
          <LinearProgress progress={p.ratio} color={achievement.tint} />
        </View>
      )}
    </Card>
  );
}

function Medallion({ achievement, unlocked, size }: { achievement: Achievement; unlocked: boolean; size: number }) {
  return (
    <View
      style={[
        styles.medallion,
        {
          width: size,
          height: size,
          backgroundColor: unlocked ? `${achievement.tint}22` : 'rgba(255,255,255,0.04)',
          borderColor: unlocked ? `${achievement.tint}66` : colors.border,
        },
      ]}
    >
      <Icon
        name={achievement.icon as IconName}
        size={Math.round(size * 0.52)}
        color={unlocked ? achievement.tint : colors.textFaint}
        strokeWidth={1.8}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  medallion: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    borderWidth: 1,
  },
});

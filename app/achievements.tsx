import React from 'react';
import { View } from 'react-native';
import { Card, Screen, SectionHeader, Text } from '../src/components/ui';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Icon, type IconName } from '../src/components/Icon';
import { colors, spacing } from '../src/theme';
import { useGamificationStore } from '../src/stores/useGamificationStore';

export default function Achievements() {
  const achievements = useGamificationStore((s) => s.achievements);
  const streaks = useGamificationStore((s) => s.streaks);

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

  return (
    <Screen gradient>
      <ScreenHeader title="Achievements" />

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
        {achievements.map((a) => (
          <Card key={a.id} style={{ width: '47.5%', gap: spacing.xs, opacity: a.unlockedAt ? 1 : 0.42 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 2,
                backgroundColor: a.unlockedAt ? `${a.tint}22` : 'rgba(255,255,255,0.05)',
                borderWidth: 1,
                borderColor: a.unlockedAt ? `${a.tint}66` : 'transparent',
              }}
            >
              <Icon
                name={a.icon as IconName}
                size={21}
                color={a.unlockedAt ? a.tint : colors.textFaint}
                strokeWidth={1.8}
              />
            </View>
            <Text variant="bodyStrong">{a.title}</Text>
            <Text variant="caption" color={colors.textDim}>
              {a.description}
            </Text>
            {a.unlockedAt && (
              <Text variant="caption" color={colors.success}>
                Unlocked
              </Text>
            )}
          </Card>
        ))}
      </View>
    </Screen>
  );
}

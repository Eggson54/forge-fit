import React from 'react';
import { View } from 'react-native';
import { Card, Screen, SectionHeader, Text } from '../src/components/ui';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Icon } from '../src/components/Icon';
import { colors, spacing } from '../src/theme';
import { useGamificationStore } from '../src/stores/useGamificationStore';

export default function Achievements() {
  const achievements = useGamificationStore((s) => s.achievements);
  const streaks = useGamificationStore((s) => s.streaks);

  const streakItems = [
    { label: 'Daily', value: streaks.daily, color: colors.primary },
    { label: 'Workout', value: streaks.workout, color: colors.lime },
    { label: 'Protein', value: streaks.protein, color: colors.protein },
    { label: 'Nutrition', value: streaks.nutrition, color: colors.carbs },
    { label: 'Hydration', value: streaks.hydration, color: colors.water },
  ];

  const unlocked = achievements.filter((a) => a.unlockedAt).length;

  return (
    <Screen gradient>
      <ScreenHeader title="Achievements" />

      <SectionHeader title="Streaks" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {streakItems.map((s) => (
          <Card key={s.label} style={{ flexBasis: '30%', flexGrow: 1, alignItems: 'center', gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="flame" size={18} color={s.color} />
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
          <Card key={a.id} style={{ flexBasis: '47%', flexGrow: 1, gap: spacing.xs, opacity: a.unlockedAt ? 1 : 0.45 }}>
            <Text style={{ fontSize: 30 }}>{a.icon}</Text>
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

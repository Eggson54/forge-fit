import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../../theme';
import { ads, type AdPlacement } from '../../services/ads';
import { useProfileStore } from '../../stores/useProfileStore';
import { useWorkoutStore } from '../../stores/useWorkoutStore';
import { Text } from './Text';

/**
 * Renders an ad banner ONLY when policy allows (free tier, not mid-workout).
 * The concrete AdMob banner mounts here in a dev build; otherwise an inert,
 * clearly-labeled placeholder keeps layouts honest without deceptive clicks.
 */
export function AdSlot({ placement }: { placement: AdPlacement }) {
  const isPro = useProfileStore((s) => s.isPro());
  const inActiveWorkout = useWorkoutStore((s) => s.activeId !== null);

  if (!ads.shouldShow(placement, { isPro, inActiveWorkout })) return null;

  return (
    <View style={styles.slot} accessibilityRole="none">
      <Text variant="caption" color={colors.textFaint}>
        Ad
      </Text>
      <Text variant="caption" color={colors.textFaint}>
        Go Pro to remove ads
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    height: 64,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    marginVertical: spacing.sm,
  },
});

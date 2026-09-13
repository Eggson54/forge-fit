import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { colors, spacing } from '../theme';
import { Text } from './ui/Text';

/** Compact back header for pushed/modal screens. */
export function ScreenHeader({ title, right, onBack }: { title?: string; right?: React.ReactNode; onBack?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg, minHeight: 32 }}>
      <Pressable onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home')))} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <Path d="M15 5 L8 12 L15 19" stroke={colors.text} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        {title && (
          <Text variant="title" numberOfLines={1}>
            {title}
          </Text>
        )}
      </Pressable>
      {right}
    </View>
  );
}

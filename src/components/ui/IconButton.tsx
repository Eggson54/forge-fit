import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, radius } from '../../theme';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  size?: number;
  variant?: 'ghost' | 'surface';
  accessibilityLabel: string;
  haptic?: boolean;
  style?: ViewStyle;
}

/**
 * A square tap target for a bare icon. `Button` pads to a text width, so using
 * it with an empty title produced a control wider than its declared box; this
 * keeps the hit area exactly `size` on both axes.
 */
export function IconButton({
  children,
  onPress,
  size = 44,
  variant = 'ghost',
  accessibilityLabel,
  haptic = false,
  style,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const spring = (v: number) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();

  const handlePress = () => {
    if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress?.();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={handlePress}
      onPressIn={() => spring(0.92)}
      onPressOut={() => spring(1)}
      style={style}
    >
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale }],
          },
          variant === 'ghost'
            ? { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }
            : { backgroundColor: colors.surfaceHigh },
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

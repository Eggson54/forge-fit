import React, { useRef } from 'react';
import { Animated, Pressable, type PressableProps, type ViewStyle } from 'react-native';

interface Props extends PressableProps {
  children: React.ReactNode;
  scaleTo?: number;
  style?: ViewStyle | ViewStyle[];
}

/** Pressable that springs down on press for a tactile feel (web-safe). */
export function PressableScale({ children, scaleTo = 0.96, style, onPressIn, onPressOut, ...rest }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const to = (v: number) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: false, speed: 40, bounciness: 6 }).start();

  return (
    <Pressable
      onPressIn={(e) => {
        to(scaleTo);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(1);
        onPressOut?.(e);
      }}
      {...rest}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style as ViewStyle]}>{children}</Animated.View>
    </Pressable>
  );
}

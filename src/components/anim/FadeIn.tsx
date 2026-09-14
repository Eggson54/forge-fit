import React, { useEffect, useRef } from 'react';
import { Animated, Easing, type ViewStyle } from 'react-native';

type Direction = 'up' | 'down' | 'left' | 'right' | 'none';

interface Props {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  from?: Direction;
  distance?: number;
  style?: ViewStyle | ViewStyle[];
}

/**
 * Mount entrance animation: fade + slide. JS-driven Animated so it runs on web.
 * Use `delay` to stagger a list (index * 60ms reads well).
 */
export function FadeIn({ children, delay = 0, duration = 450, from = 'up', distance = 16, style }: Props) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    a.start();
    return () => a.stop();
  }, [progress, duration, delay]);

  const translateFields: ViewStyle = {};
  if (from === 'up' || from === 'down') {
    translateFields.transform = [
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [from === 'up' ? distance : -distance, 0] }) as unknown as number },
    ];
  } else if (from === 'left' || from === 'right') {
    translateFields.transform = [
      { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [from === 'left' ? distance : -distance, 0] }) as unknown as number },
    ];
  }

  return (
    <Animated.View style={[{ opacity: progress }, translateFields, style as ViewStyle]}>{children}</Animated.View>
  );
}

/** Stagger helper: wraps each child in a FadeIn with an increasing delay. */
export function Stagger({ children, step = 60, initialDelay = 0, from = 'up' }: { children: React.ReactNode; step?: number; initialDelay?: number; from?: Direction }) {
  return (
    <>
      {React.Children.map(children, (child, i) =>
        child == null || child === false ? child : (
          <FadeIn delay={initialDelay + i * step} from={from}>
            {child}
          </FadeIn>
        ),
      )}
    </>
  );
}

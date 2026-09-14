import React, { useEffect, useRef } from 'react';
import { Animated, type ViewStyle } from 'react-native';

/** Gentle looping breathing/pulse for accents (badges, live coach card). */
export function Pulse({ children, minScale = 1, maxScale = 1.04, duration = 1400, style }: { children: React.ReactNode; minScale?: number; maxScale?: number; duration?: number; style?: ViewStyle }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration, useNativeDriver: false }),
        Animated.timing(v, { toValue: 0, duration, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, duration]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [minScale, maxScale] });
  return <Animated.View style={[{ transform: [{ scale }] }, style]}>{children}</Animated.View>;
}

/** Shimmering skeleton block for loading states. */
export function Shimmer({ width = '100%', height = 16, radius = 8, style }: { width?: number | string; height?: number; radius?: number; style?: ViewStyle }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1100, useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  const opacity = v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.35, 0.7, 0.35] });
  return <Animated.View style={[{ width: width as ViewStyle['width'], height, borderRadius: radius, backgroundColor: '#23242F', opacity }, style]} />;
}

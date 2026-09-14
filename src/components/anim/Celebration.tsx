import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { palette } from '../../theme';

const COLORS = [palette.ember, palette.amber, palette.lime, palette.electric, palette.protein, palette.white];

interface Particle {
  x: number;
  angle: number;
  distance: number;
  color: string;
  size: number;
  rotate: number;
}

function makeParticles(n: number): Particle[] {
  return Array.from({ length: n }, (_, i) => ({
    x: (Math.random() - 0.5) * 60,
    angle: (Math.PI * (i / n)) + (Math.random() - 0.5),
    distance: 120 + Math.random() * 220,
    color: COLORS[i % COLORS.length]!,
    size: 6 + Math.random() * 8,
    rotate: Math.random() * 360,
  }));
}

/**
 * A one-shot confetti burst overlay (for finishing a workout, a PR, a rank-up).
 * Purely decorative and JS-driven so it works on web. Renders nothing after it
 * finishes; mount it with a `key` to replay.
 */
export function Celebration({ count = 26, originY = 0.4 }: { count?: number; originY?: number }) {
  const particles = useRef(makeParticles(count)).current;
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [t]);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'flex-start', paddingTop: `${originY * 100}%` }]}>
      {particles.map((p, i) => {
        const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(p.angle) * p.distance] });
        const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [0, -Math.abs(Math.sin(p.angle)) * p.distance + p.distance * 0.4] });
        const opacity = t.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] });
        const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.rotate + 360}deg`] });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              width: p.size,
              height: p.size * 0.6,
              borderRadius: 2,
              backgroundColor: p.color,
              transform: [{ translateX }, { translateY }, { rotate }],
              opacity,
            }}
          />
        );
      })}
    </View>
  );
}

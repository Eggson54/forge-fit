import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { Icon } from './Icon';
import { Text } from './ui/Text';

/**
 * Transient "new personal record" banner shown the moment a set beats the
 * previous best, rather than making the athlete wait for the post-session
 * summary to find out.
 */
export function PrBanner({
  exerciseName,
  value,
  unit,
  onDone,
  visibleMs = 4000,
}: {
  exerciseName: string;
  value: number;
  unit: string;
  onDone?: () => void;
  visibleMs?: number;
}) {
  const enter = useRef(new Animated.Value(0)).current;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    Animated.spring(enter, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 8 }).start();
    // It is a moment, not a mode: it congratulates and gets out of the way.
    const t = setTimeout(() => {
      Animated.timing(enter, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => doneRef.current?.());
    }, visibleMs);
    return () => clearTimeout(t);
  }, [enter, visibleMs]);

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        styles.wrap,
        {
          opacity: enter,
          transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) }],
        },
      ]}
    >
      <View style={styles.bar}>
        <Icon name="trophy" size={20} color={colors.amber} />
        <View style={{ flex: 1 }}>
          <Text variant="overline" color={colors.amber}>
            NEW PERSONAL RECORD
          </Text>
          <Text variant="bodyStrong" numberOfLines={1}>
            {exerciseName} · {Math.round(value)} {unit} est. 1RM
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, top: 76, paddingHorizontal: spacing.xl, zIndex: 20 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#241B0C',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,176,32,0.55)',
  },
});

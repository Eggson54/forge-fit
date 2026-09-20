import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { useRestStore } from '../stores/useRestStore';
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

  // Both of these fire on the same tap — completing a set starts a rest and can
  // set a record — so the banner sits on top of the timer rather than on the
  // same line as it.
  const restRunning = useRestStore((s) => s.endsAt != null);

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
        { bottom: restRunning ? REST_BAR_CLEARANCE : BASE_BOTTOM },
        {
          opacity: enter,
          transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
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

/**
 * Where the banner sits when nothing else is floating, and when the rest timer
 * is. It used to be pinned near the top of the scroll area, which put it over
 * the screen title and the first exercise card — letters poking out above and
 * below a box that was supposed to be floating.
 */
const BASE_BOTTOM = 96;
const REST_BAR_CLEARANCE = 178;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, paddingHorizontal: spacing.lg, zIndex: 30 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#241B0C',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,176,32,0.55)',
    ...Platform.select({
      web: { boxShadow: '0 12px 32px rgba(0,0,0,0.5)' },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.5,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 14,
      },
    }),
  },
});

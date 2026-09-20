import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { colors, radius, spacing, springs } from '../theme';
import { Icon } from './Icon';
import { Text } from './ui/Text';
import { useRestStore } from '../stores/useRestStore';

const RING = 44;
const STROKE = 3.5;
const R = (RING - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

/**
 * The rest countdown.
 *
 * Mounted once at the root rather than inside the workout screen, so walking
 * out to the water fountain — or to the food log — does not throw the rest
 * away. It renders nothing at all when no rest is running, which is most of
 * the time.
 */
export function RestTimer() {
  const endsAt = useRestStore((s) => s.endsAt);
  const totalSeconds = useRestStore((s) => s.totalSeconds);
  const label = useRestStore((s) => s.label);
  const startedAt = useRestStore((s) => s.startedAt);

  const [remaining, setRemaining] = useState(0);
  const doneRef = useRef(false);
  const enter = useRef(new Animated.Value(0)).current;

  // A new rest is a new countdown: clear the fired flag before the tick below
  // can read it, or a repeat of a rest that already rang dismisses instantly.
  useEffect(() => {
    doneRef.current = false;
  }, [startedAt]);

  useEffect(() => {
    if (endsAt == null) return;
    // Counting down one tick at a time assumes the ticks arrive, and they do
    // not: a backgrounded or throttled tab stops firing intervals. The deadline
    // is wall-clock, so the display catches up when the app comes back.
    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0 && !doneRef.current) {
        doneRef.current = true;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setTimeout(() => {
          // Only clear the rest we finished. Starting the next set during that
          // pause would otherwise be wiped out by this timeout.
          if (useRestStore.getState().endsAt === endsAt) useRestStore.getState().dismiss();
        }, 600);
      }
    };
    // Faster than the second it displays, so a resumed app corrects almost
    // immediately rather than showing a stale number for up to a second.
    const t = setInterval(tick, 250);
    tick();
    return () => clearInterval(t);
  }, [endsAt]);

  useEffect(() => {
    if (endsAt == null) return;
    enter.setValue(0);
    Animated.spring(enter, { toValue: 1, ...springs.enter, useNativeDriver: true }).start();
  }, [endsAt, startedAt, enter]);

  if (endsAt == null) return null;

  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, '0');
  const left = totalSeconds > 0 ? Math.min(1, Math.max(0, remaining / totalSeconds)) : 0;
  const done = remaining === 0;
  const tint = done ? colors.success : colors.primary;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.bar,
          { borderColor: tint },
          {
            opacity: enter,
            transform: [
              { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) },
              { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
            ],
          },
        ]}
      >
        <View style={styles.ring}>
          <Svg width={RING} height={RING}>
            <Circle cx={RING / 2} cy={RING / 2} r={R} stroke={colors.surface} strokeWidth={STROKE} fill="none" />
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={R}
              stroke={tint}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${CIRC} ${CIRC}`}
              // Drains clockwise from full, so the arc left is the rest left.
              strokeDashoffset={CIRC * (1 - left)}
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            />
          </Svg>
          <View style={styles.ringGlyph} pointerEvents="none">
            <Icon name={done ? 'check' : 'timer'} size={16} color={tint} />
          </View>
        </View>

        {/* The whole readout is the way back: the timer is visible from every
            screen now, so it doubles as the handle for the session behind it. */}
        <Pressable
          style={{ flex: 1, minWidth: 0 }}
          onPress={() => router.navigate('/workout/active')}
          accessibilityRole="button"
          accessibilityLabel="Back to the workout"
        >
          <Text variant="metric" color={colors.text}>
            {mm}:{ss}
          </Text>
          <Text variant="caption" color={colors.textDim} numberOfLines={1}>
            {done ? 'rest over — next set' : label || 'rest'}
          </Text>
        </Pressable>

        {!done && (
          <Pressable
            onPress={() => useRestStore.getState().adjust(-15)}
            accessibilityRole="button"
            accessibilityLabel="Subtract 15 seconds"
            hitSlop={8}
            style={styles.pill}
          >
            <Icon name="minus" size={14} color={colors.textDim} />
            <Text variant="label" color={colors.textDim}>15</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => useRestStore.getState().adjust(15)}
          accessibilityRole="button"
          accessibilityLabel="Add 15 seconds"
          hitSlop={8}
          style={styles.pill}
        >
          <Icon name="plus" size={14} color={colors.text} />
          <Text variant="label" color={colors.text}>15</Text>
        </Pressable>
        <Pressable
          onPress={() => useRestStore.getState().dismiss()}
          accessibilityRole="button"
          accessibilityLabel={done ? 'Dismiss rest timer' : 'Skip rest'}
          hitSlop={8}
          style={[styles.pill, { backgroundColor: 'transparent' }]}
        >
          <Text variant="label" color={tint}>{done ? 'Done' : 'Skip'}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 96, paddingHorizontal: spacing.lg },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 12px 32px rgba(0,0,0,0.45)' },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.45,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 12,
      },
    }),
  },
  ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringGlyph: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
});

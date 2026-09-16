import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing } from '../theme';
import { Icon } from './Icon';
import { Text } from './ui/Text';

/** Floating rest countdown shown after completing a set. Self-dismisses at 0. */
export function RestTimer({
  seconds,
  label,
  onDone,
  onDismiss,
}: {
  seconds: number;
  /** What this rest follows, e.g. "Bench Press · set 2". */
  label?: string;
  onDone: () => void;
  onDismiss: () => void;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const [total, setTotal] = useState(seconds);
  const doneRef = useRef(false);

  // Counting down one tick at a time assumes the ticks arrive, and they do not:
  // a backgrounded or throttled tab stops firing intervals, so putting the
  // phone down mid-rest — which is the entire point of resting — left the timer
  // reading whatever it happened to reach. The deadline is wall-clock, so the
  // display simply catches up when the app comes back.
  const deadlineRef = useRef(Date.now() + seconds * 1000);

  // onDone is an inline closure in the workout screen, so its identity changes on
  // every render — and that screen re-renders once a second for its own elapsed
  // clock. Depending on it here tore down and recreated the interval before it
  // could ever fire, so the rest countdown sat frozen at its starting value.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0 && !doneRef.current) {
        doneRef.current = true;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setTimeout(() => onDoneRef.current(), 400);
      }
    };
    // Faster than the second it displays, so a resumed app corrects almost
    // immediately rather than showing a stale number for up to a second.
    const t = setInterval(tick, 250);
    tick();
    return () => clearInterval(t);
  }, []);

  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, '0');
  const elapsed = total > 0 ? 1 - remaining / total : 1;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar}>
        {/* The bar drains as the rest runs down, so how much is left reads at a
            glance mid-set without parsing the digits. */}
        <View style={[styles.drain, { width: `${Math.min(100, Math.max(0, elapsed * 100))}%` }]} pointerEvents="none" />
        <Icon name="timer" size={20} color={colors.primary} />
        <Text variant="metric" color={colors.text}>
          {mm}:{ss}
        </Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="caption" color={colors.textDim} numberOfLines={1}>
            {label ?? 'rest'}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            deadlineRef.current += 15_000;
            setRemaining(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)));
            setTotal((t) => t + 15);
            // Adding time after it has already fired means the rest is back on.
            doneRef.current = false;
          }}
          accessibilityRole="button"
          accessibilityLabel="Add 15 seconds"
          hitSlop={8}
          style={styles.pill}
        >
          <Text variant="label" color={colors.text}>+15s</Text>
        </Pressable>
        <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Skip rest" hitSlop={8} style={styles.pill}>
          <Text variant="label" color={colors.primary}>Skip</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 96, paddingHorizontal: spacing.xl },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    overflow: 'hidden',
  },
  drain: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,90,31,0.16)' },
  pill: { backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill },
});

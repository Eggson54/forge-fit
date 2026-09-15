import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing } from '../theme';
import { Icon } from './Icon';
import { Text } from './ui/Text';

/** Floating rest countdown shown after completing a set. Self-dismisses at 0. */
export function RestTimer({ seconds, onDone, onDismiss }: { seconds: number; onDone: () => void; onDismiss: () => void }) {
  const [remaining, setRemaining] = useState(seconds);
  const [total, setTotal] = useState(seconds);
  const doneRef = useRef(false);

  // onDone is an inline closure in the workout screen, so its identity changes on
  // every render — and that screen re-renders once a second for its own elapsed
  // clock. Depending on it here tore down and recreated the interval before it
  // could ever fire, so the rest countdown sat frozen at its starting value.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(t);
          if (!doneRef.current) {
            doneRef.current = true;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            setTimeout(() => onDoneRef.current(), 400);
          }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
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
        <Text variant="caption" color={colors.textDim}>
          rest
        </Text>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => {
            setRemaining((r) => r + 15);
            setTotal((t) => t + 15);
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

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing } from '../theme';
import { Icon } from './Icon';
import { Text } from './ui/Text';

/** Floating rest countdown shown after completing a set. Self-dismisses at 0. */
export function RestTimer({ seconds, onDone, onDismiss }: { seconds: number; onDone: () => void; onDismiss: () => void }) {
  const [remaining, setRemaining] = useState(seconds);
  const doneRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(t);
          if (!doneRef.current) {
            doneRef.current = true;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            setTimeout(onDone, 400);
          }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [onDone]);

  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, '0');

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar}>
        <Icon name="timer" size={20} color={colors.primary} />
        <Text variant="metric" color={colors.text}>
          {mm}:{ss}
        </Text>
        <Text variant="caption" color={colors.textDim}>
          rest
        </Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setRemaining((r) => r + 15)} hitSlop={8} style={styles.pill}>
          <Text variant="label" color={colors.text}>+15s</Text>
        </Pressable>
        <Pressable onPress={onDismiss} hitSlop={8} style={styles.pill}>
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
  },
  pill: { backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill },
});

import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, spacing } from '../theme';
import type { CoachMessageResult } from '../services/ai/types';
import type { CoachPersonality } from '../domain/types';
import { Icon } from './Icon';
import { Text } from './ui/Text';

const PERSONA_LABEL: Record<CoachPersonality, string> = {
  friendly: 'Friendly',
  motivational: 'Motivational',
  savage: 'Savage',
  no_mercy: 'No Mercy',
};

/**
 * Per-tone treatment: a near-black wash plus a saturated rail. The wash alone
 * was too subtle to tell praise from a push, and flooding the card with colour
 * would fight the ember brand — the rail carries the signal instead.
 */
const TONE: Record<CoachMessageResult['tone'], { wash: [string, string]; rail: string }> = {
  praise: { wash: ['#16231A', '#101511'], rail: colors.success },
  nudge: { wash: ['#1E1B2E', '#121016'], rail: colors.sleep },
  push: { wash: ['#2E1A16', '#1A100E'], rail: colors.primary },
  reflect: { wash: ['#16202E', '#101620'], rail: colors.water },
};

const DEFAULT_TONE = TONE.nudge;

interface Props {
  message: CoachMessageResult | null;
  personality: CoachPersonality;
  loading?: boolean;
  onPress?: () => void;
}

/** The AI coach's daily message — the emotional centerpiece of Home. */
export function CoachCard({ message, personality, loading, onPress }: Props) {
  const tone = message ? TONE[message.tone] : DEFAULT_TONE;

  const body = (
    <View style={styles.card}>
      <LinearGradient colors={tone.wash} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.rail, { backgroundColor: tone.rail }]} />

      <View style={styles.inner}>
        <View style={styles.header}>
          <View style={styles.badge}>
            <Icon name="flame" size={12} color={colors.primary} />
            <Text variant="overline" color={colors.primary}>
              AI COACH
            </Text>
          </View>
          <Text variant="caption" color={colors.textDim}>
            {PERSONA_LABEL[personality]}
          </Text>
        </View>

        {loading ? (
          <View style={{ height: 56, justifyContent: 'center' }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <Text variant="h3" style={{ lineHeight: 28 }}>
            {message?.text ?? "Log your day and I'll tell you where you stand."}
          </Text>
        )}

        {onPress && (
          <View style={styles.cta}>
            <Text variant="label" color={colors.primary}>
              Talk to your coach
            </Text>
            <Text variant="label" color={colors.primary}>
              ›
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Talk to your coach"
      onPress={onPress}
      style={({ pressed }) => (pressed ? { opacity: 0.9, transform: [{ scale: 0.995 }] } : undefined)}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rail: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  inner: { padding: spacing.xl, paddingLeft: spacing.xl + 3, gap: spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,90,31,0.14)',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
});

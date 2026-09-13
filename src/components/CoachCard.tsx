import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, spacing } from '../theme';
import type { CoachMessageResult } from '../services/ai/types';
import type { CoachPersonality } from '../domain/types';
import { Text } from './ui/Text';

const PERSONA_LABEL: Record<CoachPersonality, string> = {
  friendly: 'Friendly',
  motivational: 'Motivational',
  savage: 'Savage',
  no_mercy: 'No Mercy',
};

const TONE_ACCENT: Record<CoachMessageResult['tone'], [string, string]> = {
  praise: ['#1C2B1A', '#12160F'],
  nudge: ['#1E1B2E', '#121016'],
  push: ['#2E1A16', '#1A100E'],
  reflect: ['#16202E', '#101620'],
};

interface Props {
  message: CoachMessageResult | null;
  personality: CoachPersonality;
  loading?: boolean;
  onPress?: () => void;
}

/** The AI coach's daily message — the emotional centerpiece of Home. */
export function CoachCard({ message, personality, loading, onPress }: Props) {
  const accent = message ? TONE_ACCENT[message.tone] : (['#1E1B2E', '#121016'] as [string, string]);
  return (
    <LinearGradient colors={accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Text variant="overline" color={colors.primary}>
            AI COACH
          </Text>
        </View>
        <Text variant="caption" color={colors.textDim}>
          {PERSONA_LABEL[personality]}
        </Text>
      </View>
      {loading ? (
        <View style={{ height: 44, justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <Text variant="h3" style={{ lineHeight: 28 }}>
          {message?.text ?? 'Log your day and I’ll tell you where you stand.'}
        </Text>
      )}
      {onPress && (
        <Text variant="label" color={colors.primary} onPress={onPress} style={{ marginTop: spacing.md }}>
          Talk to your coach ›
        </Text>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { backgroundColor: 'rgba(255,90,31,0.14)', paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
});

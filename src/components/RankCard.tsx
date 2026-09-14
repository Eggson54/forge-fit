import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { colors, radius, spacing } from '../theme';
import type { RankResult } from '../domain/rank';
import { Text } from './ui/Text';
import { AnimatedNumber, Pulse } from './anim';

/** Displays the user's Forge Rank tier, score and progress to the next tier. */
export function RankCard({ rank, compact }: { rank: RankResult; compact?: boolean }) {
  const { tier, nextTier, progressToNext, score } = rank;
  return (
    <LinearGradient
      colors={['#181722', '#0E0D14']}
      style={{ borderRadius: radius.xl, padding: spacing.xl, borderWidth: 1, borderColor: tier.color + '55' }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
        <Pulse maxScale={1.06}>
          <Emblem color={tier.color} />
        </Pulse>
        <View style={{ flex: 1 }}>
          <Text variant="overline" color={colors.textDim}>FORGE RANK</Text>
          <Text variant="h2" color={tier.color}>{tier.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <AnimatedNumber value={score} variant="metric" />
            <Text variant="caption" color={colors.textDim}>/ 1000 forge score</Text>
          </View>
        </View>
      </View>

      {!compact && (
        <View style={{ marginTop: spacing.lg, gap: 6 }}>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceHigh, overflow: 'hidden' }}>
            <View style={{ width: `${Math.round(progressToNext * 100)}%`, height: '100%', backgroundColor: tier.color, borderRadius: 4 }} />
          </View>
          <Text variant="caption" color={colors.textDim}>
            {nextTier ? `${Math.round(progressToNext * 100)}% to ${nextTier.name}` : 'Top tier reached — Apex'}
          </Text>
        </View>
      )}
    </LinearGradient>
  );
}

/** Faceted shield emblem, tinted by tier color. */
function Emblem({ color }: { color: string }) {
  return (
    <Svg width={56} height={56} viewBox="0 0 48 48">
      <Path d="M24 3 L42 10 V24 Q42 38 24 45 Q6 38 6 24 V10 Z" fill={color + '22'} stroke={color} strokeWidth={2} />
      <Path d="M24 12 L31 24 L24 30 L17 24 Z" fill={color} />
      <Path d="M24 30 L31 24 L28 34 Z" fill={color} opacity={0.6} />
      <Path d="M24 30 L17 24 L20 34 Z" fill={color} opacity={0.6} />
    </Svg>
  );
}

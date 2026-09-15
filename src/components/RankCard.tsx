import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';
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

/** Hex rank insignia: chevron + rank bars, tinted by tier. */
function Emblem({ color }: { color: string }) {
  const gid = React.useId();
  return (
    <Svg width={58} height={58} viewBox="0 0 48 48">
      <Defs>
        <SvgGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={color} />
          <Stop offset="1" stopColor={color} stopOpacity="0.55" />
        </SvgGradient>
      </Defs>
      <Path d="M24 2 L42 12 V36 L24 46 L6 36 V12 Z" fill="#0E1017" stroke={`url(#${gid})`} strokeWidth={2.2} strokeLinejoin="round" />
      <Path d="M24 9 L36 15.5 V32.5 L24 39 L12 32.5 V15.5 Z" fill={color} opacity={0.1} />
      <Path d="M13 27 L24 13 L35 27 L28.5 27 L24 21 L19.5 27 Z" fill={`url(#${gid})`} />
      <Rect x="17" y="30" width="14" height="3.4" rx="1.7" fill={color} opacity={0.85} />
      <Rect x="20" y="35.5" width="8" height="3" rx="1.5" fill={color} opacity={0.5} />
    </Svg>
  );
}

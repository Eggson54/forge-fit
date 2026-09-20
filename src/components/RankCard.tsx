import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';
import { colors, radius, spacing } from '../theme';
import { RANK_MAX, pointsToNext, tierLadder, type RankResult } from '../domain/rank';
import { Text } from './ui/Text';
import { AnimatedNumber, Pulse } from './anim';

/** Displays the user's Forge Rank tier, score and progress to the next tier. */
export function RankCard({ rank, compact }: { rank: RankResult; compact?: boolean }) {
  const { tier, nextTier, score } = rank;
  const bands = tierLadder(score);
  const owed = pointsToNext(rank);

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
            <Text variant="caption" color={colors.textDim}>/ {RANK_MAX} forge score</Text>
          </View>
        </View>
      </View>

      {!compact && (
        <View
          style={{ marginTop: spacing.lg, gap: 6 }}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: RANK_MAX, now: score }}
          accessibilityLabel={
            owed == null
              ? `${score} of ${RANK_MAX} forge score. Top tier reached.`
              : `${score} of ${RANK_MAX} forge score. ${owed} to ${nextTier?.name}.`
          }
        >
          {/* One band per tier, each as wide as the points it covers — so the
              filled length is genuinely the score out of 1000, and the seams
              say what the next stretch is worth. */}
          <View style={{ flexDirection: 'row', gap: 3 }}>
            {bands.map((b) => (
              <View
                key={b.tier.key}
                style={{
                  flex: b.span,
                  height: 9,
                  borderRadius: 4.5,
                  backgroundColor: colors.surfaceHigh,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${b.fill * 100}%`,
                    height: '100%',
                    borderRadius: 4.5,
                    backgroundColor: b.tier.color,
                    // A cleared band is history; the one in play carries the eye.
                    opacity: b.current ? 1 : 0.38,
                  }}
                />
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 3 }}>
            {bands.map((b) => (
              <View key={b.tier.key} style={{ flex: b.span, alignItems: 'center' }}>
                <Text variant="caption" color={b.current ? b.tier.color : colors.textFaint}>
                  {b.tier.name.slice(0, 2).toUpperCase()}
                </Text>
              </View>
            ))}
          </View>
          <Text variant="caption" color={colors.textDim}>
            {owed == null ? 'Top tier reached — Apex' : `${owed} points to ${nextTier?.name}`}
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

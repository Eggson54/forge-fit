import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Path, RadialGradient, Stop, Rect } from 'react-native-svg';
import { colors, spacing } from '../theme';
import { Text } from './ui';

/**
 * The header block at the top of a tab.
 *
 * Previously a caption over a name with three round buttons beside it — correct,
 * and completely inert. A screen wants somewhere for the eye to start, so this
 * lays a soft accent bloom and a faint diagonal ruling behind the title. Both
 * sit at very low opacity: the job is to give the corner weight, not to compete
 * with the first card.
 */
export function Masthead({
  eyebrow,
  title,
  accent = colors.primary,
  right,
  children,
}: {
  eyebrow?: string;
  title: string;
  accent?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill as never}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="mh_bloom" cx="8%" cy="18%" r="72%">
              <Stop offset="0%" stopColor={accent} stopOpacity={0.2} />
              <Stop offset="100%" stopColor={accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#mh_bloom)" />
          {/* Three slashes borrowed from the brand mark's angle. */}
          {[0, 1, 2].map((i) => (
            <Path
              key={i}
              d={`M ${230 + i * 26} -20 L ${300 + i * 26} 120`}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth={10}
              strokeLinecap="round"
            />
          ))}
        </Svg>
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {eyebrow && (
            <Text variant="overline" color={accent} style={{ marginBottom: 2 }}>
              {eyebrow}
            </Text>
          )}
          <Text variant="h1" numberOfLines={1}>
            {title}
          </Text>
        </View>
        {right && <View style={styles.right}>{right}</View>}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: -spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});

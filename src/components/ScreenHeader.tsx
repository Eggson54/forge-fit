import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { colors, radius, spacing } from '../theme';
import { Text } from './ui/Text';

/**
 * Header for pushed screens.
 *
 * The back affordance used to be one pressable spanning the chevron, the title
 * and all the space after it, so a tap anywhere along the top of the screen
 * navigated away — and it carried no accessible name. It is now a bounded
 * target of its own, labelled, with the title beside it rather than inside it.
 *
 * The title is also larger than it was: tabs render at `h1` and inner screens
 * sat at `title`, which made them read as a different, lesser app.
 */
export function ScreenHeader({
  title,
  subtitle,
  right,
  onBack,
  /** Tints the chevron's disc, for screens that belong to a coloured area. */
  accent,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  onBack?: () => void;
  accent?: string;
}) {
  const goBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home')));

  return (
    <View style={styles.row}>
      <Pressable
        onPress={goBack}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={({ pressed }) => [
          styles.back,
          accent ? { backgroundColor: `${accent}1A`, borderColor: `${accent}33` } : null,
          pressed && { opacity: 0.6 },
        ]}
      >
        <Svg width={20} height={20} viewBox="0 0 24 24">
          <Path
            d="M14.5 5 L7.5 12 L14.5 19"
            stroke={accent ?? colors.text}
            strokeWidth={2.2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Pressable>

      <View style={{ flex: 1, minWidth: 0 }}>
        {title && (
          <Text variant="h2" numberOfLines={1}>
            {title}
          </Text>
        )}
        {subtitle && (
          <Text variant="caption" color={colors.textDim} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      {right && <View style={styles.right}>{right}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
    minHeight: 40,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});

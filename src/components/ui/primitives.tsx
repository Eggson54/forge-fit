import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, elevation, radius, spacing } from '../../theme';
import { Text } from './Text';
import { Icon, type IconName } from '../Icon';

/** Hex colour at a given alpha, for tinted glyph tiles. */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(255,255,255,${alpha})`;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Row of a title + optional action, used above content sections. */
export function SectionHeader({
  title,
  action,
  onAction,
  accent,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  /** Tints the leading tick, for sections that belong to a particular area. */
  accent?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      {/* A short bar before the label. Overline text alone floated between the
          cards above and below it without ever attaching to either. */}
      <View style={[styles.sectionTick, accent ? { backgroundColor: accent } : null]} />
      <Text variant="overline" color={colors.textDim} style={{ flex: 1, minWidth: 0 }}>
        {title}
      </Text>
      {action && (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text variant="label" color={colors.primary}>
            {action}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[styles.divider, style]} />;
}

export function Pill({ label, color = colors.primary, filled }: { label: string; color?: string; filled?: boolean }) {
  return (
    <View
      style={[
        styles.pill,
        filled ? { backgroundColor: color } : { backgroundColor: 'transparent', borderColor: color, borderWidth: 1 },
      ]}
    >
      <Text variant="caption" color={filled ? colors.onPrimary : color}>
        {label}
      </Text>
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected ? { backgroundColor: colors.primary, borderColor: colors.primary } : null]}
    >
      <Text variant="label" color={selected ? colors.onPrimary : colors.text}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Linear progress bar with optional over-target danger tint. */
export function LinearProgress({
  progress,
  color = colors.primary,
  height = 8,
  overflowColor = colors.warning,
}: {
  progress: number;
  color?: string;
  height?: number;
  overflowColor?: string;
}) {
  const over = progress > 1;
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: over ? overflowColor : color, borderRadius: height / 2 }} />
    </View>
  );
}

/** Compact metric tile (value over label) for stat grids. */
export function StatTile({
  value,
  label,
  color = colors.text,
  accent,
}: {
  value: string;
  label: string;
  color?: string;
  /**
   * A coloured dot above the value.
   *
   * All of a row or none of it: the dot takes a line of its own, so a single
   * accented tile among plain ones sits a dozen pixels lower than the rest.
   */
  accent?: string;
}) {
  return (
    <View style={styles.statTile}>
      {accent && <View style={[styles.accentDot, { backgroundColor: accent }]} />}
      <Text variant="metric" color={color}>
        {value}
      </Text>
      <Text variant="caption" color={colors.textDim}>
        {label}
      </Text>
    </View>
  );
}

/**
 * The screen somebody sees before they have done anything.
 *
 * Worth more care than it usually gets: for a feature nobody has used yet,
 * this *is* the feature's whole interface, and a grey glyph adrift in a
 * screen of nothing reads as something failing to load rather than as
 * something waiting to be used.
 *
 * Two changes carry most of the weight. The icon sits in a tinted ring
 * rather than a flat grey circle, so it looks placed rather than left over;
 * and `tint` lets a screen pass its own domain colour through, which is what
 * the rest of the app already does everywhere else.
 *
 * `compact` exists because a screen with two of these stacked — Gear &
 * Goals has exactly that — spends its whole height on two apologies.
 */
export function EmptyState({
  title,
  subtitle,
  icon,
  action,
  onAction,
  tint = colors.primary,
  compact = false,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  action?: string;
  onAction?: () => void;
  /** The screen's own accent, so an empty state belongs to its screen. */
  tint?: string;
  /** Less vertical room, for when more than one shares a screen. */
  compact?: boolean;
}) {
  return (
    <View style={[styles.empty, compact && styles.emptyCompact]}>
      {icon && (
        <View
          style={[
            styles.emptyIcon,
            // 14% fill and 38% border: enough to read as deliberate on the
            // dark ground without competing with a real button.
            { backgroundColor: `${tint}24`, borderColor: `${tint}61` },
          ]}
        >
          <Icon name={icon} size={26} color={tint} strokeWidth={1.7} />
        </View>
      )}
      <Text variant="title" center>
        {title}
      </Text>
      {subtitle && (
        <Text variant="body" color={colors.textDim} center>
          {subtitle}
        </Text>
      )}
      {action && onAction && (
        <Pressable
          onPress={onAction}
          hitSlop={8}
          accessibilityRole="button"
          style={({ pressed }) => [styles.emptyAction, { borderColor: `${tint}55` }, pressed && { opacity: 0.7 }]}
        >
          <Text variant="bodyStrong" color={tint}>
            {action}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  right,
  onPress,
  icon,
  tint = colors.textDim,
  danger,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  /** Vector glyph shown in a tinted tile at the start of the row. */
  icon?: IconName;
  tint?: string;
  danger?: boolean;
}) {
  const Wrapper: any = onPress ? Pressable : View;
  const glyphTint = danger ? colors.danger : tint;
  return (
    <Wrapper onPress={onPress} style={({ pressed }: { pressed?: boolean }) => [styles.listRow, pressed && { opacity: 0.6 }]}>
      <View style={styles.listRowLeft}>
        {icon && (
          <View style={[styles.listRowIcon, { backgroundColor: withAlpha(glyphTint, 0.13) }]}>
            <Icon name={icon} size={19} color={glyphTint} strokeWidth={1.9} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" color={danger ? colors.danger : colors.text}>
            {title}
          </Text>
          {subtitle && (
            <Text variant="caption" color={colors.textDim}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      {right ?? (onPress ? <Text color={colors.textFaint}>›</Text> : null)}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    marginTop: spacing.lg,
  },
  sectionTick: { width: 3, height: 12, borderRadius: 2, backgroundColor: colors.textFaint },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.md },
  pill: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  track: { backgroundColor: colors.surfaceHigh, overflow: 'hidden', width: '100%' },
  statTile: { flex: 1, minWidth: 0, gap: 2 },
  accentDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 4 },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl, paddingHorizontal: spacing.lg },
  emptyCompact: { paddingVertical: spacing.lg },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    // A full point rather than a hairline: at 56px a hairline ring reads as
    // an artefact of the screenshot rather than as a drawn edge.
    borderWidth: 1,
    marginBottom: spacing.xs,
  },
  emptyAction: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md, gap: spacing.md },
  listRowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  listRowIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});

/**
 * A well: content set *into* the page rather than raised off it. Strips,
 * tracks, grids and keypads belong in one — when everything is raised, nothing
 * is.
 */
export function Well({
  children,
  style,
  padded = true,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  padded?: boolean;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: elevation.sunken.fill[0],
          borderRadius: elevation.sunken.radius,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: elevation.sunken.rim,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {/* React Native has no inset shadow, so the "set into the page" read is
          carried by an explicit shade down from the top edge. Without it the
          darker fill alone is too close to the page ground to notice. */}
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 14 }}
      />
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}
      />
      {/* And a faint lift along the bottom lip, the way a real recess catches
          light on its far wall. */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.05)' }}
      />
      <View style={{ padding: padded ? spacing.md : 0 }}>{children}</View>
    </View>
  );
}

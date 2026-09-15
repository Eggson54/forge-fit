import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../../theme';
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
export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="overline" color={colors.textDim}>
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

export function EmptyState({
  title,
  subtitle,
  icon,
  action,
  onAction,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      {icon && (
        <View style={styles.emptyIcon}>
          <Icon name={icon} size={26} color={colors.textDim} strokeWidth={1.7} />
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
        <Pressable onPress={onAction} hitSlop={8} style={{ marginTop: spacing.xs }}>
          <Text variant="bodyStrong" color={colors.primary}>
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
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, marginTop: spacing.sm },
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
  statTile: { flex: 1, gap: 2 },
  accentDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 4 },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl, paddingHorizontal: spacing.lg },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md, gap: spacing.md },
  listRowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  listRowIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});

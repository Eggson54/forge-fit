import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './ui/Text';
import { colors } from '../theme';
import { groupThousands } from '../domain/units';

export interface DeltaStatProps {
  label: string;
  value: string;
  accent: string;
  /** Change against the comparison period, in display units. Null = no basis. */
  delta: number | null;
  /** Suffix for the delta, e.g. 'g' or '%'. */
  unit?: string;
  /** Whether a rise is the direction the athlete wants. */
  higherIsBetter?: boolean;
  /** Below this the change is noise and gets no verdict. */
  noise?: number;
}

/**
 * A metric with its change against the previous period.
 *
 * A weekly review that only states this week's numbers is a summary, not a
 * review — "155g of protein" means nothing without "and last week was 132g".
 * A null delta means there is no previous period to compare against, which is
 * not the same as no change and is shown as such.
 */
export function DeltaStat({ label, value, accent, delta, unit = '', higherIsBetter = true, noise = 0 }: DeltaStatProps) {
  const flat = delta == null || Math.abs(delta) <= noise;
  const better = delta != null && delta > 0 === higherIsBetter;

  return (
    <View style={styles.wrap}>
      <View style={[styles.dot, { backgroundColor: accent }]} />
      <Text variant="metric" numberOfLines={1}>
        {value}
      </Text>
      <Text variant="caption" color={colors.textDim} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.delta}>
        {delta == null ? (
          <Text variant="caption" color={colors.textFaint}>
            —
          </Text>
        ) : flat ? (
          <Text variant="caption" color={colors.textFaint}>
            level
          </Text>
        ) : (
          // A signed number rather than an arrow: "2" under "4/5" reads as a
          // value, and the sign is the part that carries the meaning.
          <Text variant="caption" color={better ? colors.success : colors.warning}>
            {delta > 0 ? '+' : '−'}
            {Math.abs(delta) % 1 === 0
              ? groupThousands(Math.abs(delta))
              : Math.abs(delta).toFixed(1)}
            {unit}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minWidth: 0, gap: 2 },
  dot: { width: 7, height: 7, borderRadius: 4, marginBottom: 4 },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
});

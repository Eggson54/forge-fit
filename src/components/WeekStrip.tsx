import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './ui/Text';
import { Icon } from './Icon';
import { colors, radius, spacing } from '../theme';
import type { ISODate } from '../domain/types';

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export interface WeekDay {
  date: ISODate;
  trained: boolean;
  isToday: boolean;
  isFuture: boolean;
}

/**
 * The training week at a glance. The month calendar on Progress answers "how
 * has this gone", but the question on the home screen is "am I on track right
 * now", and that only needs seven cells.
 */
export function WeekStrip({
  days,
  target,
  onPress,
}: {
  days: WeekDay[];
  target: number;
  onPress?: () => void;
}) {
  const done = days.filter((d) => d.trained).length;
  const remaining = Math.max(0, target - done);
  const left = days.filter((d) => d.isFuture || d.isToday).length;

  return (
    <Pressable onPress={onPress} accessibilityRole={onPress ? 'button' : undefined}>
      <View style={styles.header}>
        <Text variant="overline" color={colors.textDim}>
          This week
        </Text>
        <Text variant="caption" color={done >= target ? colors.success : colors.textDim}>
          {done} of {target}
          {done >= target ? ' · done' : remaining > left ? ' · behind' : ''}
        </Text>
      </View>
      <View style={styles.row}>
        {days.map((d, i) => (
          <View key={d.date} style={styles.cell}>
            <Text variant="caption" color={d.isToday ? colors.text : colors.textFaint} center>
              {LETTERS[i]}
            </Text>
            <View
              style={[
                styles.dot,
                d.trained && styles.dotOn,
                d.isToday && styles.today,
                d.isFuture && !d.trained && styles.future,
              ]}
            >
              {d.trained && <Icon name="check" size={13} color={colors.onPrimary} strokeWidth={3} />}
            </View>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  row: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', gap: 6 },
  dot: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotOn: { backgroundColor: colors.primary },
  today: { borderWidth: 1.5, borderColor: colors.lime },
  // A day that hasn't happened yet is an opportunity, not a miss.
  future: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
});

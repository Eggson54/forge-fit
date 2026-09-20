import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './ui/Text';
import { Icon } from './Icon';
import { colors, radius, spacing } from '../theme';
import { daysStillAvailable, weekPace, type WeekDay } from '../domain/week';

export type { WeekDay };

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

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
  const available = daysStillAvailable(days);
  const pace = weekPace(done, target, available);
  const paceColor = pace.tone === 'good' ? colors.success : pace.tone === 'warn' ? colors.amber : colors.textDim;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `This week: ${done} of ${target} sessions. ${pace.text}` : undefined}
    >
      <View style={styles.header}>
        <Text variant="overline" color={colors.textDim}>
          This week
        </Text>
        <View style={styles.tally}>
          <Text variant="label" color={done >= target ? colors.success : colors.text}>
            {done}
          </Text>
          <Text variant="caption" color={colors.textFaint}>
            /{target}
          </Text>
        </View>
      </View>

      <View style={styles.row}>
        {days.map((d, i) => {
          const missed = !d.trained && !d.isFuture && !d.isToday;
          return (
            <View key={d.date} style={styles.cell}>
              <Text variant="caption" color={d.isToday ? colors.text : colors.textFaint} center>
                {LETTERS[i]}
              </Text>
              <View
                style={[
                  styles.tile,
                  d.trained && styles.tileOn,
                  d.isFuture && !d.trained && styles.future,
                  missed && styles.missed,
                  d.isToday && styles.today,
                ]}
              >
                {d.trained ? (
                  <Icon name="check" size={14} color={colors.onPrimary} strokeWidth={3} />
                ) : (
                  // The date, so the strip says *which* days as well as how many.
                  <Text variant="caption" color={missed ? colors.textFaint : d.isToday ? colors.lime : colors.textDim}>
                    {Number(d.date.slice(8, 10))}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* One line of pressure. The tally says where you are; this says whether
          there is still room to get where you said you were going. */}
      <Text variant="caption" color={paceColor} style={{ marginTop: spacing.sm }}>
        {pace.text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  tally: { flexDirection: 'row', alignItems: 'baseline', gap: 1 },
  row: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', gap: 6 },
  tile: {
    width: 32,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tileOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  // A day that hasn't happened yet is an opportunity, not a miss.
  future: { backgroundColor: 'transparent', borderColor: colors.border },
  // A day that has been and gone without a session is neither — it is spent.
  missed: { backgroundColor: 'transparent', borderColor: 'transparent' },
  today: { borderColor: colors.lime, borderWidth: 1.5 },
});

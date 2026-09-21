import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Card, EmptyState, Screen, SectionHeader, StatTile, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { FadeIn } from '../../src/components/anim';
import { Icon } from '../../src/components/Icon';
import { colors, domainAccent, spacing } from '../../src/theme';
import { formatDayMonth, todayISO } from '../../src/domain/date';
import {
  MEAL_TIMING_NOTE,
  dayWindow,
  formatClock,
  formatSpan,
  overnightFast,
  proteinSpread,
  readSpread,
  readWindow,
  typicalWindow,
  windowSeries,
} from '../../src/domain/mealTiming';
import type { MealSlot } from '../../src/domain/types';
import { useLogStore } from '../../src/stores/useLogStore';

const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

/**
 * When the eating happens.
 *
 * Every entry has carried the moment it was logged since the first version of
 * the app, and nothing had ever read it. The window, the overnight gap and the
 * shape of the day's protein were all already in the data.
 */
export default function MealTiming() {
  const entries = useLogStore((s) => s.nutrition);
  const today = todayISO();

  const series = useMemo(() => windowSeries(entries, 14, today), [entries, today]);
  const typical = useMemo(() => typicalWindow(series), [series]);
  const todayWindow = useMemo(() => dayWindow(entries, today), [entries, today]);
  const fast = useMemo(() => overnightFast(entries, today), [entries, today]);
  const spread = useMemo(() => proteinSpread(entries, today), [entries, today]);

  if (series.length === 0 && !spread) {
    return (
      <Screen gradient>
        <ScreenHeader title="Meal timing" subtitle="When the eating happens" />
        <EmptyState
          icon="clock"
          title="Nothing logged yet"
          subtitle="This is read off the times your food entries were logged. A couple of days of logging and the shape of your day appears here."
          action="Log some food"
          onAction={() => router.push('/nutrition/add')}
        />
      </Screen>
    );
  }

  return (
    <Screen gradient>
      <ScreenHeader title="Meal timing" subtitle="When the eating happens" />

      {typical && (
        <FadeIn>
          <Card style={{ gap: spacing.md, marginBottom: spacing.md }}>
            <Text variant="overline" color={colors.textFaint}>YOUR USUAL DAY</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
              <Text variant="metric" color={colors.text}>{formatClock(typical.firstMinutes)}</Text>
              <Text variant="caption" color={colors.textFaint}>to</Text>
              <Text variant="metric" color={colors.text}>{formatClock(typical.lastMinutes)}</Text>
            </View>
            <Clock first={typical.firstMinutes} last={typical.lastMinutes} />
            <Text variant="caption" color={colors.textFaint}>{readWindow(typical)}</Text>
          </Card>
        </FadeIn>
      )}

      <View style={{ flexDirection: 'row', marginBottom: spacing.md }}>
        <StatTile
          value={todayWindow ? formatSpan(todayWindow.windowMinutes) : '—'}
          label="Today's window"
          accent={colors.calorie}
        />
        <StatTile
          value={fast != null ? formatSpan(fast) : '—'}
          label="Overnight gap"
          accent={colors.sleep}
        />
        <StatTile
          value={todayWindow ? `${todayWindow.meals}` : '—'}
          label="Sittings today"
          accent={colors.protein}
        />
      </View>

      {spread && spread.totalG > 0 && (
        <>
          <SectionHeader title="Protein across today" accent={domainAccent.nutrition} />
          <Card style={{ gap: spacing.md, marginBottom: spacing.md }}>
            {spread.slots.map((row) => (
              <View key={row.slot} style={{ gap: 5 }}>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <Text variant="label" color={colors.text} style={{ flex: 1, minWidth: 0 }}>
                    {SLOT_LABEL[row.slot]}
                  </Text>
                  <Text variant="caption" color={row.hits ? colors.success : colors.textFaint}>
                    {Math.round(row.proteinG)}g
                  </Text>
                </View>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      {
                        width: `${Math.min(100, Math.round((row.proteinG / Math.max(spread.thresholdG * 1.5, 1)) * 100))}%`,
                        backgroundColor: row.hits ? colors.protein : colors.textFaint,
                      },
                    ]}
                  />
                  {/* The threshold as a line to clear, not a pass mark. */}
                  <View style={[styles.mark, { left: `${Math.round((1 / 1.5) * 100)}%` }]} />
                </View>
              </View>
            ))}
            <Text variant="caption" color={colors.textFaint}>{readSpread(spread)}</Text>
          </Card>
        </>
      )}

      {series.length >= 2 && (
        <>
          <SectionHeader title="Last two weeks" accent={domainAccent.nutrition} />
          <Card style={{ gap: spacing.sm, marginBottom: spacing.md }}>
            {series.slice(-10).reverse().map((w) => (
              <View key={w.date} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text variant="caption" color={colors.textFaint} style={{ width: 50 }}>
                  {formatDayMonth(w.date)}
                </Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Clock first={w.firstMinutes} last={w.lastMinutes} compact />
                </View>
                <Text variant="caption" color={colors.textDim} style={{ width: 58, textAlign: 'right' }}>
                  {formatSpan(w.windowMinutes)}
                </Text>
              </View>
            ))}
          </Card>
        </>
      )}

      <Card tone="alt" style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="shield" size={14} color={colors.textDim} />
          <Text variant="overline" color={colors.textDim}>WHAT THIS MEASURES</Text>
        </View>
        <Text variant="caption" color={colors.textFaint}>{MEAL_TIMING_NOTE}</Text>
      </Card>

      <Pressable
        onPress={() => router.push('/nutrition/trends')}
        accessibilityRole="link"
        accessibilityLabel="Go to nutrition trends"
        style={{ paddingVertical: spacing.lg }}
      >
        <Text variant="label" color={colors.primary} center>See what you ate ›</Text>
      </Pressable>
    </Screen>
  );
}

/** A 24-hour strip with the eating window lit. */
function Clock({ first, last, compact }: { first: number; last: number; compact?: boolean }) {
  const left = (first / 1440) * 100;
  const width = Math.max(1.5, ((last - first) / 1440) * 100);
  return (
    <View style={{ gap: compact ? 0 : 4 }}>
      <View style={[styles.strip, compact && { height: 6 }]}>
        <View style={[styles.window, { left: `${left}%`, width: `${width}%` }]} />
      </View>
      {!compact && (
        <View style={{ flexDirection: 'row' }}>
          {/* Four labels, each a quarter wide: the left edge of each one is
              its own tick, so 6a sits at 25% rather than at a fifth. */}
          {['12a', '6a', '12p', '6p'].map((t) => (
            <Text key={t} variant="caption" color={colors.textFaint} style={{ flex: 1, fontSize: 9 }}>
              {t}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { height: 10, borderRadius: 5, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  window: { position: 'absolute', top: 0, bottom: 0, backgroundColor: colors.calorie, borderRadius: 5 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  mark: { position: 'absolute', top: -2, bottom: -2, width: 1.5, backgroundColor: colors.border },
});

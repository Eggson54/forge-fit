import React, { useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { BarChart, Card, Screen, SectionHeader, SegmentedControl, StatTile, Text } from '../../src/components/ui';
import { FadeIn } from '../../src/components/anim';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, domainAccent, spacing } from '../../src/theme';
import { formatDayMonth, formatSleep, lastNDays } from '../../src/domain/date';
import { groupThousands } from '../../src/domain/units';
import { movingAverage, ratePerWeek } from '../../src/domain/trend';
import { useLogStore } from '../../src/stores/useLogStore';
import { useProfileStore } from '../../src/stores/useProfileStore';

const WINDOWS = [
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
];

type Metric = 'sleep' | 'steps' | 'water';

const METRICS: { key: Metric; label: string; tint: string }[] = [
  { key: 'sleep', label: 'Sleep', tint: colors.sleep },
  { key: 'steps', label: 'Steps', tint: colors.steps },
  { key: 'water', label: 'Water', tint: colors.water },
];

/**
 * Nutrition has had a trends screen for a while. Sleep, steps and water were
 * logged every day and only ever readable one day at a time.
 */
export default function Habits() {
  const { width } = useWindowDimensions();
  const [days, setDays] = useState(14);
  const [metric, setMetric] = useState<Metric>('sleep');

  const targets = useProfileStore((s) => s.targets);
  const sleepFor = useLogStore((s) => s.sleepForDate);
  const stepsFor = useLogStore((s) => s.stepsForDate);
  const waterFor = useLogStore((s) => s.waterForDate);

  const chartW = width - spacing.xl * 2 - spacing.lg * 2;
  const dates = useMemo(() => lastNDays(days), [days]);

  const current = METRICS.find((m) => m.key === metric)!;
  const target = metric === 'sleep' ? targets.sleepMinutes : metric === 'steps' ? targets.steps : targets.waterOz;

  const values = useMemo(
    () =>
      dates.map((date) => ({
        date,
        value: metric === 'sleep' ? (sleepFor(date) ?? 0) : metric === 'steps' ? (stepsFor(date) ?? 0) : waterFor(date),
      })),
    [dates, metric, sleepFor, stepsFor, waterFor],
  );

  // Days with nothing recorded are excluded from the average rather than
  // counted as zero, which would make a day you forgot to log look like a day
  // you did not sleep.
  const logged = values.filter((v) => v.value > 0);
  const average = logged.length ? Math.round(logged.reduce((a, v) => a + v.value, 0) / logged.length) : 0;
  const hit = logged.filter((v) => v.value >= target).length;
  const rate = useMemo(() => ratePerWeek(logged), [logged]);
  const smoothed = useMemo(() => movingAverage(logged, 7), [logged]);

  const format = (n: number) =>
    metric === 'sleep' ? formatSleep(n) : metric === 'water' ? `${Math.round(n)} oz` : groupThousands(Math.round(n));

  return (
    <Screen gradient>
      <ScreenHeader title="Sleep, steps & water" />

      <SegmentedControl
        options={METRICS.map((m) => ({ label: m.label, value: m.key }))}
        value={metric}
        onChange={(v) => setMetric(v as Metric)}
      />

      <View style={{ marginTop: spacing.md }}>
        <SegmentedControl options={WINDOWS} value={days} onChange={setDays} />
      </View>

      <Card style={{ flexDirection: 'row', marginTop: spacing.md }}>
        <StatTile value={`${logged.length}/${days}`} label="Days logged" accent={colors.primary} />
        <StatTile value={`${hit}/${logged.length}`} label="Target met" accent={current.tint} />
        <StatTile value={average ? format(average) : '—'} label="Average" accent={colors.textDim} />
      </Card>

      <SectionHeader title="Daily" accent={domainAccent.progress} />
      <FadeIn>
        <Card>
          <BarChart
            data={values.map((v) => ({ label: formatDayMonth(v.date).slice(0, 6), value: v.value }))}
            width={chartW}
            color={current.tint}
            targetLine={target}
            format={format}
          />
          <Text variant="caption" color={colors.textFaint} center style={{ marginTop: spacing.sm }}>
            Dashed line = your target ({format(target)})
          </Text>
        </Card>
      </FadeIn>

      <SectionHeader title="Where it is heading" accent={domainAccent.progress} />
      <Card style={{ gap: spacing.sm }}>
        {logged.length < 3 ? (
          <Text variant="caption" color={colors.textFaint}>
            Log a few more days and a trend appears here. Two readings is not a direction.
          </Text>
        ) : (
          <>
            {/* The threshold is proportional, not a flat 0.5: half a minute of
                sleep and half a step are both "no change", and a fixed number
                cannot mean both. */}
            <Text variant="h3">
              {rate == null || Math.abs(rate) < average * 0.02
                ? 'Holding steady'
                : `${rate > 0 ? 'Up' : 'Down'} ${format(Math.abs(rate))} a week`}
            </Text>
            <Text variant="caption" color={colors.textDim}>
              Fitted across every logged day rather than comparing the first with the last, so one unusual{' '}
              {metric === 'sleep' ? 'night' : 'day'} does not become a trend.
            </Text>
            {smoothed.length > 1 && (
              <Text variant="caption" color={colors.textFaint}>
                Seven-day average now: {format(smoothed[smoothed.length - 1]!.value)}.
              </Text>
            )}
          </>
        )}
      </Card>

      <Card tone="alt" style={{ marginTop: spacing.md }}>
        <Text variant="caption" color={colors.textFaint}>
          Days with nothing recorded are left out of the average and the trend. Counting a day you forgot to log
          as a zero would read as {metric === 'sleep' ? 'a night without sleep' : 'a day you never moved'}.
        </Text>
      </Card>
    </Screen>
  );
}

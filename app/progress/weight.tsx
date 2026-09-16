import React, { useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Button, Card, Input, LineChart, Screen, SectionHeader, StatTile, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, spacing } from '../../src/theme';
import { displayWeight, kgToLb, round, toKg } from '../../src/domain/units';
import { useLogStore } from '../../src/stores/useLogStore';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { formatDateWithWeekday, formatDayMonth } from '../../src/domain/date';
import { movingAverage, ratePerWeek } from '../../src/domain/trend';

export default function WeightLog() {
  const { width } = useWindowDimensions();
  const units = useProfileStore((s) => s.profile.units);
  const setProfile = useProfileStore((s) => s.setProfile);
  const weightLogs = useLogStore((s) => s.weight);
  const logWeight = useLogStore((s) => s.logWeight);
  const [value, setValue] = useState('');

  const save = () => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    const kg = round(toKg(num, units), 1);
    logWeight(kg);
    setProfile({ weightKg: kg });
    setValue('');
  };

  const chartW = width - spacing.xl * 2 - spacing.lg * 2;

  const chronological = useMemo(
    () => [...weightLogs].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-30),
    [weightLogs],
  );

  const toDisplay = (kg: number) => (units === 'imperial' ? round(kgToLb(kg), 1) : round(kg, 1));
  const series = chronological.map((w) => ({ label: formatDayMonth(w.date), value: toDisplay(w.weightKg) }));

  // The average is computed in kg and converted once, so the smoothing is the
  // same curve whichever units the athlete reads.
  const averageKg = useMemo(
    () => movingAverage(chronological.map((w) => ({ date: w.date, value: w.weightKg })), 7),
    [chronological],
  );
  const averageSeries = averageKg.map((p) => ({ label: formatDayMonth(p.date), value: toDisplay(p.value) }));

  const rateKgPerWeek = useMemo(
    () => ratePerWeek(chronological.map((w) => ({ date: w.date, value: w.weightKg }))),
    [chronological],
  );
  const rate = rateKgPerWeek == null ? null : toDisplay(rateKgPerWeek);
  const latestAvg = averageSeries[averageSeries.length - 1]?.value ?? null;
  const unitLabel = units === 'imperial' ? 'lb' : 'kg';

  return (
    <Screen gradient>
      <ScreenHeader title="Weight" />
      <Card>
        <LineChart
          data={series}
          overlay={averageSeries}
          overlayColor={colors.protein}
          color={colors.textDim}
          width={chartW}
          unit={` ${unitLabel}`}
        />
        <Text variant="caption" color={colors.textFaint} center style={{ marginTop: spacing.sm }}>
          Faint line: each weigh-in. Solid line: 7-day average.
        </Text>
      </Card>

      {chronological.length >= 2 && (
        <Card style={{ flexDirection: 'row', marginTop: spacing.md }}>
          <StatTile
            value={latestAvg != null ? `${latestAvg}` : '—'}
            label={`7-day avg (${unitLabel})`}
            accent={colors.protein}
          />
          <StatTile
            value={rate == null ? '—' : `${rate > 0 ? '+' : ''}${rate}`}
            label={`Per week (${unitLabel})`}
            accent={colors.water}
          />
          <StatTile value={`${chronological.length}`} label="Weigh-ins" accent={colors.textDim} />
        </Card>
      )}

      <Card tone="alt" style={{ marginTop: spacing.md }}>
        <Text variant="caption" color={colors.textDim}>
          A scale reading moves a pound or two with water, salt and food in transit. The weekly rate is fitted across
          every weigh-in rather than comparing two of them, so one heavy morning does not become a trend.
        </Text>
      </Card>

      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Input label="Log today's weight" value={value} onChangeText={setValue} keyboardType="decimal-pad" suffix={units === 'imperial' ? 'lb' : 'kg'} />
        </View>
        <Button title="Save" fullWidth={false} onPress={save} style={{ minWidth: 100 }} />
      </View>

      <SectionHeader title="History" />
      <Card>
        {weightLogs.slice(0, 20).map((w, i) => {
          const d = displayWeight(w.weightKg, units);
          return (
            <View key={w.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: i === Math.min(19, weightLogs.length - 1) ? 0 : 0.5, borderBottomColor: colors.border }}>
              <Text variant="body" color={colors.textDim}>
                {formatDateWithWeekday(w.date)}
              </Text>
              <Text variant="bodyStrong">
                {d.value} {d.unit}
              </Text>
            </View>
          );
        })}
        {weightLogs.length === 0 && (
          <Text variant="caption" color={colors.textFaint}>
            No entries yet.
          </Text>
        )}
      </Card>
    </Screen>
  );
}

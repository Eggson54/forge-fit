import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { BarChart, Card, Screen, SectionHeader, SegmentedControl, StatTile, Text, type Point } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { FadeIn } from '../../src/components/anim';
import { colors, radius, spacing } from '../../src/theme';
import { formatDayMonth, lastNDays } from '../../src/domain/date';
import { summariseIntake, type DailyIntake } from '../../src/domain/nutrition';
import { useLogStore } from '../../src/stores/useLogStore';
import { useProfileStore } from '../../src/stores/useProfileStore';

const WINDOWS = [
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
];

type Metric = 'calories' | 'proteinG' | 'carbsG' | 'fatG';

const METRICS: { key: Metric; label: string; color: string; unit: string }[] = [
  { key: 'calories', label: 'Calories', color: colors.calorie, unit: 'kcal' },
  { key: 'proteinG', label: 'Protein', color: colors.protein, unit: 'g' },
  { key: 'carbsG', label: 'Carbs', color: colors.carbs, unit: 'g' },
  { key: 'fatG', label: 'Fat', color: colors.fat, unit: 'g' },
];

export default function NutritionTrends() {
  const { width } = useWindowDimensions();
  const chartW = width - spacing.xl * 2 - spacing.lg * 2;

  const targets = useProfileStore((s) => s.targets);
  const nutrition = useLogStore((s) => s.nutrition);
  const macrosForDate = useLogStore((s) => s.macrosForDate);

  const [days, setDays] = useState(14);
  const [metric, setMetric] = useState<Metric>('calories');

  const intake: DailyIntake[] = useMemo(() => {
    const logged = new Set(nutrition.map((n) => n.date));
    return lastNDays(days).map((date) => {
      const m = macrosForDate(date);
      return {
        date,
        calories: m.calories,
        proteinG: m.proteinG,
        carbsG: m.carbsG,
        fatG: m.fatG,
        logged: logged.has(date),
      };
    });
    // macrosForDate is a stable store selector; the data it reads is `nutrition`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nutrition, days]);

  const summary = useMemo(() => summariseIntake(intake, targets), [intake, targets]);
  const active = METRICS.find((m) => m.key === metric)!;
  const target = metric === 'calories' ? targets.calories : targets[metric];

  // Unlogged days are drawn as zero bars, which is honest: nothing was
  // recorded. They are excluded from the averages for the same reason.
  const series: Point[] = intake.map((d) => ({ label: formatDayMonth(d.date), value: Math.round(d[metric]) }));

  const avg = metric === 'calories' ? summary.avgCalories : summary[`avg${cap(metric)}` as 'avgProteinG'];
  const delta = Math.round(avg - target);

  return (
    <Screen gradient>
      <ScreenHeader title="Nutrition Trends" />

      <SegmentedControl options={WINDOWS} value={days} onChange={setDays} />

      <Card style={{ flexDirection: 'row', marginTop: spacing.md }}>
        <StatTile value={`${summary.loggedDays}/${days}`} label="Days logged" accent={colors.primary} />
        {/* Out of the days actually logged, not out of the window: a bare "0"
            beside "14/14 days logged" reads as a broken counter rather than a
            real result. */}
        <StatTile
          value={`${summary.proteinHits}/${summary.loggedDays}`}
          label="Protein hit"
          accent={colors.protein}
        />
        <StatTile
          value={`${summary.calorieHits}/${summary.loggedDays}`}
          label="Calories on target"
          accent={colors.calorie}
        />
      </Card>

      {summary.loggedDays === 0 ? (
        <Card style={{ marginTop: spacing.md }}>
          <Text variant="bodyStrong">Nothing logged in this window</Text>
          <Text variant="caption" color={colors.textDim} style={{ marginTop: spacing.xs }}>
            Log a few days of food and the averages here start to mean something.
          </Text>
        </Card>
      ) : (
        <>
          <SectionHeader title="Daily intake" />
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
            {METRICS.map((m) => (
              <Pressable
                key={m.key}
                onPress={() => setMetric(m.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: metric === m.key }}
                style={[styles.tab, metric === m.key && { backgroundColor: m.color }]}
              >
                <Text variant="caption" color={metric === m.key ? colors.onPrimary : colors.textDim}>
                  {m.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <FadeIn>
            <Card>
              <BarChart data={series} width={chartW} color={active.color} targetLine={target} />
              <Text variant="caption" color={colors.textFaint} center style={{ marginTop: spacing.sm }}>
                Dashed line = your {active.label.toLowerCase()} target ({target} {active.unit})
              </Text>
            </Card>
          </FadeIn>

          <SectionHeader title="Average on logged days" />
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
              <Text variant="metricLg" color={active.color}>
                {Math.round(avg)}
              </Text>
              <Text variant="bodyStrong" color={colors.textDim}>
                {active.unit}
              </Text>
              <View style={{ flex: 1 }} />
              <Text variant="bodyStrong" color={deltaColor(metric, delta, target)}>
                {delta > 0 ? '+' : ''}
                {delta} vs target
              </Text>
            </View>
            <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
              Averaged over the {summary.loggedDays} day{summary.loggedDays === 1 ? '' : 's'} you logged. Days with
              nothing recorded are left out — counting them as zero would make a missed day look like a fast.
            </Text>
          </Card>

          <SectionHeader title="Macro split" />
          <Card>
            <MacroSplit summary={summary} />
          </Card>
        </>
      )}
    </Screen>
  );
}

function MacroSplit({ summary }: { summary: ReturnType<typeof summariseIntake> }) {
  // By calories, not by grams: 30g of fat is more than twice the energy of 30g
  // of protein, so a gram split misrepresents where the calories came from.
  const p = summary.avgProteinG * 4;
  const c = summary.avgCarbsG * 4;
  const f = summary.avgFatG * 9;
  const total = p + c + f || 1;
  const parts = [
    { label: 'Protein', value: p, color: colors.protein },
    { label: 'Carbs', value: c, color: colors.carbs },
    { label: 'Fat', value: f, color: colors.fat },
  ];

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.splitBar}>
        {parts.map((part) => (
          <View key={part.label} style={{ flex: part.value / total, backgroundColor: part.color }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {parts.map((part) => (
          <View key={part.label} style={{ alignItems: 'center' }}>
            <Text variant="bodyStrong" color={part.color}>
              {Math.round((part.value / total) * 100)}%
            </Text>
            <Text variant="caption" color={colors.textDim}>
              {part.label}
            </Text>
          </View>
        ))}
      </View>
      <Text variant="caption" color={colors.textFaint}>
        Share of calories, not of grams — a gram of fat carries more than twice the energy of a gram of protein.
      </Text>
    </View>
  );
}

/** Over on calories is a different thing from over on protein. */
function deltaColor(metric: Metric, delta: number, target: number): string {
  if (Math.abs(delta) <= target * 0.05) return colors.success;
  if (metric === 'proteinG') return delta > 0 ? colors.success : colors.warning;
  return colors.warning;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const styles = StyleSheet.create({
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
  },
  splitBar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden' },
});

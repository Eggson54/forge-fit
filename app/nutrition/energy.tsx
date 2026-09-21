import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, EmptyState, LinearProgress, Screen, SectionHeader, StatTile, Text } from '../../src/components/ui';
import { LineChart } from '../../src/components/ui/Charts';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { FadeIn } from '../../src/components/anim';
import { Icon } from '../../src/components/Icon';
import { colors, domainAccent, radius, spacing } from '../../src/theme';
import { formatDayMonth } from '../../src/domain/date';
import { displayWeight, groupThousands } from '../../src/domain/units';
import { maintenanceCalories } from '../../src/domain/nutrition';
import {
  CONFIDENCE_BLURB,
  CONFIDENCE_LABEL,
  ENERGY_CAVEAT,
  calorieFloor,
  dailyCalories,
  energyGap,
  formulaGap,
  intakeForRate,
  observedTdee,
  rateForIntake,
  usualRateRange,
  weeksToGoal,
} from '../../src/domain/energyBalance';
import { useLogStore } from '../../src/stores/useLogStore';
import { useProfileStore } from '../../src/stores/useProfileStore';

/**
 * Maintenance calories, measured rather than predicted.
 *
 * The formula on the goals screen is a starting guess. This screen replaces it
 * with the answer the user's own logs give, once there is enough of them — and
 * says plainly when there is not, instead of showing a number built on four
 * days and two weigh-ins.
 */
export default function EnergyBalance() {
  const profile = useProfileStore((s) => s.profile);
  const targets = useProfileStore((s) => s.targets);
  const setTargets = useProfileStore((s) => s.setTargets);
  const nutrition = useLogStore((s) => s.nutrition);
  const weights = useLogStore((s) => s.weight);
  const latestWeightKg = useLogStore((s) => s.latestWeightKg());
  const units = profile.units;

  const estimate = useMemo(() => observedTdee(nutrition, weights), [nutrition, weights]);
  const gap = useMemo(() => energyGap(nutrition, weights), [nutrition, weights]);
  const intakeDays = useMemo(() => dailyCalories(nutrition).slice(-28), [nutrition]);

  const bodyweight = latestWeightKg ?? profile.weightKg ?? 75;
  const band = usualRateRange(bodyweight);
  const rates = useMemo(
    () => [band.minKgPerWeek, band.minKgPerWeek / 2, 0, band.maxKgPerWeek],
    [band.minKgPerWeek, band.maxKgPerWeek],
  );
  // Opens on a moderate rate toward the target they set, or on maintenance
  // when they have not set one. It has to be a value the row of chips holds,
  // or nothing reads as selected.
  const [rate, setRate] = useState<number>(() =>
    profile.targetWeightKg != null && profile.targetWeightKg < bodyweight ? band.minKgPerWeek / 2 : 0,
  );

  const formula = maintenanceCalories(profile);
  const against = estimate ? formulaGap(estimate.kcal, formula) : null;
  const floor = calorieFloor(profile.sex);

  // The planner reads a rate off the row of chips; index -1 means "maintenance".
  const chosenRate = rates.includes(rate) ? rate : 0;
  const planIntake = estimate ? Math.max(floor, intakeForRate(estimate.kcal, chosenRate)) : null;
  const planRate = estimate && planIntake ? rateForIntake(estimate.kcal, planIntake) : chosenRate;
  const weeks =
    profile.targetWeightKg != null ? weeksToGoal(bodyweight, profile.targetWeightKg, planRate) : null;
  const clampedByFloor = estimate != null && planIntake === floor && intakeForRate(estimate.kcal, chosenRate) < floor;

  const apply = () => {
    if (!planIntake) return;
    Alert.alert(
      'Use this as your calorie target?',
      `Your daily target becomes ${groupThousands(planIntake)} kcal. Protein, carbs and fat stay where you set them.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Set target',
          onPress: () => {
            setTargets({ calories: planIntake });
            router.back();
          },
        },
      ],
    );
  };

  return (
    <Screen gradient>
      <ScreenHeader title="Energy balance" subtitle="Maintenance, measured from your own logs" />

      {!estimate ? (
        <>
          <EmptyState
            icon="flame"
            title="Not enough logged yet"
            subtitle="This one is arithmetic on your own history: average intake against the slope of your weigh-ins. It needs a few weeks of both before it can say anything honest."
            action="Log today's food"
            onAction={() => router.push('/nutrition/add')}
          />
          <SectionHeader title="What it still needs" accent={domainAccent.nutrition} />
          <Card style={{ gap: spacing.md }}>
            <Need label="Days with food logged" have={gap.haveDaysLogged} need={gap.needDaysLogged} />
            <Need label="Weigh-ins" have={gap.haveWeighIns} need={gap.needWeighIns} />
            <Need label="Days between first and last weigh-in" have={gap.haveSpanDays} need={gap.needSpanDays} />
            <Text variant="caption" color={colors.textFaint}>
              Until then the goals screen uses the Mifflin-St Jeor formula, which puts your
              maintenance near {groupThousands(formula)} kcal. It is a starting guess, not a reading.
            </Text>
          </Card>
        </>
      ) : (
        <>
          <FadeIn>
            <Card style={{ gap: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: `${colors.primary}44` }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
                <Text variant="display" color={colors.primary}>{groupThousands(estimate.kcal)}</Text>
                <Text variant="title" color={colors.textDim} style={{ paddingBottom: 6 }}>kcal</Text>
                <View style={{ flex: 1, minWidth: 0, paddingBottom: 8, alignItems: 'flex-end' }}>
                  <View style={[styles.pill, { backgroundColor: `${confidenceTint(estimate.confidence)}22` }]}>
                    <Text variant="caption" color={confidenceTint(estimate.confidence)}>
                      {CONFIDENCE_LABEL[estimate.confidence]}
                    </Text>
                  </View>
                  <Text variant="caption" color={colors.textFaint}>your maintenance</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: spacing.md }}>
                <StatTile value={groupThousands(estimate.meanIntake)} label="Avg intake" accent={colors.carbs} />
                <StatTile
                  value={`${estimate.trend.kgPerWeek > 0 ? '+' : '−'}${displayWeight(Math.abs(estimate.trend.kgPerWeek), units).value}`}
                  label={`${displayWeight(1, units).unit}/week`}
                  accent={estimate.trend.kgPerWeek < 0 ? colors.success : colors.amber}
                />
                <StatTile value={`${estimate.daysLogged}`} label={`Days of ${estimate.windowDays}`} accent={colors.textDim} />
              </View>

              <Text variant="caption" color={colors.textFaint}>
                {CONFIDENCE_BLURB[estimate.confidence]}
              </Text>
            </Card>
          </FadeIn>

          {against && (
            <Card tone="alt" style={{ gap: spacing.sm, marginBottom: spacing.md }}>
              <Text variant="overline" color={colors.textDim}>AGAINST THE FORMULA</Text>
              <Text variant="body" color={colors.text}>
                {against.verdict === 'close'
                  ? `Within ${Math.abs(against.pct)}% of the ${groupThousands(formula)} kcal the formula predicted. The guess was a good one.`
                  : `${Math.abs(against.deltaKcal)} kcal ${against.verdict} than the ${groupThousands(formula)} the formula predicted — about ${Math.abs(against.pct)}%.`}
              </Text>
              {against.verdict !== 'close' && (
                <Text variant="caption" color={colors.textFaint}>
                  That is normal. The formula multiplies a resting rate by an activity band, and the
                  bands are wide; your own numbers are the better answer.
                </Text>
              )}
            </Card>
          )}

          <SectionHeader title="What a target would do" accent={domainAccent.nutrition} />
          <Card style={{ gap: spacing.md, marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {rates.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setRate(r)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: r === chosenRate }}
                  style={[styles.rate, r === chosenRate && { backgroundColor: `${colors.primary}22`, borderColor: colors.primary }]}
                >
                  <Text variant="label" color={r === chosenRate ? colors.primary : colors.textDim} center>
                    {rateLabel(r, units)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
              <Text variant="metric" color={colors.text}>{groupThousands(planIntake!)}</Text>
              <Text variant="caption" color={colors.textFaint}>kcal a day</Text>
              {targets.calories !== planIntake && (
                <Text variant="caption" color={colors.textFaint} style={{ marginLeft: 'auto' }}>
                  now {groupThousands(targets.calories)}
                </Text>
              )}
            </View>

            {clampedByFloor && (
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
                <Icon name="shield" size={14} color={colors.amber} />
                <Text variant="caption" color={colors.amber} style={{ flex: 1, minWidth: 0 }}>
                  That rate would put you under {groupThousands(floor)} kcal, which this app will not
                  suggest. Held at the floor — the rate above is what it actually produces.
                </Text>
              </View>
            )}

            {weeks != null && weeks > 0 && profile.targetWeightKg != null && (
              <Text variant="caption" color={colors.textFaint}>
                About {Math.round(weeks)} weeks to {displayWeight(profile.targetWeightKg, units).value}{' '}
                {displayWeight(profile.targetWeightKg, units).unit} at this rate, if it holds.
              </Text>
            )}
            {profile.targetWeightKg == null && (
              <Pressable onPress={() => router.push('/settings/goals')} accessibilityRole="link">
                <Text variant="caption" color={colors.primary}>Set a target weight to see how long ›</Text>
              </Pressable>
            )}

            <Button title="Use as my calorie target" onPress={apply} disabled={targets.calories === planIntake} />
          </Card>

          {intakeDays.length >= 2 && (
            <>
              <SectionHeader title="Intake, last four weeks" accent={domainAccent.nutrition} />
              <Card style={{ gap: spacing.sm, marginBottom: spacing.md }}>
                <LineChart
                  data={intakeDays.map((d) => ({ label: formatDayMonth(d.date), value: d.calories }))}
                  width={300}
                  color={colors.carbs}
                />
                <Text variant="caption" color={colors.textFaint}>
                  Days with nothing logged are missing from this line rather than drawn as zero —
                  counting them as a fast is what makes a maintenance figure come out hundreds low.
                </Text>
              </Card>
            </>
          )}
        </>
      )}

      <Card tone="alt" style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="shield" size={14} color={colors.textDim} />
          <Text variant="overline" color={colors.textDim}>HOW TO READ THIS</Text>
        </View>
        <Text variant="caption" color={colors.textFaint}>{ENERGY_CAVEAT}</Text>
      </Card>

      <Pressable
        onPress={() => router.push('/progress/weight')}
        accessibilityRole="link"
        accessibilityLabel="Go to weight log"
        style={{ paddingVertical: spacing.lg }}
      >
        <Text variant="label" color={colors.primary} center>Log a weigh-in ›</Text>
      </Pressable>
    </Screen>
  );
}

/** One requirement, with how close it is. */
function Need({ label, have, need }: { label: string; have: number; need: number }) {
  const done = have >= need;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row' }}>
        <Text variant="caption" color={colors.textDim} style={{ flex: 1, minWidth: 0 }}>{label}</Text>
        <Text variant="caption" color={done ? colors.success : colors.textFaint}>
          {have} / {need}
        </Text>
      </View>
      <LinearProgress progress={Math.min(1, need === 0 ? 1 : have / need)} color={done ? colors.success : colors.primary} />
    </View>
  );
}

function rateLabel(kgPerWeek: number, units: 'imperial' | 'metric'): string {
  if (kgPerWeek === 0) return 'Hold';
  const { value, unit } = displayWeight(Math.abs(kgPerWeek), units);
  return `${kgPerWeek < 0 ? '−' : '+'}${value} ${unit}`;
}

function confidenceTint(c: 'low' | 'fair' | 'good'): string {
  return c === 'good' ? colors.success : c === 'fair' ? colors.lime : colors.amber;
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, marginBottom: 2 },
  rate: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
});

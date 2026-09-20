import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Card, EmptyState, Screen, SectionHeader, SegmentedControl, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { FadeIn } from '../../src/components/anim';
import { Icon } from '../../src/components/Icon';
import { colors, domainAccent, radius, spacing } from '../../src/theme';
import { displayWeight } from '../../src/domain/units';
import { bestE1RMForExercise } from '../../src/domain/strength';
import {
  LEVEL_BLURB,
  LEVEL_LABEL,
  LEVEL_SHORT,
  LEVEL_TINT,
  STANDARDS_CAVEAT,
  STRENGTH_LEVELS,
  defaultColumn,
  summariseStandards,
  type StandardResult,
  type StandardsColumn,
  type StrengthLevel,
} from '../../src/domain/standards';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';

/**
 * Where your lifts sit against relative-strength bands.
 *
 * The screen is careful about two things. It never grades without a bodyweight
 * on file, because a ratio against an assumed bodyweight is a number that looks
 * like data and is not. And the reference column is a control the athlete
 * operates, not a fact the app decides from a profile field.
 */
export default function Standards() {
  const profile = useProfileStore((s) => s.profile);
  const workouts = useWorkoutStore((s) => s.completedWorkouts());
  const units = profile.units;
  const bodyweightKg = profile.weightKg ?? null;

  const [column, setColumn] = useState<StandardsColumn>(defaultColumn(profile.sex));

  const summary = useMemo(
    () => summariseStandards((id) => bestE1RMForExercise(workouts, id), bodyweightKg, column),
    [workouts, bodyweightKg, column],
  );

  const bw = bodyweightKg != null ? displayWeight(bodyweightKg, units) : null;

  return (
    <Screen gradient>
      <ScreenHeader
        title="Strength standards"
        subtitle={bw ? `Against ${bw.value} ${bw.unit} of bodyweight` : undefined}
      />

      {bodyweightKg == null ? (
        <EmptyState
          icon="scale"
          title="Log a bodyweight first"
          subtitle="Every band here is a multiple of what you weigh, so there is nothing honest to show until the app knows that."
          action="Log your weight"
          onAction={() => router.push('/progress/weight')}
        />
      ) : (
        <>
          <Card style={{ gap: spacing.md, marginBottom: spacing.md }}>
            <Text variant="overline" color={colors.textFaint}>COMPARE AGAINST</Text>
            <SegmentedControl
              options={[
                { label: 'Male bands', value: 'male' },
                { label: 'Female bands', value: 'female' },
              ]}
              value={column}
              onChange={(c) => setColumn(c as StandardsColumn)}
            />
            <Text variant="caption" color={colors.textFaint}>
              Relative-strength distributions differ, so the tables do too. Pick whichever you want
              to be measured against — the app does not decide it for you.
            </Text>
          </Card>

          {summary.overall && (
            <FadeIn>
              <Card
                style={{
                  gap: spacing.sm,
                  marginBottom: spacing.md,
                  borderWidth: 1,
                  borderColor: `${LEVEL_TINT[summary.overall]}55`,
                }}
              >
                <Text variant="overline" color={colors.textFaint}>ACROSS YOUR LIFTS</Text>
                <Text variant="display" color={LEVEL_TINT[summary.overall]}>
                  {LEVEL_LABEL[summary.overall]}
                </Text>
                <Text variant="body" color={colors.textDim}>
                  {LEVEL_BLURB[summary.overall]}
                </Text>
                {/* The median, said out loud — otherwise one huge deadlift
                    looks like it promoted everything. */}
                <Text variant="caption" color={colors.textFaint}>
                  The middle of your {summary.results.length} graded lifts, not the best of them.
                </Text>
              </Card>
            </FadeIn>
          )}

          <Ladder />

          {summary.results.length > 0 && (
            <>
              <SectionHeader title="Lift by lift" accent={domainAccent.training} />
              <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
                {summary.results.map((r, i) => (
                  <LiftRow key={r.lift.exerciseId} result={r} units={units} last={i === summary.results.length - 1} />
                ))}
              </Card>
            </>
          )}

          {summary.missing.length > 0 && (
            <>
              <SectionHeader title="Not logged yet" accent={domainAccent.training} />
              <Card style={{ gap: spacing.sm, marginBottom: spacing.md }}>
                <Text variant="caption" color={colors.textDim}>
                  These fill in the first time you complete a working set of them.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  {summary.missing.map((l) => (
                    <Pressable
                      key={l.exerciseId}
                      onPress={() => router.push(`/exercise/${l.exerciseId}`)}
                      accessibilityRole="link"
                      accessibilityLabel={`${l.name}, not logged yet`}
                      style={styles.chip}
                    >
                      <Text variant="caption" color={colors.textDim}>{l.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </Card>
            </>
          )}

          <Card tone="alt">
            <Text variant="caption" color={colors.textFaint}>{STANDARDS_CAVEAT}</Text>
          </Card>
        </>
      )}
    </Screen>
  );
}

/** The five bands as a key, so a colour on a row means something. */
function Ladder() {
  return (
    <View style={{ flexDirection: 'row', gap: 4, marginBottom: spacing.lg }}>
      {STRENGTH_LEVELS.map((level) => (
        <View key={level} style={{ flex: 1, gap: 4 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: LEVEL_TINT[level] }} />
          <Text variant="caption" color={colors.textFaint} center style={{ fontSize: 9 }} numberOfLines={1}>
            {LEVEL_SHORT[level]}
          </Text>
        </View>
      ))}
    </View>
  );
}

function LiftRow({
  result,
  units,
  last,
}: {
  result: StandardResult;
  units: 'imperial' | 'metric';
  last: boolean;
}) {
  const e1rm = displayWeight(result.e1RMKg, units);
  const toNext = result.toNextKg != null ? displayWeight(result.toNextKg, units) : null;
  const tint = LEVEL_TINT[result.level];

  return (
    <Pressable
      onPress={() => router.push(`/exercise/${result.lift.exerciseId}`)}
      accessibilityRole="link"
      accessibilityLabel={`${result.lift.name}: ${result.ratio} times bodyweight, ${LEVEL_LABEL[result.level]}`}
      style={[styles.row, !last && styles.divider]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
        <Text variant="label" style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
          {result.lift.name}
        </Text>
        {/* Two places always: a column reading 1.44, 1.17, 1.8 looks like two
            different precisions. */}
        <Text variant="bodyStrong" color={tint}>
          {result.ratio.toFixed(2)}×
        </Text>
      </View>

      {/* One bar across all five bands, with the marker where the lift sits.
          A per-band bar would hide how far apart the bands actually are. */}
      <View style={{ flexDirection: 'row', gap: 3, marginTop: 6 }}>
        {STRENGTH_LEVELS.map((level) => {
          const index = STRENGTH_LEVELS.indexOf(level);
          const current = STRENGTH_LEVELS.indexOf(result.level);
          const fill = index < current ? 1 : index === current ? result.progress : 0;
          return (
            <View key={level} style={styles.band}>
              <View
                style={{
                  width: `${fill * 100}%`,
                  height: '100%',
                  borderRadius: 3,
                  backgroundColor: LEVEL_TINT[level],
                  opacity: index === current ? 1 : 0.4,
                }}
              />
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 6 }}>
        <Text variant="caption" color={colors.textDim} style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
          {LEVEL_LABEL[result.level]} · best {e1rm.value} {e1rm.unit} e1RM
        </Text>
        {toNext && result.nextLevel ? (
          <Text variant="caption" color={colors.textFaint} numberOfLines={1}>
            +{toNext.value} {toNext.unit} to {LEVEL_LABEL[result.nextLevel as StrengthLevel]}
          </Text>
        ) : (
          <Icon name="trophy" size={13} color={LEVEL_TINT.elite} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: spacing.md },
  divider: { borderBottomWidth: 0.5, borderBottomColor: colors.border },
  band: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});

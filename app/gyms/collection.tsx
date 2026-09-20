import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Card, EmptyState, LinearProgress, Screen, SectionHeader, Text } from '../../src/components/ui';
import { FadeIn } from '../../src/components/anim';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { RARITY_COLOR } from '../../src/components/GymMap';
import { colors, radius, spacing } from '../../src/theme';
import { formatDayMonth } from '../../src/domain/date';
import {
  EXPLORER_TIERS,
  KIND_LABEL,
  RARITY_LABEL,
  rarityOf,
  type GymRarity,
} from '../../src/domain/gyms';
import { useGymStore } from '../../src/stores/useGymStore';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';
import { homeGym, sessionsByGym } from '../../src/domain/gymStats';

const RARITIES: GymRarity[] = ['common', 'uncommon', 'rare', 'legendary'];

export default function Collection() {
  const claims = useGymStore((s) => s.claims);
  const gymsById = useGymStore((s) => s.gymsById());
  const summary = useGymStore((s) => s.summary());

  const workouts = useWorkoutStore((s) => s.workouts);
  const located = useMemo(() => sessionsByGym(workouts), [workouts]);
  const home = useMemo(() => homeGym(workouts), [workouts]);

  const rows = useMemo(
    () =>
      [...claims]
        .sort((a, b) => (a.claimedAt < b.claimedAt ? 1 : -1))
        .map((c) => ({ claim: c, gym: gymsById[c.gymId] }))
        .filter((r) => r.gym),
    [claims, gymsById],
  );

  return (
    <Screen gradient>
      <ScreenHeader title="Collection" />

      <FadeIn>
        <Card style={{ gap: spacing.md }}>
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text variant="overline" color={colors.textFaint}>EXPLORER TIER</Text>
            <Text variant="display" color={summary.tier.color}>{summary.tier.name}</Text>
            <Text variant="caption" color={colors.textDim}>{summary.tier.blurb}</Text>
          </View>

          <View style={{ gap: 6 }}>
            {/* The tier's own colour, the same one the name is set in — an
                orange bar under a blue tier name looked like two readings. */}
            <LinearProgress progress={summary.progress} color={summary.tier.color} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="caption" color={colors.textFaint}>{summary.points} pts</Text>
              <Text variant="caption" color={colors.textFaint}>
                {summary.nextTier ? `${summary.nextTier.min - summary.points} to ${summary.nextTier.name}` : 'Top tier'}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: spacing.md }}>
            <Stat value={summary.claimed} label="Gyms" />
            <Stat value={summary.visits} label="Visits" />
            <Stat value={Object.keys(summary.byKind).length} label="Kinds" />
          </View>
        </Card>
      </FadeIn>

      {located.length > 0 && (
        <>
          <SectionHeader title="Where you train" />
          <Card style={{ gap: spacing.md }}>
            {/* One stacked bar of sessions, the same read as the muscle split
                on a finished workout. */}
            <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden' }}>
              {located.map((g, i) => (
                <View
                  key={g.gymId}
                  style={{
                    flex: Math.max(0.001, g.share),
                    backgroundColor: SPLIT_COLORS[i % SPLIT_COLORS.length],
                  }}
                />
              ))}
            </View>
            {located.map((g, i) => (
              <Pressable
                key={g.gymId}
                onPress={() => router.push(`/gyms/${g.gymId}`)}
                accessibilityRole="link"
                accessibilityLabel={`${g.gymName}, ${g.sessions} sessions`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 34 }}
              >
                <View
                  style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SPLIT_COLORS[i % SPLIT_COLORS.length] }}
                />
                <Text variant="body" style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
                  {g.gymName}
                </Text>
                <Text variant="label">{g.sessions}</Text>
                <Text variant="caption" color={colors.textFaint} style={{ width: 62, textAlign: 'right' }}>
                  {g.sets} sets
                </Text>
              </Pressable>
            ))}
            <Text variant="caption" color={colors.textFaint}>
              {home
                ? `Most of your work happens at ${home.gymName}.`
                : 'Sessions are tagged with the claimed gym you were standing in when you finished them.'}
            </Text>
          </Card>
        </>
      )}

      <SectionHeader title="By rarity" />
      <Card style={{ gap: spacing.md }}>
        {RARITIES.map((r) => (
          <View key={r} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: RARITY_COLOR[r] }} />
            <Text variant="body" style={{ flex: 1, minWidth: 0 }}>{RARITY_LABEL[r]}</Text>
            <Text variant="label" color={summary.byRarity[r] > 0 ? colors.text : colors.textFaint}>
              {summary.byRarity[r]}
            </Text>
          </View>
        ))}
      </Card>

      {summary.missingKinds.length > 0 && (
        <>
          <SectionHeader title="Still to find" />
          <Card style={{ gap: spacing.sm }}>
            <Text variant="caption" color={colors.textFaint}>
              Kinds of gym you have not claimed yet, rarest first. These are not tasks — just the gaps.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs }}>
              {summary.missingKinds.map((k) => (
                <View key={k} style={styles.tag}>
                  <Text variant="caption" color={colors.textDim}>{KIND_LABEL[k]}</Text>
                </View>
              ))}
            </View>
          </Card>
        </>
      )}

      <SectionHeader title={`Claimed · ${rows.length}`} />
      {rows.length === 0 ? (
        <EmptyState
          icon="target"
          title="Nothing claimed yet"
          subtitle="Open the map, go and train somewhere, and claim it while you are there."
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {rows.map(({ claim, gym }, i) => {
            const tint = RARITY_COLOR[rarityOf(gym!)];
            return (
              <FadeIn key={claim.gymId} delay={Math.min(200, i * 25)}>
                <Card
                  onPress={() => router.push(`/gyms/${claim.gymId}`)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
                >
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tint }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>{gym!.name}</Text>
                    <Text variant="caption" color={colors.textDim} numberOfLines={1}>
                      {KIND_LABEL[gym!.kind]} · claimed {formatDayMonth(claim.claimedAt)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text variant="label" color={tint}>{claim.pointsEarned}</Text>
                    <Text variant="caption" color={colors.textFaint}>
                      {claim.visits.length} {claim.visits.length === 1 ? 'visit' : 'visits'}
                    </Text>
                  </View>
                </Card>
              </FadeIn>
            );
          })}
        </View>
      )}

      <SectionHeader title="Tiers" />
      <Card style={{ gap: spacing.md }}>
        {EXPLORER_TIERS.map((t) => {
          const reached = summary.points >= t.min;
          return (
            <View key={t.key} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: reached ? t.color : 'transparent',
                  borderWidth: reached ? 0 : 1,
                  borderColor: colors.border,
                }}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="bodyStrong" color={reached ? t.color : colors.textDim}>{t.name}</Text>
                <Text variant="caption" color={colors.textFaint}>{t.blurb}</Text>
              </View>
              <Text variant="caption" color={colors.textFaint}>{t.min} pts</Text>
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text variant="metric">{value}</Text>
      <Text variant="caption" color={colors.textFaint}>{label}</Text>
    </View>
  );
}

const styles = {
  tag: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
};

/** Distinct hues for the split bar, matching the one on a finished workout. */
const SPLIT_COLORS = [
  colors.primary,
  colors.water,
  colors.success,
  colors.amber,
  colors.protein,
  colors.steps,
  '#C084FC',
  '#7FB2FF',
];

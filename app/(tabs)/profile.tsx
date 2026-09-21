import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, IconButton, ListRow, Screen, SectionHeader, Text } from '../../src/components/ui';
import { FadeIn } from '../../src/components/anim';
import { Avatar } from '../../src/components/Avatar';
import { Icon } from '../../src/components/Icon';
import { Masthead } from '../../src/components/Masthead';
import { RankCard } from '../../src/components/RankCard';
import { colors, domainAccent, radius, spacing } from '../../src/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { displayWeight } from '../../src/domain/units';
import { BIG3_LIFT_IDS, computeRank } from '../../src/domain/rank';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useGymStore } from '../../src/stores/useGymStore';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';
import { useGamificationStore } from '../../src/stores/useGamificationStore';


export default function Profile() {
  const user = useAuthStore((s) => s.user);
  const profile = useProfileStore((s) => s.profile);
  const isPro = useProfileStore((s) => s.isPro());
  const protocolEnabled = useProfileStore((s) => s.protocolFeatureEnabled);
  const workouts = useWorkoutStore((s) => s.completedWorkouts().length);
  const prs = useWorkoutStore((s) => s.prs);
  const streak = useGamificationStore((s) => s.streaks.daily);
  const longestStreak = useGamificationStore((s) => s.streaks.longestDaily);
  const bestDiscipline = useGamificationStore((s) => s.bestDisciplineScore);

  const weight = profile.weightKg ? displayWeight(profile.weightKg, profile.units) : null;

  const gymSummary = useGymStore((s) => s.summary());

  const rank = computeRank({
    completedWorkouts: workouts,
    longestDailyStreak: longestStreak,
    bestBig3E1RMKg: BIG3_LIFT_IDS.reduce((sum, id) => sum + (prs[id] ?? 0), 0),
    bodyweightKg: profile.weightKg,
    bestDisciplineScore: bestDiscipline,
  });

  return (
    <Screen gradient>
      <Masthead
        eyebrow="Your account"
        title="Profile"
        accent={domainAccent.profile}
        right={
          <IconButton accessibilityLabel="Settings" onPress={() => router.push('/settings')}>
            <Icon name="gear" size={20} color={colors.text} />
          </IconButton>
        }
      />

      <Card style={{ alignItems: 'center', gap: spacing.sm }}>
        <Avatar initial={(profile.name || 'A').charAt(0).toUpperCase()} accent={rank.tier.color} />
        <Text variant="h3">{profile.name || 'Athlete'}</Text>
        <Text variant="caption" color={colors.textDim}>
          {user?.email ?? 'Local account'}
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm }}>
          <Stat label="Workouts" value={`${workouts}`} />
          <Stat label="Streak" value={`${streak}`} />
          <Stat label="Weight" value={weight ? `${weight.value} ${weight.unit}` : '—'} />
        </View>
      </Card>

      <FadeIn delay={60} style={{ marginTop: spacing.lg }}>
        <Pressable onPress={() => router.push('/leaderboard')}>
          <RankCard rank={rank} />
          <Text variant="caption" color={colors.textDim} center style={{ marginTop: spacing.sm }}>
            Tap to see the leaderboard ›
          </Text>
        </Pressable>
      </FadeIn>

      {/* Two scores that measure different things, so they sit apart: Forge
          Rank is how you train, the Iron Map is where. */}
      <FadeIn delay={90}>
        <Card
          onPress={() => router.push(gymSummary.claimed ? '/gyms/collection' : '/gyms')}
          accent={domainAccent.gyms}
          style={{ marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
        >
          <View style={styles.gymDisc}>
            <Icon name="map" size={19} color={domainAccent.gyms} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="overline" color={colors.textFaint}>IRON MAP</Text>
            <Text variant="bodyStrong" color={gymSummary.tier.color}>{gymSummary.tier.name}</Text>
            <Text variant="caption" color={colors.textDim}>
              {gymSummary.claimed === 0
                ? 'No gyms claimed yet'
                : `${gymSummary.claimed} ${gymSummary.claimed === 1 ? 'gym' : 'gyms'} · ${gymSummary.points} pts`}
            </Text>
          </View>
          <Icon name="chevron_right" size={17} color={colors.textFaint} strokeWidth={2} />
        </Card>
      </FadeIn>

      {/* Upsell: an ember-washed panel rather than a full-bleed orange slab, so
          it invites without shouting over the athlete's own numbers. */}
      {!isPro && (
        <View
          style={{
            borderRadius: 20,
            marginTop: spacing.lg,
            overflow: 'hidden',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: 'rgba(255,122,61,0.35)',
          }}
        >
          <LinearGradient
            colors={['rgba(255,90,31,0.20)', 'rgba(255,90,31,0.05)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={{ padding: spacing.xl }}>
            <Text variant="overline" color={colors.primary}>
              FORGEFIT PRO
            </Text>
            <Text variant="h2" style={{ marginTop: 4 }}>
              Take your training seriously.
            </Text>
            <Text variant="body" color={colors.textDim} style={{ marginTop: 4, marginBottom: spacing.lg }}>
              Unlimited AI, advanced coaching & analytics, no ads.
            </Text>
            <Button title="Upgrade to Pro" onPress={() => router.push('/paywall')} />
          </View>
        </View>
      )}

      <SectionHeader title="Coach & Goals" />
      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        <ListRow icon="flame" tint={colors.primary} title="AI Coach" subtitle="Personality & aggression" onPress={() => router.push('/settings/coach')} />
        <ListRow icon="target" tint={colors.protein} title="Goals & Targets" subtitle="Calories, macros, activity" onPress={() => router.push('/settings/goals')} />
        <ListRow icon="bell" tint={colors.amber} title="Reminders" subtitle="Stay accountable" onPress={() => router.push('/reminders')} />
      </Card>

      <SectionHeader title="Tracking" />
      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        <ListRow
          icon="shield"
          tint={colors.info}
          title="Health Monitor"
          subtitle="Resting heart rate, HRV, temperature — against your own normal"
          onPress={() => router.push('/health')}
        />
        <ListRow icon="scale" tint={colors.water} title="Weight & Body" onPress={() => router.push('/progress/weight')} />
        <ListRow icon="camera" tint={colors.fat} title="Progress Photos" onPress={() => router.push('/progress/photos')} />
        <ListRow
          icon="bolt" tint={colors.sleep}
          title="Protocol Tracker"
          subtitle={protocolEnabled ? 'Enabled' : 'Off — enable in settings'}
          onPress={() => (protocolEnabled ? router.push('/protocol') : router.push('/settings/privacy'))}
        />
      </Card>

      <SectionHeader title="Account" />
      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        <ListRow icon="gear" tint={colors.textDim} title="Settings" onPress={() => router.push('/settings')} />
        <ListRow icon="card" tint={colors.success} title="Subscription" subtitle={isPro ? 'Pro' : 'Free'} onPress={() => router.push('/settings/subscription')} />
      </Card>

      <View style={{ height: spacing.xxxl }} />
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text variant="metric">{value}</Text>
      <Text variant="caption" color={colors.textDim}>
        {label}
      </Text>
    </View>
  );
}

const styles = {
  gymDisc: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: 'rgba(57,230,195,0.12)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
};

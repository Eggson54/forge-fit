import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, ListRow, Screen, SectionHeader, Text } from '../../src/components/ui';
import { colors, gradients, spacing } from '../../src/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { displayWeight } from '../../src/domain/units';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';
import { useGamificationStore } from '../../src/stores/useGamificationStore';

export default function Profile() {
  const user = useAuthStore((s) => s.user);
  const profile = useProfileStore((s) => s.profile);
  const isPro = useProfileStore((s) => s.isPro());
  const protocolEnabled = useProfileStore((s) => s.protocolFeatureEnabled);
  const workouts = useWorkoutStore((s) => s.completedWorkouts().length);
  const streak = useGamificationStore((s) => s.streaks.daily);

  const weight = profile.weightKg ? displayWeight(profile.weightKg, profile.units) : null;

  return (
    <Screen gradient>
      <Text variant="h1" style={{ marginBottom: spacing.lg }}>
        Profile
      </Text>

      <Card style={{ alignItems: 'center', gap: spacing.sm }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="h1" color={colors.primary}>
            {(profile.name || 'A').charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text variant="h3">{profile.name || 'Athlete'}</Text>
        <Text variant="caption" color={colors.textDim}>
          {user?.email ?? 'Local account'}
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm }}>
          <Stat label="Workouts" value={`${workouts}`} />
          <Stat label="Streak" value={`${streak}`} />
          <Stat label="Weight" value={weight ? `${weight.value}${weight.unit}` : '—'} />
        </View>
      </Card>

      {!isPro && (
        <LinearGradient colors={gradients.forge} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 20, padding: spacing.xl, marginTop: spacing.lg }}>
          <Text variant="overline" color={colors.onPrimary}>
            FORGEFIT PRO
          </Text>
          <Text variant="h2" color={colors.onPrimary} style={{ marginTop: 4 }}>
            Take your training seriously.
          </Text>
          <Text variant="body" color="#2a1400" style={{ marginTop: 4, marginBottom: spacing.md }}>
            Unlimited AI, advanced coaching & analytics, no ads.
          </Text>
          <Button title="Upgrade to Pro" variant="secondary" onPress={() => router.push('/paywall')} />
        </LinearGradient>
      )}

      <SectionHeader title="Coach & Goals" />
      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        <ListRow icon="🔥" title="AI Coach" subtitle="Personality & aggression" onPress={() => router.push('/settings/coach')} />
        <ListRow icon="🎯" title="Goals & Targets" subtitle="Calories, macros, activity" onPress={() => router.push('/settings/goals')} />
        <ListRow icon="⏰" title="Reminders" subtitle="Stay accountable" onPress={() => router.push('/reminders')} />
      </Card>

      <SectionHeader title="Tracking" />
      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        <ListRow icon="⚖️" title="Weight & Body" onPress={() => router.push('/progress/weight')} />
        <ListRow icon="📸" title="Progress Photos" onPress={() => router.push('/progress/photos')} />
        <ListRow
          icon="🧪"
          title="Protocol Tracker"
          subtitle={protocolEnabled ? 'Enabled' : 'Off — enable in settings'}
          onPress={() => (protocolEnabled ? router.push('/protocol') : router.push('/settings/privacy'))}
        />
      </Card>

      <SectionHeader title="Account" />
      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        <ListRow icon="⚙️" title="Settings" onPress={() => router.push('/settings')} />
        <ListRow icon="💳" title="Subscription" subtitle={isPro ? 'Pro' : 'Free'} onPress={() => router.push('/settings/subscription')} />
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

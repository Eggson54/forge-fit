import React from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Screen, SectionHeader, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, spacing } from '../../src/theme';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { subscriptions } from '../../src/services/subscriptions';
import { analytics } from '../../src/services/analytics';

export default function Subscription() {
  const subscription = useProfileStore((s) => s.subscription);
  const setSubscription = useProfileStore((s) => s.setSubscription);
  const isPro = subscription.tier === 'pro';

  const cancel = () => {
    Alert.alert('Cancel subscription', subscriptions.usingRealBilling ? 'Manage your subscription in your app store account settings.' : 'This will end your Pro access (mock billing).', [
      { text: 'Close', style: 'cancel' },
      ...(subscriptions.usingRealBilling
        ? []
        : [{ text: 'Cancel Pro', style: 'destructive' as const, onPress: async () => { const s = await subscriptions.cancelMock(); setSubscription(s); analytics.track('subscription_cancelled'); } }]),
    ]);
  };

  return (
    <Screen gradient>
      <ScreenHeader title="Subscription" />

      <Card style={{ alignItems: 'center', gap: spacing.sm }}>
        <Text variant="overline" color={isPro ? colors.primary : colors.textDim}>
          CURRENT PLAN
        </Text>
        <Text variant="display" color={isPro ? colors.primary : colors.text}>
          {isPro ? 'PRO' : 'FREE'}
        </Text>
        {isPro && subscription.expiresAt && (
          <Text variant="caption" color={colors.textDim}>
            Renews {new Date(subscription.expiresAt).toLocaleDateString()}
          </Text>
        )}
      </Card>

      <SectionHeader title={isPro ? 'Your Pro benefits' : 'Free plan includes'} />
      <Card>
        {(isPro ? PRO_FEATURES : FREE_FEATURES).map((f, i, arr) => (
          <View key={f} style={{ flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: i === arr.length - 1 ? 0 : 0.5, borderBottomColor: colors.border }}>
            <Text color={colors.primary}>✓</Text>
            <Text variant="body">{f}</Text>
          </View>
        ))}
      </Card>

      <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
        {!isPro ? (
          <Button title="Upgrade to Pro" onPress={() => router.push('/paywall')} size="lg" />
        ) : (
          <Button title="Manage / Cancel" variant="ghost" onPress={cancel} />
        )}
        <Button title="Restore Purchases" variant="ghost" onPress={() => subscriptions.restore().then(setSubscription)} />
      </View>
    </Screen>
  );
}

const FREE_FEATURES = ['Workout tracking', 'Basic nutrition tracking', 'Basic AI coach', 'Basic progress tracking', '5 reminders', 'Limited AI food scans'];
const PRO_FEATURES = ['No ads', 'Unlimited AI food analysis', 'Advanced AI workouts', 'Advanced analytics', 'Advanced coaching & personalities', 'Unlimited reminders'];

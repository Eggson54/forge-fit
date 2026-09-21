import React from 'react';
import { Alert, Linking, View } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Button, Card, ListRow, Screen, SectionHeader, SegmentedControl, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, spacing } from '../../src/theme';
import type { Units } from '../../src/domain/types';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { resetAllStores } from '../../src/stores';
import { exportUserData } from '../../src/services/dataExport';

export default function Settings() {
  const units = useProfileStore((s) => s.profile.units);
  const setUnits = useProfileStore((s) => s.setUnits);
  const recompute = useProfileStore((s) => s.recomputeTargets);
  const signOut = useAuthStore((s) => s.signOut);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);

  const onDelete = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account and all associated data, on this device and in the cloud. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            await deleteAccount();
            resetAllStores();
            router.replace('/(auth)/sign-up');
          },
        },
      ],
    );
  };

  const onExport = async () => {
    const shared = await exportUserData();
    if (!shared) Alert.alert('Export', 'Your data was prepared. Sharing is available in a native build.');
  };

  const onSignOut = async () => {
    await signOut();
    router.replace('/(auth)/sign-in');
  };

  return (
    <Screen gradient>
      <ScreenHeader title="Settings" />

      <SectionHeader title="Units" />
      <Card>
        <SegmentedControl
          options={[
            { label: 'Imperial (lb/ft/oz)', value: 'imperial' },
            { label: 'Metric (kg/cm/ml)', value: 'metric' },
          ]}
          value={units}
          onChange={(u) => {
            setUnits(u as Units);
          }}
        />
      </Card>

      <SectionHeader title="Coaching & Goals" />
      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        <ListRow icon="flame" tint={colors.primary} title="AI Coach" subtitle="Personality & aggression" onPress={() => router.push('/settings/coach')} />
        <ListRow icon="target" tint={colors.protein} title="Goals & Targets" onPress={() => router.push('/settings/goals')} />
        <ListRow icon="bell" tint={colors.amber} title="Notifications & Reminders" onPress={() => router.push('/settings/notifications')} />
        <ListRow icon="clock" tint={colors.sleep} title="Check-ins & Ghost Mode" subtitle="When the app speaks first" onPress={() => router.push('/settings/check-ins')} />
        <ListRow icon="sliders" tint={colors.carbs} title="Customise" subtitle="Home sections, tabs, the big button" onPress={() => router.push('/settings/customize')} />
        <ListRow icon="repeat" tint={colors.steps} title="Recompute targets from profile" onPress={() => { recompute(); Alert.alert('Updated', 'Targets recalculated from your profile.'); }} />
      </Card>

      <SectionHeader title="Privacy & Integrations" />
      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        <ListRow icon="lock" tint={colors.water} title="Privacy & Data" subtitle="What's stored & where" onPress={() => router.push('/settings/privacy')} />
        <ListRow icon="watch" tint={colors.carbs} title="Integrations" subtitle="Apple Watch, Strava, Apple Health" onPress={() => router.push('/settings/integrations')} />
        <ListRow icon="card" tint={colors.success} title="Subscription" onPress={() => router.push('/settings/subscription')} />
      </Card>

      <SectionHeader title="Your Data" />
      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        <ListRow icon="download" tint={colors.protein} title="Export my data" subtitle="Download a copy" onPress={onExport} />
        <ListRow icon="trash" danger title="Delete account & data" onPress={onDelete} />
      </Card>

      <SectionHeader title="Support" />
      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        <ListRow icon="document" tint={colors.textDim} title="Terms of Service" onPress={() => Linking.openURL('https://forgefit.app/terms').catch(() => {})} />
        <ListRow icon="shield" tint={colors.textDim} title="Privacy Policy" onPress={() => Linking.openURL('https://forgefit.app/privacy').catch(() => {})} />
        <ListRow icon="help" tint={colors.textDim} title="Help & Feedback" onPress={() => Linking.openURL('mailto:support@forgefit.app').catch(() => {})} />
      </Card>

      <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
        <Button title="Sign Out" variant="ghost" onPress={onSignOut} />
        <Text variant="caption" color={colors.textFaint} center>
          ForgeFit v{Constants.expoConfig?.version ?? '1.0.0'} · Not medical advice. Consult a professional for medical questions.
        </Text>
      </View>
    </Screen>
  );
}

import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Button, Card, Screen, SectionHeader, Text, Toggle } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, spacing } from '../../src/theme';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { analytics } from '../../src/services/analytics';
import { health, type HealthMetric } from '../../src/services/health';
import { isCloudEnabled } from '../../src/services/supabase';

const HEALTH_METRICS: { key: HealthMetric; label: string }[] = [
  { key: 'steps', label: 'Steps' },
  { key: 'weight', label: 'Weight' },
  { key: 'sleep', label: 'Sleep' },
  { key: 'workouts', label: 'Workouts' },
  { key: 'heartRate', label: 'Heart rate' },
];

export default function Privacy() {
  const protocolEnabled = useProfileStore((s) => s.protocolFeatureEnabled);
  const setProtocolEnabled = useProfileStore((s) => s.setProtocolFeatureEnabled);
  const [analyticsOn, setAnalyticsOn] = useState(true);
  const [healthAvailable, setHealthAvailable] = useState(false);

  useEffect(() => {
    health.isAvailable().then(setHealthAvailable);
  }, []);

  const requestHealth = async (metric: HealthMetric) => {
    const res = await health.requestPermissions([metric]);
    if (!res[metric]) {
      Alert.alert('Apple Health', healthAvailable ? 'Permission was not granted.' : 'Apple Health integration requires a native build. The app works fully without it.');
    }
  };

  return (
    <Screen gradient>
      <ScreenHeader title="Privacy & Data" />

      <Card tone="alt">
        <Text variant="bodyStrong" style={{ marginBottom: spacing.sm }}>
          How your data is handled
        </Text>
        <Bullet text={`Health & fitness data is treated as sensitive. ${isCloudEnabled() ? 'It syncs to your private, row-level-secured account.' : 'It stays on this device (offline mode).'}`} />
        <Bullet text="Stored locally: reminders, progress photos, drafts, and a cache of your logs." />
        <Bullet text="We never sell your health information and never use it to target ads." />
        <Bullet text="Analytics capture only coarse product events — never your weights, macros, doses, or photos." />
      </Card>

      <SectionHeader title="Product analytics" />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Share anonymous usage</Text>
            <Text variant="caption" color={colors.textDim}>
              Helps improve the app. No health data, ever.
            </Text>
          </View>
          <Toggle value={analyticsOn} onValueChange={(v) => { setAnalyticsOn(v); analytics.setEnabled(v); }} />
        </View>
      </Card>

      <SectionHeader title="Protocol tracker" />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Enable protocol tracking</Text>
            <Text variant="caption" color={colors.textDim}>
              Optional personal record-keeping. Hidden by default. Not medical advice.
            </Text>
          </View>
          <Toggle value={protocolEnabled} onValueChange={setProtocolEnabled} />
        </View>
      </Card>

      <SectionHeader title="Apple Health" />
      <Card>
        <Text variant="caption" color={colors.textDim} style={{ marginBottom: spacing.md }}>
          Grant access per metric — we never request more than a feature needs. The app works fully without Health.
        </Text>
        <View style={{ gap: spacing.sm }}>
          {HEALTH_METRICS.map((m) => (
            <View key={m.key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="body">{m.label}</Text>
              <Button title="Connect" size="sm" variant="ghost" fullWidth={false} onPress={() => requestHealth(m.key)} />
            </View>
          ))}
        </View>
      </Card>
    </Screen>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
      <Text color={colors.primary}>•</Text>
      <Text variant="caption" color={colors.textDim} style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Button, Card, Screen, SectionHeader, Text } from '../../src/components/ui';
import { FadeIn } from '../../src/components/anim';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { colors, spacing } from '../../src/theme';
import { health, type HealthMetric } from '../../src/services/health';
import { strava } from '../../src/services/strava';
import { useIntegrationStore } from '../../src/stores/useIntegrationStore';
import { groupThousands } from '../../src/domain/units';

const HEALTH_METRICS: { key: HealthMetric; label: string }[] = [
  { key: 'steps', label: 'Steps' },
  { key: 'weight', label: 'Weight' },
  { key: 'sleep', label: 'Sleep' },
  { key: 'heartRate', label: 'Heart rate' },
];

export default function Integrations() {
  const s = useIntegrationStore();
  const [healthAvailable, setHealthAvailable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    health.isAvailable().then(setHealthAvailable);
  }, []);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Connection', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen gradient>
      <ScreenHeader title="Integrations" />

      {/* Apple Watch */}
      <SectionHeader title="Apple Watch" />
      <FadeIn>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="watch" size={24} color={colors.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">Apple Watch</Text>
              <Text variant="caption" color={s.appleWatchConnected ? colors.success : colors.textDim}>
                {s.appleWatchConnected ? 'Connected · syncing workouts, heart rate & energy' : 'Sync workouts, heart rate, activity rings'}
              </Text>
            </View>
          </View>
          {s.appleWatchConnected && (
            <View style={{ flexDirection: 'row', gap: spacing.xl, marginTop: spacing.md }}>
              <WatchStat icon="flame" label="Active energy" value={s.activeEnergyKcal == null ? '— kcal' : `${groupThousands(s.activeEnergyKcal)} kcal`} />
              <WatchStat icon="bolt" label="Avg HR" value={`${s.lastHeartRate ?? '—'} bpm`} />
            </View>
          )}
          <View style={{ marginTop: spacing.md }}>
            {s.appleWatchConnected ? (
              <Button title="Disconnect" variant="ghost" onPress={s.disconnectAppleWatch} />
            ) : (
              <Button title="Connect Apple Watch" variant="secondary" loading={busy === 'watch'} onPress={() => run('watch', s.connectAppleWatch)} />
            )}
          </View>
        </Card>
      </FadeIn>

      {/* Strava */}
      <SectionHeader title="Strava" />
      <FadeIn delay={60}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="bolt" size={24} color={colors.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">Strava</Text>
              <Text variant="caption" color={s.stravaConnected ? colors.success : colors.textDim}>
                {s.stravaConnected ? `Connected as ${s.stravaAthlete}` : 'Import runs, rides & swims automatically'}
              </Text>
            </View>
          </View>

          {s.stravaConnected && s.activities.length > 0 && (
            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              {s.activities.slice(0, 4).map((a) => (
                <View key={a.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
                  <View>
                    <Text variant="label">{a.name}</Text>
                    <Text variant="caption" color={colors.textDim}>{a.type} · {a.date}</Text>
                  </View>
                  <Text variant="label" color={colors.primary}>{a.distanceKm} km · {a.movingMinutes}m</Text>
                </View>
              ))}
            </View>
          )}

          <View style={{ marginTop: spacing.md }}>
            {s.stravaConnected ? (
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <Button title="Re-sync" variant="secondary" onPress={() => run('strava-sync', s.refresh)} loading={busy === 'strava-sync'} style={{ flex: 1 }} />
                <Button title="Disconnect" variant="ghost" onPress={() => run('strava-dc', s.disconnectStrava)} style={{ flex: 1 }} />
              </View>
            ) : (
              <Button title="Connect Strava" variant="secondary" loading={busy === 'strava'} onPress={() => run('strava', s.connectStrava)} />
            )}
          </View>
          {!strava.usingRealOAuth && (
            <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
              Demo mode: sample activities shown. Add your Strava client id + exchange endpoint for live sync.
            </Text>
          )}
        </Card>
      </FadeIn>

      {/* Apple Health */}
      <SectionHeader title="Apple Health" />
      <Card>
        <Text variant="caption" color={colors.textDim} style={{ marginBottom: spacing.md }}>
          Grant access per metric — we never request more than a feature needs. The app works fully without Health.
        </Text>
        <View style={{ gap: spacing.sm }}>
          {HEALTH_METRICS.map((m) => (
            <View key={m.key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="body">{m.label}</Text>
              <Button
                title="Connect"
                size="sm"
                variant="ghost"
                fullWidth={false}
                onPress={() =>
                  run('h-' + m.key, async () => {
                    const res = await health.requestPermissions([m.key]);
                    if (!res[m.key]) Alert.alert('Apple Health', healthAvailable ? 'Permission not granted.' : 'Apple Health needs a native build. The app works fully without it.');
                  })
                }
              />
            </View>
          ))}
        </View>
      </Card>
    </Screen>
  );
}

function WatchStat({ icon, label, value }: { icon: React.ComponentProps<typeof Icon>['name']; label: string; value: string }) {
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name={icon} size={16} color={colors.primary} />
        <Text variant="bodyStrong">{value}</Text>
      </View>
      <Text variant="caption" color={colors.textDim}>{label}</Text>
    </View>
  );
}

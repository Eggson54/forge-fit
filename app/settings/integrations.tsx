import React, { useEffect, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Screen, SectionHeader, Text } from '../../src/components/ui';
import { FadeIn } from '../../src/components/anim';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon, type IconName } from '../../src/components/Icon';
import { colors, spacing } from '../../src/theme';
import { formatDayMonth } from '../../src/domain/date';
import { displayDistance } from '../../src/domain/cardio';
import {
  PROVIDER_LABEL,
  describeStatus,
  summariseSync,
  type LinkState,
  type ProviderId,
} from '../../src/domain/integrations';
import { METRIC_LABEL, health } from '../../src/services/health';
import { strava } from '../../src/services/strava';
import { watch } from '../../src/services/watch';
import { useIntegrationStore } from '../../src/stores/useIntegrationStore';
import { useProfileStore } from '../../src/stores/useProfileStore';

const ICON: Record<ProviderId, IconName> = {
  apple_health: 'flame',
  apple_watch: 'watch',
  strava: 'bolt',
};

const BLURB: Record<ProviderId, string> = {
  apple_health:
    'Steps, sleep, weight and the passive signals — resting heart rate, HRV, respiratory rate, wrist temperature, blood oxygen.',
  apple_watch: 'Workouts, heart rate and the signals only a worn Watch records.',
  strava: 'Runs, rides and swims, folded into your conditioning log automatically.',
};

/**
 * What the app is connected to.
 *
 * The rule this screen follows: never show a connection the app does not
 * have. Each provider needs something outside the JavaScript bundle — a native
 * framework, a paired device, a server holding a client secret — and when that
 * thing is missing the screen says which one, rather than offering a toggle
 * that flips a boolean and produces invented numbers.
 */
export default function Integrations() {
  const providers = useIntegrationStore((s) => s.providers);
  const busy = useIntegrationStore((s) => s.busy);
  const activities = useIntegrationStore((s) => s.activities);
  const watchStatus = useIntegrationStore((s) => s.watchStatus);
  const lastOutcome = useIntegrationStore((s) => s.lastOutcome);
  const connect = useIntegrationStore((s) => s.connect);
  const disconnect = useIntegrationStore((s) => s.disconnect);
  const sync = useIntegrationStore((s) => s.sync);
  const capability = useIntegrationStore((s) => s.capability);
  const previewWithSampleData = useIntegrationStore((s) => s.previewWithSampleData);
  const units = useProfileStore((p) => p.profile.units);

  // Re-checks on open: someone who has just installed a development build
  // should not have to know to restart the app.
  useEffect(() => {
    void useIntegrationStore.getState().syncAll({ onlyIfDue: true });
  }, []);

  const order: ProviderId[] = useMemo(() => ['apple_health', 'apple_watch', 'strava'], []);

  return (
    <Screen gradient>
      <ScreenHeader title="Integrations" subtitle="What the app can and cannot see" />

      {order.map((id, i) => {
        const status = providers[id];
        const cap = capability(id);
        // The capability check overrides a stored state that would claim a
        // real connection — but not `demo`, which claims the opposite. Letting
        // it override that was the bug where filling sample data silently
        // populated the screens while this one still said "not available".
        const state: LinkState =
          cap.supported || status.state === 'demo' ? status.state : 'unavailable';
        const line = describeStatus({ ...status, state, error: status.error ?? cap.reason });

        return (
          <FadeIn key={id} delay={i * 60}>
            <Card style={{ gap: spacing.md, marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={styles.badge}>
                  <Icon name={ICON[id]} size={22} color={colors.text} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text variant="bodyStrong">{PROVIDER_LABEL[id]}</Text>
                  <Text variant="caption" color={tintFor(state)}>{line}</Text>
                </View>
                <Dot state={state} />
              </View>

              <Text variant="caption" color={colors.textFaint}>{BLURB[id]}</Text>

              {id === 'apple_health' && state === 'connected' && (status.grantedScopes?.length ?? 0) > 0 && (
                <Text variant="caption" color={colors.textFaint}>
                  Asked for {status.grantedScopes!.map((m) => (METRIC_LABEL as Record<string, string>)[m] ?? m).join(', ').toLowerCase()}.
                  Apple never tells an app which reads were declined, so a signal that stays empty
                  shows as no data rather than as a refusal.
                </Text>
              )}

              {id === 'apple_watch' && watchStatus != null && watchStatus.detected && (
                <Text variant="caption" color={colors.textFaint}>
                  Found {watchStatus.signals.join(', ')} in Health
                  {watchStatus.lastSeenDate ? ` on ${formatDayMonth(watchStatus.lastSeenDate)}` : ''}.
                </Text>
              )}

              {id === 'strava' && activities.length > 0 && (
                <View style={{ gap: 4 }}>
                  {activities.slice(0, 3).map((a) => (
                    <View key={a.id} style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <Text variant="caption" color={colors.textFaint} style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
                        {a.name}
                      </Text>
                      <Text variant="caption" color={colors.textFaint}>
                        {activityMeasure(a.distanceKm, a.movingMinutes, units)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {state === 'unavailable' ? (
                <>
                  <Card tone="alt" style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Icon name="lock" size={13} color={colors.textDim} />
                      <Text variant="overline" color={colors.textDim}>WHY NOT</Text>
                    </View>
                    <Text variant="caption" color={colors.textFaint}>{status.error ?? cap.reason}</Text>
                  </Card>
                  {/* Sample data, so the screens behind this are not a locked
                      door in the preview. Never called a connection. */}
                  <Button
                    title="Fill with sample data"
                    variant="ghost"
                    onPress={() => previewWithSampleData(id)}
                  />
                </>
              ) : state === 'demo' ? (
                <View style={{ gap: spacing.sm }}>
                  <Card tone="alt" style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Icon name="help" size={13} color={colors.amber} />
                      <Text variant="overline" color={colors.amber}>SAMPLE DATA</Text>
                    </View>
                    <Text variant="caption" color={colors.textFaint}>
                      These are made-up numbers so you can see what the screens do. Nothing here came
                      from a device, and the app will not call this connected.
                    </Text>
                  </Card>
                  <Button title="Clear sample data" variant="ghost" onPress={() => void disconnect(id)} />
                </View>
              ) : state === 'connected' ? (
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Sync now"
                      variant="secondary"
                      loading={busy === id}
                      onPress={() => void sync(id)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button title="Disconnect" variant="ghost" onPress={() => void disconnect(id)} />
                  </View>
                </View>
              ) : (
                <Button
                  title={`Connect ${PROVIDER_LABEL[id]}`}
                  variant="secondary"
                  loading={busy === id}
                  onPress={() => void connect(id)}
                />
              )}

              {state === 'connected' && lastOutcome && busy !== id && (
                <Text variant="caption" color={colors.textFaint}>{summariseSync(lastOutcome)}</Text>
              )}
            </Card>
          </FadeIn>
        );
      })}

      <SectionHeader title="What it takes to turn these on" />
      <Card style={{ gap: spacing.md }}>
        <Requirement
          title="Apple Health & Apple Watch"
          met={health.hasNativeModule}
          body={
            health.hasNativeModule
              ? 'This build has the HealthKit module. Connect above and grant the types you want read.'
              : 'HealthKit is a native framework, so it needs a development build — `npx expo run:ios`, or a build from EAS. Expo Go and the browser cannot load it, and the app will not invent numbers in the meantime.'
          }
        />
        <Requirement
          title="Apple Watch companion app"
          met={watch.companionInstalled}
          body={watch.companionNote}
        />
        <Requirement
          title="Strava"
          met={strava.configured}
          body={
            strava.configured
              ? 'Client ID and exchange endpoint are configured. The secret stays on the server.'
              : 'Create an app at strava.com/settings/api, then set EXPO_PUBLIC_STRAVA_CLIENT_ID and EXPO_PUBLIC_STRAVA_EXCHANGE_URL, plus STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET on the server. The secret must never be in the app — anyone can unzip an app bundle.'
          }
        />
        {Platform.OS === 'web' && (
          <Text variant="caption" color={colors.textFaint}>
            You are looking at the web build, where none of the three can run. Everything else in the
            app works here; these three are the parts that need a device.
          </Text>
        )}
      </Card>

      <Card tone="alt" style={{ gap: spacing.sm, marginTop: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="shield" size={14} color={colors.textDim} />
          <Text variant="overline" color={colors.textDim}>YOUR HEALTH DATA</Text>
        </View>
        <Text variant="caption" color={colors.textFaint}>
          Health data read from your device stays on your device and in your own cloud backup. It is
          never used to target advertising and is never sold. You can revoke any of this in Apple
          Health or on Strava at any time, and deleting your account removes what the app stored.
        </Text>
      </Card>

      <Button
        title="Run diagnostics"
        variant="secondary"
        onPress={() => router.push('/settings/diagnostics')}
      />
      <Text variant="caption" color={colors.textFaint} center style={{ paddingTop: spacing.sm }}>
        Calls each layer for real and reports which one is stopping you.
      </Text>
      <Button
        title="See your health monitor"
        variant="ghost"
        onPress={() => router.push('/health')}
      />
      <View style={{ height: spacing.md }} />
    </Screen>
  );
}

/** Distance when there is one, minutes when there is not. */
function activityMeasure(distanceKm: number, minutes: number, units: 'imperial' | 'metric'): string {
  const d = displayDistance(distanceKm, units);
  return d ? `${d.value} ${d.unit}` : `${minutes}m`;
}

function Requirement({ title, met, body }: { title: string; met: boolean; body: string }) {
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name={met ? 'check' : 'lock'} size={13} color={met ? colors.success : colors.textDim} />
        <Text variant="label" color={met ? colors.success : colors.text}>{title}</Text>
      </View>
      <Text variant="caption" color={colors.textFaint}>{body}</Text>
    </View>
  );
}

function Dot({ state }: { state: LinkState }) {
  return <View style={[styles.dot, { backgroundColor: tintFor(state) }]} />;
}

function tintFor(state: LinkState): string {
  switch (state) {
    case 'connected':
      return colors.success;
    case 'connecting':
      return colors.amber;
    case 'error':
      return colors.danger;
    case 'demo':
      return colors.amber;
    case 'unavailable':
    case 'disconnected':
    default:
      return colors.textDim;
  }
}

const styles = StyleSheet.create({
  badge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});

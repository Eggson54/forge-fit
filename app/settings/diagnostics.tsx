import React, { useCallback, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Button, Card, Screen, SectionHeader, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { colors, radius, spacing } from '../../src/theme';
import { todayISO } from '../../src/domain/date';
import { config } from '../../src/services/config';
import { health, healthDialect, healthLoadError } from '../../src/services/health';
import { strava } from '../../src/services/strava';
import { watch } from '../../src/services/watch';

type Status = 'pass' | 'fail' | 'warn' | 'pending';

interface Check {
  label: string;
  status: Status;
  detail: string;
  /** Shown in a monospace box and copyable — URLs, identifiers. */
  copy?: string;
}

/**
 * A self-test for the three integrations.
 *
 * This exists because "it doesn't work" and "it isn't connected" look
 * identical from the outside, and the difference is usually one specific
 * thing: a missing native module, a client ID that was never set, a redirect
 * URI that does not match what is registered on Strava. Each of those has a
 * different fix and none of them is discoverable by tapping Connect again.
 *
 * Every check actually calls the thing it is checking. Nothing here is
 * inferred from configuration alone.
 */
export default function Diagnostics() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    const out: Check[] = [];

    out.push({
      label: 'Platform',
      status: Platform.OS === 'ios' ? 'pass' : 'warn',
      detail:
        Platform.OS === 'ios'
          ? 'iOS. Apple Health and Apple Watch are possible here.'
          : `${Platform.OS}. Apple Health and Apple Watch are iOS only; Strava works on iOS and Android.`,
    });

    // --- Apple Health -------------------------------------------------------
    const loadError = healthLoadError();
    const dialect = healthDialect();
    out.push({
      label: 'HealthKit module',
      status: health.hasNativeModule ? 'pass' : 'fail',
      detail: health.hasNativeModule
        ? `Loaded (API version ${dialect}). This is a development build.`
        : `Not loaded. ${loadError ?? 'Expo Go and the browser cannot load native frameworks — run npx expo run:ios.'}`,
    });

    if (health.hasNativeModule) {
      let available = false;
      try {
        available = await health.isAvailable();
      } catch {
        available = false;
      }
      out.push({
        label: 'Health data available',
        status: available ? 'pass' : 'fail',
        detail: available
          ? 'HealthKit says this device can supply health data.'
          : 'HealthKit says no health data is available on this device.',
      });

      if (available) {
        const granted = await health.requestPermissions(['steps', 'sleep', 'restingHeartRate', 'hrv']);
        const asked = Object.values(granted).some(Boolean);
        out.push({
          label: 'Permission request',
          status: asked ? 'pass' : 'fail',
          detail: asked
            ? 'The permission sheet was presented. Apple never reveals which reads you declined, so an empty signal below means no data, not necessarily a refusal.'
            : 'The permission request was rejected before reaching the sheet.',
        });

        const day = await health.readDay(todayISO());
        const found = Object.entries(day)
          .filter(([k, v]) => k !== 'date' && v != null)
          .map(([k]) => k);
        out.push({
          label: 'Read today',
          status: found.length > 0 ? 'pass' : 'warn',
          detail:
            found.length > 0
              ? `Got ${found.join(', ')}.`
              : 'Nothing came back for today. Either the reads were declined, or the device genuinely has no samples yet — try a day you know has steps.',
        });
      }
    }

    // --- Apple Watch --------------------------------------------------------
    if (Platform.OS === 'ios' && health.hasNativeModule) {
      const w = await watch.detect([todayISO()]);
      out.push({
        label: 'Apple Watch data',
        status: w.detected ? 'pass' : 'warn',
        detail: w.detected
          ? `Found ${w.signals.join(', ')} — a Watch is paired and has been worn.`
          : w.reason ?? 'No Watch-written samples found.',
      });
    }

    // --- Strava -------------------------------------------------------------
    out.push({
      label: 'Strava client ID',
      status: config.strava.clientId ? 'pass' : 'fail',
      detail: config.strava.clientId
        ? 'EXPO_PUBLIC_STRAVA_CLIENT_ID is set.'
        : 'EXPO_PUBLIC_STRAVA_CLIENT_ID is not set. Create an app at strava.com/settings/api.',
    });

    const ping = await strava.pingBackend();
    out.push({
      label: 'Token exchange endpoint',
      status: ping.ok ? 'pass' : 'fail',
      detail: ping.detail,
      copy: config.strava.exchangeUrl || undefined,
    });

    const redirect = strava.redirectUri();
    out.push({
      label: 'Redirect URI',
      status: redirect ? 'pass' : 'warn',
      detail: redirect
        ? 'This exact value has to be the Authorization Callback Domain on your Strava app settings, or the sign-in will bounce.'
        : 'Only resolvable in the native app.',
      copy: redirect ?? undefined,
    });

    const tokens = await strava.tokenState();
    out.push({
      label: 'Strava tokens',
      status: tokens.stored ? (tokens.expired ? 'warn' : 'pass') : 'warn',
      detail: tokens.stored
        ? tokens.expired
          ? 'Stored but expired. The next sync refreshes them through your server.'
          : `Stored and valid until ${new Date((tokens.expiresAt ?? 0) * 1000).toLocaleString()}.`
        : 'Not connected yet.',
    });

    setChecks(out);
    setRunning(false);
  }, []);

  return (
    <Screen gradient>
      <ScreenHeader title="Diagnostics" subtitle="What is actually wrong, rather than that something is" />

      <Card style={{ gap: spacing.md, marginBottom: spacing.md }}>
        <Text variant="caption" color={colors.textFaint}>
          Every check below calls the thing it is checking — the native module, your server, the
          keychain. Nothing is inferred from settings alone, so a pass here means it really works.
        </Text>
        <Button title={running ? 'Running…' : 'Run diagnostics'} loading={running} onPress={() => void run()} />
      </Card>

      {checks.length > 0 && (
        <>
          <SectionHeader title="Results" />
          <Card style={{ gap: spacing.md }}>
            {checks.map((c, i) => (
              <View
                key={c.label}
                style={[
                  { gap: 6 },
                  i > 0 && { borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: spacing.md },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={[styles.dot, { backgroundColor: TINT[c.status] }]} />
                  <Text variant="label" color={colors.text} style={{ flex: 1, minWidth: 0 }}>{c.label}</Text>
                  <Text variant="caption" color={TINT[c.status]}>{LABEL[c.status]}</Text>
                </View>
                <Text variant="caption" color={colors.textFaint}>{c.detail}</Text>
                {c.copy && (
                  <View style={styles.mono}>
                    {/* Selectable rather than a copy button: this is a value
                        that has to be pasted into Strava's settings exactly,
                        and one extra dependency for a long-press is not a
                        trade worth making. */}
                    <Text
                      variant="caption"
                      color={colors.textDim}
                      selectable
                      style={{ flex: 1, minWidth: 0 }}
                    >
                      {c.copy}
                    </Text>
                    <Icon name="copy" size={13} color={colors.textFaint} />
                  </View>
                )}
              </View>
            ))}
          </Card>
        </>
      )}

      <View style={{ height: spacing.xl }} />
    </Screen>
  );
}

const TINT: Record<Status, string> = {
  pass: colors.success,
  fail: colors.danger,
  warn: colors.amber,
  pending: colors.textDim,
};

const LABEL: Record<Status, string> = {
  pass: 'OK',
  fail: 'Blocked',
  warn: 'Check',
  pending: '…',
};

const styles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4 },
  mono: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});

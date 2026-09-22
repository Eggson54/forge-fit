import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Chip, EmptyState, Input, Screen, SectionHeader, StatTile, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { colors, spacing } from '../../src/theme';
import { addDaysISO, formatDayMonth, todayISO } from '../../src/domain/date';
import {
  HRV_KIND_NOTE,
  WEARABLES_NOTE,
  coverageOf,
  providerLabel,
} from '../../src/domain/wearables';
import { wearables } from '../../src/services/wearables';
import { useLogStore } from '../../src/stores/useLogStore';
import { useVitalsStore } from '../../src/stores/useVitalsStore';

type Phase = 'idle' | 'working' | 'done' | 'failed';

/**
 * Pulling a history in from an Open Wearables deployment.
 *
 * The screen is honest about the arrangement in the first paragraph, because
 * it is unusual and it matters: this is a service the athlete runs, the
 * vendor credentials live there rather than here, and nothing about their
 * data passes through anybody else. That is the whole reason it is worth the
 * setup over a hosted aggregator.
 */
export default function Wearables() {
  const logSleep = useLogStore((s) => s.logSleep);
  const logSteps = useLogStore((s) => s.logSteps);
  const recordVitals = useVitalsStore((s) => s.record);

  const [userId, setUserId] = useState('');
  const [days, setDays] = useState(90);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{ sleep: number; activity: number; recovery: number; providers: ReturnType<typeof coverageOf> } | null>(null);

  const configured = wearables.configured();

  const pull = async () => {
    setPhase('working');
    setMessage(null);
    const to = todayISO();
    const from = addDaysISO(to, -days);

    const [sleep, activity, recovery] = await Promise.all([
      wearables.sleep(userId, from, to),
      wearables.activity(userId, from, to),
      wearables.recovery(userId, from, to),
    ]);

    if (sleep.kind !== 'ok' || activity.kind !== 'ok' || recovery.kind !== 'ok') {
      // Report the first real failure. All three share a reason field once
      // narrowed away from 'ok', so no further checking is needed here.
      const failed = [sleep, activity, recovery].filter((r) => r.kind !== 'ok');
      setPhase('failed');
      setMessage(failed[0]?.reason ?? 'Something went wrong.');
      return;
    }

    for (const night of sleep.data) {
      logSleep(night.minutes, night.quality ?? undefined, night.date);
    }
    for (const day of activity.data) {
      if (day.steps != null) logSteps(day.steps, 'health', day.date);
    }
    // The hrvKind marker is dropped on the way in: the vitals store holds one
    // HRV series, and which flavour it is belongs on the reading rather than
    // on every row. Preferring SDNN consistently is what keeps a baseline
    // meaningful across a change of device.
    for (const { hrvKind: _hrvKind, ...day } of recovery.data) recordVitals(day);

    setResult({
      sleep: sleep.data.length,
      activity: activity.data.length,
      recovery: recovery.data.length,
      providers: coverageOf([
        ...sleep.data.map((d) => ({ date: d.date, provider: d.provider })),
        ...activity.data.map((d) => ({ date: d.date, provider: d.provider })),
      ]),
    });
    setPhase('done');
  };

  return (
    <Screen gradient>
      <ScreenHeader title="Open Wearables" subtitle="Garmin, WHOOP, Oura, Polar and the rest" />

      <Card style={{ gap: spacing.sm }}>
        <Text variant="body" color={colors.textDim}>
          Open Wearables is an open-source service that puts a dozen device makers behind one API. It is not something
          this app connects to on your behalf — you run it, on your own machine or server.
        </Text>
        <Text variant="caption" color={colors.textFaint}>{WEARABLES_NOTE}</Text>
      </Card>

      {!configured ? (
        <>
          <SectionHeader title="Not set up on this build" />
          <Card style={{ gap: spacing.sm }}>
            <Text variant="caption" color={colors.textDim}>
              Two variables point the app at your deployment, and neither is a secret:
            </Text>
            <Text variant="caption" color={colors.textFaint} style={styles.mono}>
              EXPO_PUBLIC_OPEN_WEARABLES_URL{'\n'}
              EXPO_PUBLIC_OPEN_WEARABLES_TOKEN_URL
            </Text>
            <Text variant="caption" color={colors.textDim}>
              The credentials that prove this app is this app live on your deployment of the backend in this repo —
              never in the app itself, where anybody who downloads it could read them.
            </Text>
            <Text variant="caption" color={colors.textFaint} style={styles.mono}>
              OPEN_WEARABLES_URL{'\n'}OPEN_WEARABLES_APP_ID{'\n'}OPEN_WEARABLES_APP_SECRET
            </Text>
          </Card>
        </>
      ) : (
        <>
          <SectionHeader title="Your account there" />
          <Card style={{ gap: spacing.md }}>
            <Input
              value={userId}
              onChangeText={setUserId}
              placeholder="User ID from your deployment"
              autoCapitalize="none"
            />
            <Text variant="caption" color={colors.textFaint}>
              The UUID the service gave your account. It is in the developer portal under Users.
            </Text>

            <View style={styles.chips}>
              {[30, 90, 365].map((d) => (
                <Chip key={d} label={d === 365 ? 'A year' : `${d} days`} selected={days === d} onPress={() => setDays(d)} />
              ))}
            </View>

            <Button
              title={phase === 'working' ? 'Pulling…' : 'Pull my history'}
              disabled={phase === 'working' || userId.trim().length < 8}
              onPress={() => void pull()}
            />
          </Card>
        </>
      )}

      {phase === 'failed' && message && (
        <Card style={{ marginTop: spacing.md, borderColor: colors.warning, borderWidth: StyleSheet.hairlineWidth }}>
          <Text variant="caption" color={colors.warning}>{message}</Text>
        </Card>
      )}

      {phase === 'done' && result && (
        <>
          <SectionHeader title="What came back" />
          <Card>
            <View style={{ flexDirection: 'row' }}>
              <StatTile value={`${result.sleep}`} label="Nights" accent={colors.sleep} />
              <StatTile value={`${result.activity}`} label="Days" accent={colors.steps} />
              <StatTile value={`${result.recovery}`} label="Vitals" accent={colors.danger} />
            </View>
          </Card>

          {result.providers.length > 0 ? (
            <>
              <SectionHeader title="Where it came from" />
              <Card style={{ gap: spacing.sm }}>
                {result.providers.map((p) => (
                  <View key={p.provider} style={styles.row}>
                    <Icon name="watch" size={15} color={colors.textDim} />
                    <Text variant="body" style={{ flex: 1 }}>{providerLabel(p.provider)}</Text>
                    <Text variant="caption" color={colors.textFaint}>
                      {p.days} {p.days === 1 ? 'day' : 'days'} · to {formatDayMonth(p.last)}
                    </Text>
                  </View>
                ))}
                <Text variant="caption" color={colors.textFaint}>
                  A device you linked and stopped wearing shows here as the handful of days it actually covered, rather
                  than as a tick.
                </Text>
              </Card>
            </>
          ) : (
            <EmptyState
              icon="watch"
              title="Nothing in that window"
              subtitle="The service is reachable and your account is valid, but it holds no data for these dates. Usually it means a provider is linked but has not synced yet."
            />
          )}

          <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
            {HRV_KIND_NOTE}
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  mono: { fontFamily: 'monospace' as const, lineHeight: 18 },
});

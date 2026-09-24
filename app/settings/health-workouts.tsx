import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, EmptyState, Pill, Screen, SectionHeader, SegmentedControl, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, spacing } from '../../src/theme';
import {
  HEALTH_WORKOUTS_NOTE,
  SOURCE_LABEL,
  summarise,
  type ImportedWorkout,
  type ImportSummary,
} from '../../src/domain/healthWorkouts';
import { health } from '../../src/services/health';
import { formatDayMonth } from '../../src/domain/date';
import { useActivityStore } from '../../src/stores/useActivityStore';

type Phase = 'idle' | 'reading' | 'ready' | 'saved' | 'empty' | 'unavailable';

const WINDOWS = [30, 90, 365];

/**
 * Pulling workouts out of Apple Health.
 *
 * The point of this screen, for anybody who does not wear an Apple Watch: a
 * Garmin, a WHOOP, a Polar or a Coros already syncs to Health through its own
 * app, and that means ForgeFit can read those sessions without a single
 * vendor integration, OAuth flow or API key. This is the cheapest wearable
 * support there is and it covers most of what Open Wearables would.
 *
 * It shows what it found *before* importing, grouped by which app wrote it,
 * because "12 workouts" is not enough for somebody to tell whether it picked
 * up the right ones.
 */
export default function HealthWorkouts() {
  const importWorkouts = useActivityStore((s) => s.importHealthWorkouts);

  const [days, setDays] = useState(90);
  const [phase, setPhase] = useState<Phase>('idle');
  const [found, setFound] = useState<ImportedWorkout[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [saved, setSaved] = useState(0);

  const scan = async () => {
    if (!health.hasNativeModule) {
      setPhase('unavailable');
      return;
    }
    setPhase('reading');

    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    // The service dedupes before this sees them, so the summary's
    // "duplicates dropped" is measured against what actually came back.
    const workouts = await health.readWorkouts(from, to);

    setFound(workouts);
    setSummary(summarise(workouts, workouts));
    setPhase(workouts.length > 0 ? 'ready' : 'empty');
  };

  const save = () => {
    const added = importWorkouts(found);
    setSaved(added);
    setPhase('saved');
  };

  return (
    <Screen gradient>
      <ScreenHeader title="Import from Health" subtitle="Garmin, WHOOP, Polar, the Watch" />

      <View style={{ gap: spacing.md }}>
        <Card tone="alt">
          <Text variant="caption" color={colors.textDim}>
            {HEALTH_WORKOUTS_NOTE}
          </Text>
        </Card>

        <Card style={{ gap: spacing.sm }}>
          <SectionHeader title="How far back" />
          <SegmentedControl
            options={WINDOWS.map((d) => ({ label: d === 365 ? '1 year' : `${d} days`, value: String(d) }))}
            value={String(days)}
            onChange={(d) => {
              setDays(Number(d));
              // A window change invalidates what is on screen; leaving the
              // old list under a new window is how the wrong set gets saved.
              setPhase('idle');
              setFound([]);
            }}
          />
          <Button
            title={phase === 'reading' ? 'Reading Health…' : 'See what is there'}
            loading={phase === 'reading'}
            onPress={() => void scan()}
          />
        </Card>

        {phase === 'unavailable' && (
          <EmptyState
            icon="watch"
            title="Needs a development build"
            subtitle="Apple Health is a native framework, so Expo Go cannot reach it. Build with EAS and this works — see BUILDING.md."
          />
        )}

        {phase === 'empty' && (
          <EmptyState
            icon="watch"
            title="Nothing in that window"
            subtitle="Either nothing has written a workout to Health, or ForgeFit has not been granted permission to read workouts. Both look the same from here — Apple never tells an app which reads were declined."
          />
        )}

        {(phase === 'ready' || phase === 'saved') && summary && (
          <>
            <Card style={{ gap: spacing.sm }}>
              <SectionHeader title={`${summary.total} ${summary.total === 1 ? 'workout' : 'workouts'}`} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {summary.bySource.map((row) => (
                  <Pill key={row.source} label={`${row.label} · ${row.count}`} color={colors.info} />
                ))}
              </View>
              {summary.duplicatesDropped > 0 && (
                <Text variant="caption" color={colors.textDim}>
                  {summary.duplicatesDropped} duplicate{summary.duplicatesDropped === 1 ? '' : 's'} dropped — the same
                  session recorded by two apps. Importing both would double your distance and your training load.
                </Text>
              )}
            </Card>

            <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
              {found.slice(0, 20).map((w) => (
                <View
                  key={w.uuid}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {w.type} · {formatDayMonth(w.date)}
                    </Text>
                    <Text variant="caption" color={colors.textFaint}>
                      {SOURCE_LABEL[w.source]}
                      {w.distanceM != null ? ` · ${(w.distanceM / 1000).toFixed(2)} km` : ''}
                      {` · ${Math.round(w.durationS / 60)} min`}
                    </Text>
                  </View>
                  {w.energyKcal != null && (
                    <Text variant="bodyStrong" color={colors.calorie}>
                      {w.energyKcal}
                    </Text>
                  )}
                </View>
              ))}
              {found.length > 20 && (
                <Text variant="caption" color={colors.textFaint} style={{ paddingVertical: spacing.sm }}>
                  …and {found.length - 20} more.
                </Text>
              )}
            </Card>

            {phase === 'saved' ? (
              <Card tone="alt" style={{ gap: spacing.xs }}>
                <Text variant="bodyStrong">
                  {saved} added, {found.length - saved} already had.
                </Text>
                <Text variant="caption" color={colors.textDim}>
                  Re-running this is safe: each workout carries Health&apos;s own id, so an import you have already
                  done is recognised rather than duplicated.
                </Text>
              </Card>
            ) : (
              <Button title={`Import ${found.length}`} onPress={save} />
            )}

            <Text variant="caption" color={colors.textFaint}>
              These carry distance, duration and calories but no route — Health stores a workout&apos;s GPS trace
              separately and most apps do not write it. Runs you record in ForgeFit itself keep their full trace.
            </Text>
          </>
        )}
      </View>
    </Screen>
  );
}

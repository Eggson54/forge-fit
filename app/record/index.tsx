import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Chip, Screen, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { MapView } from '../../src/components/MapView';
import { Icon } from '../../src/components/Icon';
import { colors, spacing } from '../../src/theme';
import { CARDIO_KINDS } from '../../src/domain/cardio';
import { formatDuration, formatPaceSec, paceFrom } from '../../src/domain/track';
import { displayDistance } from '../../src/domain/cardio';
import { useRecorderStore } from '../../src/stores/useRecorderStore';
import { useActivityStore } from '../../src/stores/useActivityStore';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { useMapStore } from '../../src/stores/useMapStore';

/** Only the kinds where a route means anything. A rower has no map. */
const OUTDOOR = ['run', 'ride', 'walk', 'hike'];

export default function Record() {
  const state = useRecorderStore((s) => s.state);
  const points = useRecorderStore((s) => s.points);
  const type = useRecorderStore((s) => s.type);
  const accuracy = useRecorderStore((s) => s.accuracy);
  const error = useRecorderStore((s) => s.error);
  const setType = useRecorderStore((s) => s.setType);
  const start = useRecorderStore((s) => s.start);
  const pause = useRecorderStore((s) => s.pause);
  const resume = useRecorderStore((s) => s.resume);
  const discard = useRecorderStore((s) => s.discard);
  const finish = useRecorderStore((s) => s.finish);
  const save = useActivityStore((s) => s.save);
  const units = useProfileStore((s) => s.profile.units);
  const zones = useMapStore((s) => s.zones);
  const sourceId = useMapStore((s) => s.sourceId);

  // A ticking clock the store does not hold: elapsed time is derived from
  // wall-clock, so re-rendering once a second is all it takes to animate it,
  // and nothing about the recording depends on this interval firing.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (state !== 'recording') return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [state]);

  const stats = useRecorderStore.getState().stats();
  const elapsed = useRecorderStore.getState().elapsedMs() / 1000;
  const distance = displayDistance(stats.distanceM / 1000, units);
  const pace = paceFrom(stats, units);
  const live = state === 'recording' || state === 'paused';

  const [tooShort, setTooShort] = useState(false);

  const onFinish = () => {
    const result = finish();
    if (!result) {
      // Nothing worth keeping. Say so rather than writing a four-metre
      // activity into the history and leaving them to find it later.
      setTooShort(true);
      return;
    }
    setTooShort(false);
    const saved = save({ type: result.type, points: result.points, date: result.date });
    if (saved) router.replace(`/record/${saved.id}`);
  };

  return (
    <Screen gradient>
      <ScreenHeader title={live ? 'Recording' : 'Record a route'} />

      {!live && (
        <>
          <View style={styles.kinds}>
            {CARDIO_KINDS.filter((k) => OUTDOOR.includes(k.type)).map((k) => (
              <Chip key={k.type} label={k.label} selected={type === k.type} onPress={() => setType(k.type)} />
            ))}
          </View>

          <Card style={{ gap: spacing.md, marginTop: spacing.md }}>
            <Text variant="body" color={colors.textDim}>
              The phone records where you go, and the app works out distance, pace, climbing, splits and your times on
              any segment you pass through.
            </Text>
            <Text variant="caption" color={colors.textFaint}>
              Nothing is recorded until you press start, and it stops the moment you finish. The route stays on your
              device unless you turn on cloud sync.
            </Text>
          </Card>

          {tooShort && (
            <Card style={{ marginTop: spacing.md, borderColor: colors.warning, borderWidth: StyleSheet.hairlineWidth }}>
              <Text variant="caption" color={colors.warning}>
                That recording was too short to keep — under twenty metres. Nothing was saved.
              </Text>
            </Card>
          )}

          {error && (
            <Card style={{ marginTop: spacing.md, borderColor: colors.warning, borderWidth: StyleSheet.hairlineWidth }}>
              <Text variant="caption" color={colors.warning}>{error}</Text>
            </Card>
          )}

          <View style={{ marginTop: spacing.xl }}>
            <Button
              title={state === 'requesting' ? 'Asking for location…' : 'Start'}
              size="lg"
              onPress={() => void start()}
              disabled={state === 'requesting'}
            />
          </View>
        </>
      )}

      {live && (
        <>
          <Card style={{ gap: spacing.lg, alignItems: 'center' }}>
            <Text variant="metricLg">{formatDuration(elapsed)}</Text>
            <View style={{ flexDirection: 'row', gap: spacing.xl }}>
              <Stat label={units === 'imperial' ? 'Miles' : 'Km'} value={distance ? `${distance.value}` : '0.00'} />
              <Stat label="Pace" value={pace ? formatPaceSec(pace, units === 'imperial' ? 'mi' : 'km').split(' ')[0]! : '—'} />
              <Stat label="Climb" value={`${stats.ascentM} m`} />
            </View>
            {/* Honest about what the receiver is doing. "Searching" beats a
                zero that looks like standing still. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon
                name="target"
                size={13}
                color={accuracy == null ? colors.textFaint : accuracy <= 12 ? colors.success : colors.amber}
              />
              <Text variant="caption" color={colors.textFaint}>
                {accuracy == null
                  ? 'Waiting for a fix…'
                  : accuracy <= 12
                    ? `Good signal · ${points.length} fixes`
                    : `Weak signal, ±${Math.round(accuracy)} m · ${points.length} fixes`}
              </Text>
            </View>
          </Card>

          {/* Live, and deliberately not interactive: a map that pans while
              someone is running would need dragging back before it is useful
              again, one-handed, out of breath. */}
          <MapView
            routes={[points]}
            zones={zones}
            units={units}
            height={220}
            sourceId={sourceId}
            interactive={false}
            style={{ marginTop: spacing.md }}
          />

          <View style={{ gap: spacing.sm, marginTop: spacing.xl }}>
            {state === 'recording' ? (
              <Button title="Pause" variant="secondary" size="lg" onPress={pause} />
            ) : (
              <Button title="Resume" size="lg" onPress={resume} />
            )}
            <Button title="Finish" variant="ghost" onPress={onFinish} />
            <Button title="Discard" variant="ghost" onPress={discard} />
          </View>

          <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
            Pace is measured over time you were actually moving, so a pause at a crossing does not drag it down.
          </Text>
        </>
      )}

      {!live && (
        <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.xl }}>
          Indoor sessions are still logged from Conditioning, where you type the numbers in.
          Recording is for the ones with a route.
        </Text>
      )}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Text variant="h3">{value}</Text>
      <Text variant="caption" color={colors.textDim}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});

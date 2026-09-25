import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, EmptyState, Input, Screen, SectionHeader, SegmentedControl, Text, Toggle } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, spacing } from '../../src/theme';
import {
  SOCIAL_ROUTE_WARNING,
  VISIBILITY_LABEL,
  VISIBILITY_NOTE,
  shareableFrom,
  type Visibility,
} from '../../src/domain/social';
import { describeEffect } from '../../src/domain/privacy';
import { social } from '../../src/services/social';
import { TraceMap } from '../../src/components/TraceMap';
import { useActivityStore } from '../../src/stores/useActivityStore';
import { useMapStore } from '../../src/stores/useMapStore';
import { photoPrivacyWarning, usablePhotos } from '../../src/domain/activityPhotos';

/**
 * Publishing one activity.
 *
 * Everything about this screen is built to make the route decision explicit
 * rather than implicit. It shows what will actually be published — the map
 * after trimming, not the one the athlete is used to seeing — because the
 * difference between those two is the whole point of privacy zones and
 * nobody checks a setting they have already forgotten about.
 *
 * 'Only me' is not offered. Not sharing is the default state of every
 * activity, so a share sheet whose options include "do not share" is just a
 * confusing way to press Back.
 */
export default function ShareActivity() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const activity = useActivityStore((s) => s.activities.find((a) => a.id === id) ?? null);
  const zones = useMapStore((s) => s.zones);

  const [visibility, setVisibility] = useState<Visibility>('followers');
  const [withRoute, setWithRoute] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);

  const outcome = useMemo(() => {
    if (!activity) return null;
    return shareableFrom(
      {
        id: activity.id,
        date: activity.date,
        type: activity.type,
        name: activity.name,
        points: activity.points,
        distanceM: activity.distanceM,
        movingS: activity.movingS,
        ascentM: activity.ascentM,
      },
      zones,
      visibility,
      { withRoute, note },
    );
  }, [activity, zones, visibility, withRoute, note]);

  const effect = useMemo(
    () => (activity ? describeEffect(activity.points, zones) : null),
    [activity, zones],
  );

  const photoWarning = useMemo(
    () =>
      photoPrivacyWarning({
        trimmed: (effect?.hidden ?? 0) > 0,
        photoCount: usablePhotos(activity?.photos ?? []).length,
      }),
    [effect, activity],
  );

  if (!activity) {
    return (
      <Screen gradient>
        <ScreenHeader title="Share" />
        <EmptyState icon="map" title="No such activity" subtitle="It may have been deleted." />
      </Screen>
    );
  }

  const publish = async () => {
    if (!outcome || outcome.kind !== 'ok') return;
    setBusy(true);
    setMessage('');
    const result = await social.share(outcome.share);
    setBusy(false);
    if (result.kind === 'ok') {
      setDone(true);
      return;
    }
    setMessage('reason' in result ? result.reason : 'Could not share that.');
  };

  return (
    <Screen gradient>
      <ScreenHeader title="Share activity" subtitle={activity.name} />

      <View style={{ gap: spacing.md }}>
        <Card style={{ gap: spacing.sm }}>
          <SectionHeader title="Who sees it" />
          <SegmentedControl
            options={(['followers', 'public'] as Visibility[]).map((v) => ({
              label: VISIBILITY_LABEL[v],
              value: v,
            }))}
            value={visibility}
            onChange={(v) => setVisibility(v as Visibility)}
          />
          <Text variant="caption" color={colors.textDim}>
            {VISIBILITY_NOTE[visibility]}
          </Text>
        </Card>

        <Card style={{ gap: spacing.sm }}>
          <SectionHeader title="The map" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Text variant="body" style={{ flex: 1 }}>
              Include the route
            </Text>
            <Toggle value={withRoute} onValueChange={setWithRoute} accessibilityLabel="Include the route" />
          </View>

          {withRoute && zones.length === 0 && (
            <Text variant="caption" color={colors.warning}>
              {SOCIAL_ROUTE_WARNING}
            </Text>
          )}

          {withRoute && effect && effect.hidden > 0 && (
            <Text variant="caption" color={colors.textDim}>
              {effect.hidden} of {activity.points.length} points sit inside your privacy zones and will not be
              published, leaving {effect.pieces} {effect.pieces === 1 ? 'piece' : 'pieces'}. The gaps stay gaps on
              purpose — joining them up would draw a line straight through what the zone hides.
            </Text>
          )}

          {/* Photos are not published with a shared activity — there is no
              upload path for them — but an athlete reading "privacy zone"
              here may assume the pictures were covered by it too. */}
          {photoWarning && (
            <Text variant="caption" color={colors.textDim}>
              The photos on this activity are not published with it — they stay on your device. Worth saying
              because a zone that hides part of the route does not hide them: {photoWarning}
            </Text>
          )}

          {/* Exactly what will be published, not what the athlete usually
              sees on the activity screen. */}
          {withRoute && outcome?.kind === 'ok' && outcome.share.route && (
            <>
              <Text variant="caption" color={colors.textFaint}>
                This is what other people will see:
              </Text>
              <TraceMap lines={outcome.share.route} height={160} />
            </>
          )}

          {outcome?.kind === 'refused' && (
            <Text variant="caption" color={colors.warning}>
              {outcome.reason}
            </Text>
          )}
        </Card>

        <Card style={{ gap: spacing.sm }}>
          <Input label="Say something (optional)" value={note} onChangeText={setNote} multiline placeholder="Felt good" />
        </Card>

        {done ? (
          <Card tone="alt" style={{ gap: spacing.sm }}>
            <Text variant="bodyStrong">Shared.</Text>
            <Text variant="caption" color={colors.textDim}>
              You can withdraw it at any time from the activity, and it disappears from everybody&apos;s feed.
            </Text>
            <Button title="See the feed" onPress={() => router.replace('/social')} />
          </Card>
        ) : (
          <>
            <Button
              title="Share it"
              loading={busy}
              disabled={outcome?.kind !== 'ok'}
              onPress={() => void publish()}
            />
            {message !== '' && (
              <Text variant="caption" color={colors.danger}>
                {message}
              </Text>
            )}
          </>
        )}

        <Text variant="caption" color={colors.textFaint}>
          Only the fields on this screen are published: the name, date, distance, moving time, climb, your note and
          the trimmed route. Nothing about your weight, nutrition, sleep or heart rate is shared, and the shared
          database has no column to put them in.
        </Text>
      </View>
    </Screen>
  );
}

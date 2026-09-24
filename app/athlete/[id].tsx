import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Button, Card, EmptyState, Pill, Screen, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, spacing } from '../../src/theme';
import {
  FOLLOW_ACTION_LABEL,
  VISIBILITY_LABEL,
  canViewActivity,
  displayNameFor,
  followState,
  type Athlete,
  type Follow,
  type FollowState,
  type SharedActivity,
} from '../../src/domain/social';
import { social } from '../../src/services/social';
import { TraceMap } from '../../src/components/TraceMap';
import { formatDayMonth } from '../../src/domain/date';
import { useAuthStore } from '../../src/stores/useAuthStore';

/**
 * Somebody else's profile.
 *
 * The interesting case is the one where you can see that a person exists but
 * not what they did: a followers-only athlete you have not been accepted by.
 * Showing an empty activity list there reads as "this person does nothing",
 * which is both wrong and slightly insulting. It says what is actually
 * happening instead.
 */
export default function AthleteProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useAuthStore((s) => s.user?.id ?? null);

  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [activities, setActivities] = useState<SharedActivity[]>([]);
  const [follows, setFollows] = useState<Follow[]>([]);
  const [state, setState] = useState<'loading' | 'ok' | 'blocked'>('loading');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [feed, edges] = await Promise.all([social.feed(200), social.follows()]);

    if (feed.kind !== 'ok') {
      setState('blocked');
      setReason('reason' in feed ? feed.reason : 'Could not load that profile.');
      return;
    }

    const found = feed.data.athletes.find((a) => a.id === id) ?? null;
    const edgeRows = edges.kind === 'ok' ? edges.data : [];
    setFollows(edgeRows);

    if (!found) {
      // Either they do not exist, or they are private — and the app must not
      // distinguish those, because doing so confirms an account exists to
      // somebody who has been deliberately shut out.
      setState('blocked');
      setReason('This athlete is not sharing a profile.');
      return;
    }

    setAthlete(found);
    setActivities(
      feed.data.activities.filter(
        (a) => a.userId === id && canViewActivity(me, a, found, edgeRows),
      ),
    );
    setState('ok');
  }, [id, me]);

  useEffect(() => {
    void load();
  }, [load]);

  const relationship: FollowState = athlete ? followState(me, athlete, follows) : 'unavailable';

  const act = async () => {
    if (!athlete) return;
    setBusy(true);
    const outcome =
      relationship === 'following' || relationship === 'mutual' || relationship === 'requested'
        ? await social.unfollow(athlete.id)
        : await social.follow(athlete);
    setBusy(false);
    if (outcome.kind === 'ok') {
      await load();
    } else if ('reason' in outcome) {
      setReason(outcome.reason);
    }
  };

  const actionLabel = FOLLOW_ACTION_LABEL[relationship];

  return (
    <Screen gradient>
      <ScreenHeader
        title={athlete ? displayNameFor(athlete) : 'Athlete'}
        subtitle={athlete?.handle ? `@${athlete.handle}` : undefined}
      />

      {state === 'loading' && (
        <Text variant="caption" color={colors.textFaint}>
          Loading…
        </Text>
      )}

      {state === 'blocked' && <EmptyState icon="people" title="Not available" subtitle={reason} />}

      {state === 'ok' && athlete && (
        <View style={{ gap: spacing.md }}>
          <Card style={{ gap: spacing.sm }}>
            {athlete.bio ? <Text variant="body">{athlete.bio}</Text> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              {athlete.locationText ? (
                <Text variant="caption" color={colors.textDim}>
                  {athlete.locationText}
                </Text>
              ) : null}
              <Pill label={VISIBILITY_LABEL[athlete.visibility]} color={colors.info} />
              {relationship === 'follows_you' || relationship === 'mutual' ? (
                <Pill label="Follows you" color={colors.lime} />
              ) : null}
            </View>

            {actionLabel && (
              <Button
                title={actionLabel}
                variant={relationship === 'none' || relationship === 'follows_you' ? 'primary' : 'secondary'}
                loading={busy}
                onPress={() => void act()}
              />
            )}
            {relationship === 'requested' && (
              <Text variant="caption" color={colors.textFaint}>
                They approve follow requests. Tap again to withdraw.
              </Text>
            )}
          </Card>

          {activities.length === 0 ? (
            <EmptyState
              icon="map"
              title="Nothing shared with you"
              subtitle={
                relationship === 'following' || relationship === 'mutual' || relationship === 'self'
                  ? 'They have not shared any activities yet.'
                  : 'Follow them to see the activities they share with followers.'
              }
            />
          ) : (
            activities.map((activity) => (
              <Card key={activity.id} style={{ gap: spacing.sm }}>
                <Text variant="bodyStrong">{activity.title}</Text>
                <Text variant="caption" color={colors.textFaint}>
                  {formatDayMonth(activity.occurredOn)} · {activity.kind}
                </Text>
                <View style={{ flexDirection: 'row', gap: spacing.lg }}>
                  <Stat label="Distance" value={km(activity.distanceM)} />
                  <Stat label="Moving" value={duration(activity.movingSeconds)} />
                </View>
                {activity.route && <TraceMap lines={activity.route} height={130} />}
              </Card>
            ))
          )}
        </View>
      )}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text variant="caption" color={colors.textFaint}>
        {label}
      </Text>
      <Text variant="bodyStrong">{value}</Text>
    </View>
  );
}

function km(metres: number | null): string {
  return metres == null || metres <= 0 ? '—' : `${(metres / 1000).toFixed(2)} km`;
}

function duration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

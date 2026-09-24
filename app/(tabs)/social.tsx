import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, EmptyState, IconButton, Pill, Screen, Text } from '../../src/components/ui';
import { Masthead } from '../../src/components/Masthead';
import { Icon } from '../../src/components/Icon';
import { colors, radius, spacing } from '../../src/theme';
import {
  SOCIAL_PRIVACY_NOTE,
  buildFeed,
  displayNameFor,
  type Athlete,
  type FeedItem,
  type Follow,
  type Kudos,
  type SharedActivity,
} from '../../src/domain/social';
import { social, type SocialOutcome } from '../../src/services/social';
import { TraceMap } from '../../src/components/TraceMap';
import { formatDayMonth } from '../../src/domain/date';
import { useAuthStore } from '../../src/stores/useAuthStore';

/**
 * The feed.
 *
 * Deliberately quiet about what it cannot do. Social is the one part of this
 * app with no offline fallback — other people's activities are not on this
 * device — so an empty screen here has several quite different causes, and
 * showing the same blank list for all of them is how people conclude an app
 * is broken. Each one gets its own sentence.
 */
export default function Feed() {
  const me = useAuthStore((s) => s.user?.id ?? null);

  const [items, setItems] = useState<FeedItem[]>([]);
  const [follows, setFollows] = useState<Follow[]>([]);
  const [state, setState] = useState<'loading' | 'ok' | 'blocked'>('loading');
  const [reason, setReason] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [feed, edges] = await Promise.all([social.feed(), social.follows()]);

    if (feed.kind !== 'ok') {
      setState('blocked');
      setReason(reasonOf(feed));
      return;
    }

    const followRows = edges.kind === 'ok' ? edges.data : [];
    setFollows(followRows);
    setItems(
      buildFeed(
        me,
        feed.data.activities,
        feed.data.athletes,
        feed.data.kudos,
        {},
        followRows,
      ),
    );
    setState('ok');
  }, [me]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  /**
   * Kudos are applied locally first.
   *
   * A round trip before the heart fills in makes it feel broken on a phone
   * signal. If the write fails the state is put back, so an optimistic count
   * never survives a rejection.
   */
  const toggleKudos = async (item: FeedItem) => {
    const had = item.kudos.mine;
    setItems((current) =>
      current.map((f) =>
        f.activity.id === item.activity.id
          ? { ...f, kudos: { count: f.kudos.count + (had ? -1 : 1), mine: !had } }
          : f,
      ),
    );

    const outcome = had ? await social.takeKudos(item.activity.id) : await social.giveKudos(item.activity.id);
    if (outcome.kind !== 'ok') {
      setItems((current) =>
        current.map((f) =>
          f.activity.id === item.activity.id
            ? { ...f, kudos: { count: f.kudos.count + (had ? 1 : -1), mine: had } }
            : f,
        ),
      );
    }
  };

  const pendingRequests = follows.filter((f) => f.followeeId === me && f.status === 'pending').length;

  return (
    <Screen gradient scroll={false}>
      {/* Masthead, not ScreenHeader: this is a root tab now, and
          ScreenHeader carries a back chevron that has nowhere to go. */}
      <Masthead
        eyebrow="People you follow"
        title="Social"
        accent={colors.lime}
        right={
          <IconButton size={40} accessibilityLabel="Social settings" onPress={() => router.push('/settings/social')}>
            <Icon name="gear" size={19} color={colors.text} strokeWidth={1.8} />
          </IconButton>
        }
      />

      <ScrollView
        contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.textDim} />}
      >
        {pendingRequests > 0 && (
          <Pressable onPress={() => router.push('/settings/social')} accessibilityRole="button">
            <Card tone="alt">
              <Text variant="bodyStrong">
                {pendingRequests} follow {pendingRequests === 1 ? 'request' : 'requests'}
              </Text>
              <Text variant="caption" color={colors.textDim}>
                Tap to review who is asking to see your activities.
              </Text>
            </Card>
          </Pressable>
        )}

        {state === 'loading' && (
          <Text variant="caption" color={colors.textFaint}>
            Loading…
          </Text>
        )}

        {/* This is a tab, so it is the first thing a lot of people will see,
            and "not configured" is a developer's sentence rather than an
            answer. It says what social is for, then what is in the way. */}
        {state === 'blocked' && (
          <View style={{ gap: spacing.md }}>
            <Card style={{ gap: spacing.sm }}>
              <Text variant="h3">Train with other people</Text>
              <Text variant="body" color={colors.textDim}>
                Follow people, give kudos, and put a leaderboard next to the work. Sharing is per activity and off
                until you turn it on — nothing here goes out by accident.
              </Text>
              <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
                <Bullet text="Your routes are cut to your privacy zones before they leave the phone." />
                <Bullet text="Weight, nutrition, sleep and bloodwork are never shared, and the shared database has nowhere to put them." />
                <Bullet text="Going private applies to the followers you already have." />
              </View>
            </Card>

            <Card tone="alt" style={{ gap: spacing.xs }}>
              <Text variant="label" color={colors.textDim}>
                Not switched on yet
              </Text>
              <Text variant="caption" color={colors.textDim}>
                {reason}
              </Text>
            </Card>

            <Button title="Clubs and leaderboards" variant="secondary" onPress={() => router.push('/clubs')} />
          </View>
        )}

        {state === 'ok' && items.length === 0 && (
          <>
            <EmptyState
              icon="people"
              title="Your feed is empty"
              subtitle="Follow someone, or share one of your own activities, and it will show up here."
            />
            <Button title="Find people" variant="secondary" onPress={() => router.push('/settings/social')} />
          </>
        )}

        {items.map((item) => (
          <FeedCard key={item.activity.id} item={item} onKudos={() => void toggleKudos(item)} />
        ))}

        {state === 'ok' && (
          <Text variant="caption" color={colors.textFaint}>
            {SOCIAL_PRIVACY_NOTE}
          </Text>
        )}
      </ScrollView>
    </Screen>
  );
}

function FeedCard({ item, onKudos }: { item: FeedItem; onKudos: () => void }) {
  const { activity, athlete, kudos } = item;

  return (
    <Card style={{ gap: spacing.sm }}>
      <Pressable
        onPress={() => router.push({ pathname: '/athlete/[id]', params: { id: athlete.id } })}
        accessibilityRole="button"
        accessibilityLabel={`${displayNameFor(athlete)}'s profile`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
      >
        <View style={styles.avatar}>
          <Text variant="label" color={colors.text}>
            {initialsFor(displayNameFor(athlete))}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {displayNameFor(athlete)}
          </Text>
          <Text variant="caption" color={colors.textFaint}>
            {formatDayMonth(activity.occurredOn)}
            {activity.kind ? ` · ${activity.kind}` : ''}
          </Text>
        </View>
        {item.own && <Pill label="You" color={colors.lime} />}
      </Pressable>

      <Text variant="bodyStrong">{activity.title}</Text>
      {activity.note ? (
        <Text variant="caption" color={colors.textDim}>
          {activity.note}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        <Stat label="Distance" value={formatKm(activity.distanceM)} />
        <Stat label="Moving" value={formatDuration(activity.movingSeconds)} />
        <Stat label="Climb" value={activity.elevationGainM != null ? `${Math.round(activity.elevationGainM)} m` : '—'} />
      </View>

      {/* The route, if they shared one. Already trimmed to their privacy
          zones before it left their device — this only draws what arrived. */}
      {activity.route && <TraceMap lines={activity.route} height={140} />}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        {/* Your own activity gets a count and no button. The row-level policy
            would happily accept a kudos from you on it — you can see it, which
            is all the policy checks — so this is the only thing stopping
            somebody applauding themselves. */}
        {item.own ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="bolt" size={18} color={colors.textFaint} />
            <Text variant="label" color={colors.textFaint}>
              {kudosLabel(kudos.count)}
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={onKudos}
            accessibilityRole="button"
            accessibilityState={{ selected: kudos.mine }}
            accessibilityLabel={kudos.mine ? 'Take back your kudos' : 'Give kudos'}
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Icon name="bolt" size={18} color={kudos.mine ? colors.primary : colors.textFaint} />
            <Text variant="label" color={kudos.mine ? colors.primary : colors.textFaint}>
              {kudosLabel(kudos.count)}
            </Text>
          </Pressable>
        )}
      </View>
    </Card>
  );
}

/** "Kudos", "1 Kudo", "4 Kudos" — never a leading space on a zero count. */
function kudosLabel(count: number): string {
  if (count <= 0) return 'Kudos';
  return `${count} ${count === 1 ? 'Kudo' : 'Kudos'}`;
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      <Text variant="caption" color={colors.lime}>
        •
      </Text>
      <Text variant="caption" color={colors.textDim} style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
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

function reasonOf(outcome: SocialOutcome<unknown>): string {
  return 'reason' in outcome ? outcome.reason : 'Something went wrong loading the feed.';
}

export function initialsFor(name: string): string {
  const parts = name.replace(/^@/, '').split(/[\s_]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

function formatKm(metres: number | null): string {
  if (metres == null || metres <= 0) return '—';
  return `${(metres / 1000).toFixed(2)} km`;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export type { Athlete, Kudos, SharedActivity };

const styles = StyleSheet.create({
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

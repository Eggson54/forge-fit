import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, EmptyState, Pill, Screen, SectionHeader, SegmentedControl, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, spacing } from '../../src/theme';
import {
  CLUB_NOTE,
  METRIC_LABEL,
  ROLE_LABEL,
  isMember,
  leaderboard,
  roleOf,
  sortRoster,
  type Club,
  type ClubMember,
  type LeaderboardMetric,
} from '../../src/domain/clubs';
import { displayNameFor, type Athlete, type SharedActivity } from '../../src/domain/social';
import { social } from '../../src/services/social';
import { addDaysISO, todayISO } from '../../src/domain/date';
import { useAuthStore } from '../../src/stores/useAuthStore';

const METRICS: LeaderboardMetric[] = ['distance', 'elevation', 'time', 'activities'];
const WINDOWS = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

/**
 * One club, and its leaderboard.
 *
 * The leaderboard counts only what members chose to publish, which is worth
 * saying on the screen: somebody near the bottom who trains hard but shares
 * nothing should understand why, rather than concluding the app cannot count.
 */
export default function ClubDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useAuthStore((s) => s.user?.id ?? null);

  const [club, setClub] = useState<Club | null>(null);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [activities, setActivities] = useState<SharedActivity[]>([]);
  const [state, setState] = useState<'loading' | 'ok' | 'blocked'>('loading');
  const [reason, setReason] = useState('');

  const [metric, setMetric] = useState<LeaderboardMetric>('distance');
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    if (!id) return;
    const [clubs, feed] = await Promise.all([social.clubs(), social.feed(200)]);

    if (clubs.kind !== 'ok') {
      setState('blocked');
      setReason('reason' in clubs ? clubs.reason : 'Could not load that club.');
      return;
    }

    const found = clubs.data.clubs.find((c) => c.id === id) ?? null;
    if (!found) {
      setState('blocked');
      setReason('That club is private, or it no longer exists.');
      return;
    }

    setClub(found);
    setMembers(clubs.data.members.filter((m) => m.clubId === id));
    setAthletes(feed.kind === 'ok' ? feed.data.athletes : []);
    setActivities(feed.kind === 'ok' ? feed.data.activities : []);
    setState('ok');
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const athleteMap = useMemo(() => new Map(athletes.map((a) => [a.id, a])), [athletes]);

  const rows = useMemo(
    () =>
      club
        ? leaderboard(members, activities, athleteMap, metric, { from: addDaysISO(todayISO(), -days), to: todayISO() }, me)
        : [],
    [club, members, activities, athleteMap, metric, days, me],
  );

  const roster = useMemo(() => sortRoster(members, athleteMap), [members, athleteMap]);
  const myRole = club ? roleOf(club.id, me, members) : null;

  return (
    <Screen gradient>
      <ScreenHeader title={club?.name ?? 'Club'} subtitle={`${members.length} members`} />

      {state === 'loading' && (
        <Text variant="caption" color={colors.textFaint}>
          Loading…
        </Text>
      )}

      {state === 'blocked' && <EmptyState icon="rivals" title="Not available" subtitle={reason} />}

      {state === 'ok' && club && (
        <View style={{ gap: spacing.md }}>
          {club.description ? (
            <Card>
              <Text variant="body">{club.description}</Text>
            </Card>
          ) : null}

          <Card style={{ gap: spacing.sm }}>
            <SectionHeader title="Leaderboard" />
            <SegmentedControl
              options={METRICS.map((m) => ({ label: METRIC_LABEL[m], value: m }))}
              value={metric}
              onChange={(m) => setMetric(m as LeaderboardMetric)}
            />
            <SegmentedControl
              options={WINDOWS.map((w) => ({ label: w.label, value: String(w.days) }))}
              value={String(days)}
              onChange={(d) => setDays(Number(d))}
            />

            {rows.map((row) => (
              <View key={row.userId} style={styles.row}>
                <Text variant="label" color={colors.textFaint} style={{ width: 28 }}>
                  {row.rank}
                </Text>
                <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                  {row.athlete ? displayNameFor(row.athlete) : 'Someone'}
                </Text>
                {row.you && <Pill label="You" color={colors.lime} />}
                <Text variant="bodyStrong">{formatValue(metric, row.value)}</Text>
              </View>
            ))}

            <Text variant="caption" color={colors.textFaint}>
              Counts only activities members shared to ForgeFit in this window. Somebody who trains without sharing
              will show zero, which is not the same as not training.
            </Text>
          </Card>

          <Card style={{ gap: spacing.sm }}>
            <SectionHeader title="Members" />
            {roster.map(({ member, athlete }) => (
              <View key={member.userId} style={styles.row}>
                <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
                  {athlete ? displayNameFor(athlete) : 'Someone'}
                </Text>
                <Pill label={ROLE_LABEL[member.role]} color={member.role === 'member' ? colors.info : colors.lime} />
              </View>
            ))}
          </Card>

          {isMember(club.id, me, members) && myRole !== 'owner' && (
            <Button
              title="Leave this club"
              variant="ghost"
              onPress={async () => {
                await social.leaveClub(club.id);
                router.back();
              }}
            />
          )}

          <Text variant="caption" color={colors.textFaint}>
            {CLUB_NOTE}
          </Text>
        </View>
      )}
    </Screen>
  );
}

function formatValue(metric: LeaderboardMetric, value: number): string {
  switch (metric) {
    case 'distance':
      return `${(value / 1000).toFixed(1)} km`;
    case 'elevation':
      return `${value} m`;
    case 'time': {
      const h = Math.floor(value / 3600);
      const m = Math.floor((value % 3600) / 60);
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }
    case 'activities':
      return String(value);
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
});

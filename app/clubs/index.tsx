import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, EmptyState, Pill, Screen, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, spacing } from '../../src/theme';
import { CLUB_NOTE, isMember, roleOf, type Club, type ClubMember } from '../../src/domain/clubs';
import { social } from '../../src/services/social';
import { useAuthStore } from '../../src/stores/useAuthStore';

/**
 * Clubs you are in, and public ones you could join.
 *
 * A private club you are not in does not appear at all — the select policy
 * does not return it. That is deliberate rather than an omission: a list of
 * private clubs you cannot see inside is a list of groups of people who did
 * not want to be listed.
 */
export default function Clubs() {
  const me = useAuthStore((s) => s.user?.id ?? null);

  const [clubs, setClubs] = useState<Club[]>([]);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [state, setState] = useState<'loading' | 'ok' | 'blocked'>('loading');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    const outcome = await social.clubs();
    if (outcome.kind !== 'ok') {
      setState('blocked');
      setReason('reason' in outcome ? outcome.reason : 'Could not load clubs.');
      return;
    }
    setClubs(outcome.data.clubs);
    setMembers(outcome.data.members);
    setState('ok');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const mine = clubs.filter((c) => isMember(c.id, me, members));
  const others = clubs.filter((c) => !isMember(c.id, me, members));

  return (
    <Screen gradient>
      <ScreenHeader title="Clubs" subtitle="Train with other people" />

      {state === 'loading' && (
        <Text variant="caption" color={colors.textFaint}>
          Loading…
        </Text>
      )}

      {state === 'blocked' && <EmptyState icon="people" title="Not available" subtitle={reason} />}

      {state === 'ok' && (
        <View style={{ gap: spacing.md }}>
          {mine.length === 0 && others.length === 0 && (
            <EmptyState
              icon="people"
              title="No clubs yet"
              subtitle="Public clubs you can join will appear here once somebody creates one."
            />
          )}

          {mine.length > 0 && (
            <>
              <Text variant="overline" color={colors.textDim}>
                Yours
              </Text>
              {mine.map((club) => (
                <ClubRow
                  key={club.id}
                  club={club}
                  role={roleOf(club.id, me, members)}
                  count={members.filter((m) => m.clubId === club.id).length}
                />
              ))}
            </>
          )}

          {others.length > 0 && (
            <>
              <Text variant="overline" color={colors.textDim}>
                You could join
              </Text>
              {others.map((club) => (
                <ClubRow
                  key={club.id}
                  club={club}
                  role={null}
                  count={members.filter((m) => m.clubId === club.id).length}
                  action={
                    <Button
                      title="Join"
                      variant="secondary"
                      onPress={async () => {
                        await social.joinClub(club.id);
                        await load();
                      }}
                    />
                  }
                />
              ))}
            </>
          )}

          <Text variant="caption" color={colors.textFaint}>
            {CLUB_NOTE}
          </Text>
        </View>
      )}
    </Screen>
  );
}

function ClubRow({
  club,
  role,
  count,
  action,
}: {
  club: Club;
  role: string | null;
  count: number;
  action?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/clubs/[id]', params: { id: club.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${club.name}, ${count} members`}
    >
      <Card style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
            {club.name}
          </Text>
          {role && <Pill label={role} color={colors.lime} />}
          {club.visibility === 'private' && <Pill label="Private" color={colors.info} />}
        </View>
        <Text variant="caption" color={colors.textFaint}>
          {count} {count === 1 ? 'member' : 'members'}
        </Text>
        {club.description ? (
          <Text variant="caption" color={colors.textDim} numberOfLines={2}>
            {club.description}
          </Text>
        ) : null}
        {action}
      </Card>
    </Pressable>
  );
}

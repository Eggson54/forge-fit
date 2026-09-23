import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, EmptyState, Input, Pill, Screen, SectionHeader, SegmentedControl, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, spacing } from '../../src/theme';
import {
  SOCIAL_PRIVACY_NOTE,
  SOCIAL_ROUTE_WARNING,
  VISIBILITIES,
  VISIBILITY_LABEL,
  VISIBILITY_NOTE,
  displayNameFor,
  followState,
  handleProblem,
  normaliseHandle,
  type Athlete,
  type Follow,
  type Visibility,
} from '../../src/domain/social';
import { social } from '../../src/services/social';
import { useAuthStore } from '../../src/stores/useAuthStore';

/**
 * Who can see you, and who is asking.
 *
 * The visibility control is the most consequential switch in the app, so it
 * carries the full sentence of what each setting means rather than a label
 * and a tooltip. 'private' is the default and is listed first, because the
 * order a picker is read in is itself a recommendation.
 */
export default function SocialSettings() {
  const me = useAuthStore((s) => s.user?.id ?? null);

  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [follows, setFollows] = useState<Follow[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [state, setState] = useState<'loading' | 'ok' | 'blocked'>('loading');
  const [message, setMessage] = useState('');

  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Athlete[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    const [mine, edges, feed] = await Promise.all([social.me(), social.follows(), social.feed(200)]);

    if (mine.kind !== 'ok') {
      setState('blocked');
      setMessage('reason' in mine ? mine.reason : 'Could not load your profile.');
      return;
    }

    setAthlete(mine.data);
    setHandle(mine.data.handle ?? '');
    setDisplayName(mine.data.displayName ?? '');
    setBio(mine.data.bio ?? '');
    setFollows(edges.kind === 'ok' ? edges.data : []);
    setAthletes(feed.kind === 'ok' ? feed.data.athletes : []);
    setState('ok');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (patch: Parameters<typeof social.updateMe>[0]) => {
    setSaving(true);
    setMessage('');
    const outcome = await social.updateMe(patch);
    setSaving(false);
    if (outcome.kind === 'ok') {
      setAthlete(outcome.data);
      setHandle(outcome.data.handle ?? '');
    } else if ('reason' in outcome) {
      setMessage(outcome.reason);
    }
  };

  const search = async () => {
    setSearching(true);
    const outcome = await social.findAthletes(query);
    setSearching(false);
    setFound(outcome.kind === 'ok' ? outcome.data : []);
    if (outcome.kind !== 'ok' && 'reason' in outcome) setMessage(outcome.reason);
  };

  const requests = follows.filter((f) => f.followeeId === me && f.status === 'pending');
  const followers = follows.filter((f) => f.followeeId === me && f.status === 'accepted');
  const following = follows.filter((f) => f.followerId === me && f.status === 'accepted');

  const nameOf = (id: string) => {
    const a = athletes.find((x) => x.id === id) ?? found.find((x) => x.id === id);
    return a ? displayNameFor(a) : 'Someone';
  };

  const handleIssue = handle.trim() ? handleProblem(handle) : null;

  return (
    <Screen gradient>
      <ScreenHeader title="Social" subtitle="Who can see you" />

      {state === 'loading' && (
        <Text variant="caption" color={colors.textFaint}>
          Loading…
        </Text>
      )}

      {state === 'blocked' && <EmptyState icon="rivals" title="Not available" subtitle={message} />}

      {state === 'ok' && athlete && (
        <View style={{ gap: spacing.md }}>
          <Card tone="alt">
            <Text variant="caption" color={colors.textDim}>
              {SOCIAL_PRIVACY_NOTE}
            </Text>
          </Card>

          {/* ---- visibility ---- */}
          <Card style={{ gap: spacing.sm }}>
            <SectionHeader title="Who can find you" />
            <SegmentedControl
              options={VISIBILITIES.map((v) => ({ label: VISIBILITY_LABEL[v], value: v }))}
              value={athlete.visibility}
              onChange={(v) => void save({ visibility: v as Visibility })}
            />
            <Text variant="caption" color={colors.textDim}>
              {VISIBILITY_NOTE[athlete.visibility]}
            </Text>
            {athlete.visibility !== 'private' && (
              <Text variant="caption" color={colors.warning}>
                {SOCIAL_ROUTE_WARNING}
              </Text>
            )}
            <Button
              title="Privacy zones"
              variant="ghost"
              onPress={() => router.push('/settings/privacy-zones')}
            />
          </Card>

          {/* ---- identity ---- */}
          <Card style={{ gap: spacing.sm }}>
            <SectionHeader title="Your profile" />
            <Input
              label="Handle"
              value={handle}
              onChangeText={setHandle}
              autoCapitalize="none"
              placeholder="alice_runs"
            />
            {handleIssue && (
              <Text variant="caption" color={colors.warning}>
                {handleIssue}
              </Text>
            )}
            {handle.trim() && !handleIssue && normaliseHandle(handle) !== handle && (
              <Text variant="caption" color={colors.textFaint}>
                Will be saved as @{normaliseHandle(handle)}
              </Text>
            )}
            <Input label="Name" value={displayName} onChangeText={setDisplayName} placeholder="Alice" />
            <Input label="Bio" value={bio} onChangeText={setBio} multiline placeholder="Marathon in April" />
            <Button
              title="Save"
              loading={saving}
              disabled={Boolean(handleIssue)}
              onPress={() => void save({ handle, displayName, bio })}
            />
            {message !== '' && (
              <Text variant="caption" color={colors.danger}>
                {message}
              </Text>
            )}
          </Card>

          {/* ---- requests ---- */}
          {requests.length > 0 && (
            <Card style={{ gap: spacing.sm }}>
              <SectionHeader title={`${requests.length} follow ${requests.length === 1 ? 'request' : 'requests'}`} />
              {requests.map((r) => (
                <View key={r.followerId} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text variant="body" style={{ flex: 1 }}>
                    {nameOf(r.followerId)}
                  </Text>
                  <Button
                    title="Accept"
                    variant="secondary"
                    onPress={async () => {
                      await social.acceptFollower(r.followerId);
                      await load();
                    }}
                  />
                  <Button
                    title="Decline"
                    variant="ghost"
                    onPress={async () => {
                      await social.removeFollower(r.followerId);
                      await load();
                    }}
                  />
                </View>
              ))}
            </Card>
          )}

          {/* ---- find people ---- */}
          <Card style={{ gap: spacing.sm }}>
            <SectionHeader title="Find people" />
            <Input
              icon="search"
              value={query}
              onChangeText={setQuery}
              placeholder="Search by handle"
              autoCapitalize="none"
              onSubmitEditing={() => void search()}
            />
            <Button title="Search" variant="secondary" loading={searching} onPress={() => void search()} />
            <Text variant="caption" color={colors.textFaint}>
              Only people who chose to be findable appear here. Private athletes never do.
            </Text>
            {found.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => router.push({ pathname: '/athlete/[id]', params: { id: a.id } })}
                accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}
              >
                <Text variant="body" style={{ flex: 1 }}>
                  {displayNameFor(a)}
                </Text>
                <Pill label={labelFor(followState(me, a, follows))} color={colors.info} />
              </Pressable>
            ))}
          </Card>

          {/* ---- counts ---- */}
          <Card style={{ flexDirection: 'row', gap: spacing.xl }}>
            <Count label="Followers" value={followers.length} />
            <Count label="Following" value={following.length} />
          </Card>
        </View>
      )}
    </Screen>
  );
}

function labelFor(state: ReturnType<typeof followState>): string {
  switch (state) {
    case 'following':
    case 'mutual':
      return 'Following';
    case 'requested':
      return 'Requested';
    case 'follows_you':
      return 'Follows you';
    case 'self':
      return 'You';
    default:
      return 'View';
  }
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <View>
      <Text variant="h3">{value}</Text>
      <Text variant="caption" color={colors.textFaint}>
        {label}
      </Text>
    </View>
  );
}

import { getSupabase } from './supabase';
import {
  initialFollowStatus,
  normaliseHandle,
  type Athlete,
  type Follow,
  type Kudos,
  type SharedActivity,
  type Visibility,
} from '../domain/social';
import type { Club, ClubMember } from '../domain/clubs';
import type { LatLon } from '../domain/geo';
import type { UUID } from '../domain/types';

/**
 * Talking to the social tables.
 *
 * Unlike every other feature in this app, this one genuinely cannot work
 * offline: other people's activities are not on this device and there is no
 * honest local fallback for them. So instead of a mock, every call returns an
 * outcome that says *why* there is nothing, and the screens show that rather
 * than an empty list that looks like nobody has posted.
 *
 * Nothing here re-implements the visibility rules. The row-level policies in
 * `0003_social.sql` are the enforcement, and `domain/social.ts` mirrors them
 * for the UI. A query in this file that filtered by visibility as well would
 * be a third copy of the rules to keep in step, and the one most likely to
 * drift.
 */

export type SocialOutcome<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'signed_out'; reason: string }
  | { kind: 'not_configured'; reason: string }
  | { kind: 'refused'; reason: string }
  | { kind: 'failed'; reason: string };

const NOT_CONFIGURED = {
  kind: 'not_configured' as const,
  reason:
    'Following people needs an account, and this build has no Supabase project configured. Everything else in the app works without one.',
};

const SIGNED_OUT = {
  kind: 'signed_out' as const,
  reason: 'Sign in to follow people and share activities.',
};

async function client() {
  const supa = getSupabase();
  if (!supa) return { supa: null, userId: null };
  const { data } = await supa.auth.getSession();
  return { supa, userId: data.session?.user.id ?? null };
}

function fail(error: unknown): SocialOutcome<never> {
  const message = error instanceof Error ? error.message : String(error);
  // A row-level policy rejection is not a bug and should not read like one.
  // Postgres reports it as a violation of "row-level security policy".
  if (/row-level security|violates row-level/i.test(message)) {
    return { kind: 'refused', reason: 'That is not something this account is allowed to do.' };
  }
  if (/duplicate key|already exists/i.test(message)) {
    return { kind: 'refused', reason: 'That handle is taken. Try another.' };
  }
  return { kind: 'failed', reason: message };
}

// ------------------------------------------------------------- shapes ------

interface AthleteRow {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  location_text: string | null;
  visibility: Visibility;
}

interface ActivityRow {
  id: string;
  user_id: string;
  local_id: string;
  kind: string;
  title: string | null;
  note: string | null;
  occurred_on: string;
  distance_m: number | null;
  moving_seconds: number | null;
  elevation_gain_m: number | null;
  route: string | null;
  visibility: Visibility;
}

const ATHLETE_COLUMNS = 'id, handle, display_name, avatar_url, bio, location_text, visibility';
const ACTIVITY_COLUMNS =
  'id, user_id, local_id, kind, title, note, occurred_on, distance_m, moving_seconds, elevation_gain_m, route, visibility';

function toAthlete(row: AthleteRow): Athlete {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    locationText: row.location_text,
    visibility: row.visibility,
  };
}

/**
 * Routes are stored as JSON rather than an encoded polyline.
 *
 * A polyline encoder would be smaller on the wire, but `trimToZones` produces
 * *several* lines and the standard encoding carries one. Flattening them to
 * fit the format would join the pieces back together and draw straight
 * through the gap a privacy zone just made — which is the exact failure the
 * trimming exists to prevent. Correctness wins over bytes here.
 */
function toRoute(raw: string | null): LatLon[][] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const lines = parsed.filter(
      (line): line is LatLon[] =>
        Array.isArray(line) &&
        line.every(
          (p) =>
            typeof p === 'object' && p !== null &&
            Number.isFinite((p as LatLon).lat) && Number.isFinite((p as LatLon).lon),
        ),
    );
    return lines.length ? lines : null;
  } catch {
    return null;
  }
}

function toActivity(row: ActivityRow): SharedActivity {
  return {
    id: row.id,
    userId: row.user_id,
    localId: row.local_id,
    kind: row.kind,
    title: row.title ?? 'Activity',
    note: row.note,
    occurredOn: row.occurred_on,
    distanceM: row.distance_m,
    movingSeconds: row.moving_seconds,
    elevationGainM: row.elevation_gain_m,
    route: toRoute(row.route),
    visibility: row.visibility,
  };
}

// -------------------------------------------------------------- calls ------

export const social = {
  enabled(): boolean {
    return getSupabase() !== null;
  },

  /** The signed-in athlete's own public profile row. */
  async me(): Promise<SocialOutcome<Athlete>> {
    const { supa, userId } = await client();
    if (!supa) return NOT_CONFIGURED;
    if (!userId) return SIGNED_OUT;

    try {
      const { data, error } = await supa.from('athletes').select(ATHLETE_COLUMNS).eq('id', userId).single();
      if (error) throw error;
      return { kind: 'ok', data: toAthlete(data as AthleteRow) };
    } catch (err) {
      return fail(err);
    }
  },

  async updateMe(patch: {
    handle?: string;
    displayName?: string;
    bio?: string;
    locationText?: string;
    visibility?: Visibility;
  }): Promise<SocialOutcome<Athlete>> {
    const { supa, userId } = await client();
    if (!supa) return NOT_CONFIGURED;
    if (!userId) return SIGNED_OUT;

    const row: Record<string, unknown> = {};
    // Normalised here as well as in the form, because the column's CHECK
    // constraint will reject anything else and a rejected update is a worse
    // error message than a corrected handle.
    if (patch.handle !== undefined) row.handle = normaliseHandle(patch.handle) || null;
    if (patch.displayName !== undefined) row.display_name = patch.displayName.trim() || null;
    if (patch.bio !== undefined) row.bio = patch.bio.trim() || null;
    if (patch.locationText !== undefined) row.location_text = patch.locationText.trim() || null;
    if (patch.visibility !== undefined) row.visibility = patch.visibility;

    try {
      const { data, error } = await supa
        .from('athletes')
        .update(row)
        .eq('id', userId)
        .select(ATHLETE_COLUMNS)
        .single();
      if (error) throw error;
      return { kind: 'ok', data: toAthlete(data as AthleteRow) };
    } catch (err) {
      return fail(err);
    }
  },

  /**
   * Find athletes by handle.
   *
   * Only ever returns people the policy lets through, which means private
   * athletes are invisible to search — that is what private means here, and
   * it is why there is no "search by email".
   */
  async findAthletes(query: string): Promise<SocialOutcome<Athlete[]>> {
    const { supa, userId } = await client();
    if (!supa) return NOT_CONFIGURED;
    if (!userId) return SIGNED_OUT;

    const handle = normaliseHandle(query);
    if (handle.length < 2) return { kind: 'ok', data: [] };

    try {
      const { data, error } = await supa
        .from('athletes')
        .select(ATHLETE_COLUMNS)
        .ilike('handle', `${handle}%`)
        .neq('id', userId)
        .limit(20);
      if (error) throw error;
      return { kind: 'ok', data: (data as AthleteRow[]).map(toAthlete) };
    } catch (err) {
      return fail(err);
    }
  },

  /** Every follow edge touching the signed-in user, both directions. */
  async follows(): Promise<SocialOutcome<Follow[]>> {
    const { supa, userId } = await client();
    if (!supa) return NOT_CONFIGURED;
    if (!userId) return SIGNED_OUT;

    try {
      const { data, error } = await supa
        .from('follows')
        .select('follower_id, followee_id, status')
        .or(`follower_id.eq.${userId},followee_id.eq.${userId}`);
      if (error) throw error;
      return {
        kind: 'ok',
        data: (data as { follower_id: string; followee_id: string; status: Follow['status'] }[]).map((r) => ({
          followerId: r.follower_id,
          followeeId: r.followee_id,
          status: r.status,
        })),
      };
    } catch (err) {
      return fail(err);
    }
  },

  async follow(target: Athlete): Promise<SocialOutcome<Follow>> {
    const { supa, userId } = await client();
    if (!supa) return NOT_CONFIGURED;
    if (!userId) return SIGNED_OUT;

    const status = initialFollowStatus(target);
    if (!status) {
      return { kind: 'refused', reason: 'That athlete is not accepting followers.' };
    }

    try {
      const { error } = await supa
        .from('follows')
        .upsert({ follower_id: userId, followee_id: target.id, status }, { onConflict: 'follower_id,followee_id' });
      if (error) throw error;
      return { kind: 'ok', data: { followerId: userId, followeeId: target.id, status } };
    } catch (err) {
      return fail(err);
    }
  },

  async unfollow(targetId: UUID): Promise<SocialOutcome<true>> {
    const { supa, userId } = await client();
    if (!supa) return NOT_CONFIGURED;
    if (!userId) return SIGNED_OUT;

    try {
      const { error } = await supa
        .from('follows')
        .delete()
        .eq('follower_id', userId)
        .eq('followee_id', targetId);
      if (error) throw error;
      return { kind: 'ok', data: true };
    } catch (err) {
      return fail(err);
    }
  },

  /** Accept a pending request. Only the followee's own policy allows this. */
  async acceptFollower(followerId: UUID): Promise<SocialOutcome<true>> {
    const { supa, userId } = await client();
    if (!supa) return NOT_CONFIGURED;
    if (!userId) return SIGNED_OUT;

    try {
      const { error } = await supa
        .from('follows')
        .update({ status: 'accepted' })
        .eq('follower_id', followerId)
        .eq('followee_id', userId);
      if (error) throw error;
      return { kind: 'ok', data: true };
    } catch (err) {
      return fail(err);
    }
  },

  /** Decline a request, or remove an existing follower. */
  async removeFollower(followerId: UUID): Promise<SocialOutcome<true>> {
    const { supa, userId } = await client();
    if (!supa) return NOT_CONFIGURED;
    if (!userId) return SIGNED_OUT;

    try {
      const { error } = await supa
        .from('follows')
        .delete()
        .eq('follower_id', followerId)
        .eq('followee_id', userId);
      if (error) throw error;
      return { kind: 'ok', data: true };
    } catch (err) {
      return fail(err);
    }
  },

  /**
   * Publish an activity.
   *
   * The caller must have produced `share` through `shareableFrom`, which is
   * where privacy zones are applied. Nothing in this function trims anything:
   * putting a second trimming step here would make it ambiguous which one was
   * responsible, and the one under test should be.
   */
  async share(share: Omit<SharedActivity, 'id' | 'userId'>): Promise<SocialOutcome<SharedActivity>> {
    const { supa, userId } = await client();
    if (!supa) return NOT_CONFIGURED;
    if (!userId) return SIGNED_OUT;

    try {
      const { data, error } = await supa
        .from('shared_activities')
        .upsert(
          {
            user_id: userId,
            local_id: share.localId,
            kind: share.kind,
            title: share.title,
            note: share.note ?? null,
            occurred_on: share.occurredOn,
            distance_m: share.distanceM,
            moving_seconds: share.movingSeconds,
            elevation_gain_m: share.elevationGainM,
            route: share.route ? JSON.stringify(share.route) : null,
            visibility: share.visibility,
          },
          { onConflict: 'user_id,local_id' },
        )
        .select(ACTIVITY_COLUMNS)
        .single();
      if (error) throw error;
      return { kind: 'ok', data: toActivity(data as ActivityRow) };
    } catch (err) {
      return fail(err);
    }
  },

  /** Withdraw a previously shared activity. */
  async unshare(localId: string): Promise<SocialOutcome<true>> {
    const { supa, userId } = await client();
    if (!supa) return NOT_CONFIGURED;
    if (!userId) return SIGNED_OUT;

    try {
      const { error } = await supa
        .from('shared_activities')
        .delete()
        .eq('user_id', userId)
        .eq('local_id', localId);
      if (error) throw error;
      return { kind: 'ok', data: true };
    } catch (err) {
      return fail(err);
    }
  },

  /**
   * The feed: everything readable, newest first.
   *
   * No visibility filter is applied in the query. The select policy already
   * restricts this to rows the caller may see, and adding a client-side
   * `.eq('visibility', ...)` here would be a second set of rules to keep in
   * step with the first.
   */
  async feed(limit = 50): Promise<SocialOutcome<{ activities: SharedActivity[]; athletes: Athlete[]; kudos: Kudos[] }>> {
    const { supa, userId } = await client();
    if (!supa) return NOT_CONFIGURED;
    if (!userId) return SIGNED_OUT;

    try {
      const { data: rows, error } = await supa
        .from('shared_activities')
        .select(ACTIVITY_COLUMNS)
        .order('occurred_on', { ascending: false })
        .limit(limit);
      if (error) throw error;

      const activities = (rows as ActivityRow[]).map(toActivity);
      if (activities.length === 0) {
        return { kind: 'ok', data: { activities: [], athletes: [], kudos: [] } };
      }

      const ownerIds = [...new Set(activities.map((a) => a.userId))];
      const activityIds = activities.map((a) => a.id);

      const [athleteResult, kudosResult] = await Promise.all([
        supa.from('athletes').select(ATHLETE_COLUMNS).in('id', ownerIds),
        supa.from('kudos').select('activity_id, user_id').in('activity_id', activityIds),
      ]);
      if (athleteResult.error) throw athleteResult.error;
      if (kudosResult.error) throw kudosResult.error;

      return {
        kind: 'ok',
        data: {
          activities,
          athletes: (athleteResult.data as AthleteRow[]).map(toAthlete),
          kudos: (kudosResult.data as { activity_id: string; user_id: string }[]).map((k) => ({
            activityId: k.activity_id,
            userId: k.user_id,
          })),
        },
      };
    } catch (err) {
      return fail(err);
    }
  },

  async giveKudos(activityId: UUID): Promise<SocialOutcome<true>> {
    const { supa, userId } = await client();
    if (!supa) return NOT_CONFIGURED;
    if (!userId) return SIGNED_OUT;

    try {
      const { error } = await supa
        .from('kudos')
        .upsert({ activity_id: activityId, user_id: userId }, { onConflict: 'activity_id,user_id' });
      if (error) throw error;
      return { kind: 'ok', data: true };
    } catch (err) {
      return fail(err);
    }
  },

  async takeKudos(activityId: UUID): Promise<SocialOutcome<true>> {
    const { supa, userId } = await client();
    if (!supa) return NOT_CONFIGURED;
    if (!userId) return SIGNED_OUT;

    try {
      const { error } = await supa
        .from('kudos')
        .delete()
        .eq('activity_id', activityId)
        .eq('user_id', userId);
      if (error) throw error;
      return { kind: 'ok', data: true };
    } catch (err) {
      return fail(err);
    }
  },

  async comments(activityId: UUID): Promise<SocialOutcome<{ id: string; userId: string; body: string; at: string }[]>> {
    const { supa, userId } = await client();
    if (!supa) return NOT_CONFIGURED;
    if (!userId) return SIGNED_OUT;

    try {
      const { data, error } = await supa
        .from('activity_comments')
        .select('id, user_id, body, created_at')
        .eq('activity_id', activityId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return {
        kind: 'ok',
        data: (data as { id: string; user_id: string; body: string; created_at: string }[]).map((c) => ({
          id: c.id,
          userId: c.user_id,
          body: c.body,
          at: c.created_at,
        })),
      };
    } catch (err) {
      return fail(err);
    }
  },

  async comment(activityId: UUID, body: string): Promise<SocialOutcome<true>> {
    const { supa, userId } = await client();
    if (!supa) return NOT_CONFIGURED;
    if (!userId) return SIGNED_OUT;

    const text = body.trim();
    // The column's CHECK enforces this too; catching it here gives a sentence
    // instead of a constraint name.
    if (!text) return { kind: 'refused', reason: 'Write something first.' };
    if (text.length > 1000) return { kind: 'refused', reason: 'That is longer than a comment can be.' };

    try {
      const { error } = await supa
        .from('activity_comments')
        .insert({ activity_id: activityId, user_id: userId, body: text });
      if (error) throw error;
      return { kind: 'ok', data: true };
    } catch (err) {
      return fail(err);
    }
  },

  // ------------------------------------------------------------ clubs ------

  async clubs(): Promise<SocialOutcome<{ clubs: Club[]; members: ClubMember[] }>> {
    const { supa, userId } = await client();
    if (!supa) return NOT_CONFIGURED;
    if (!userId) return SIGNED_OUT;

    try {
      const { data: clubRows, error } = await supa
        .from('clubs')
        .select('id, owner_id, name, slug, description, visibility')
        .limit(50);
      if (error) throw error;

      const clubs = (clubRows as {
        id: string;
        owner_id: string;
        name: string;
        slug: string | null;
        description: string | null;
        visibility: Club['visibility'];
      }[]).map((c) => ({
        id: c.id,
        ownerId: c.owner_id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        visibility: c.visibility,
      }));

      if (clubs.length === 0) return { kind: 'ok', data: { clubs: [], members: [] } };

      const { data: memberRows, error: memberError } = await supa
        .from('club_members')
        .select('club_id, user_id, role')
        .in('club_id', clubs.map((c) => c.id));
      if (memberError) throw memberError;

      return {
        kind: 'ok',
        data: {
          clubs,
          members: (memberRows as { club_id: string; user_id: string; role: ClubMember['role'] }[]).map((m) => ({
            clubId: m.club_id,
            userId: m.user_id,
            role: m.role,
          })),
        },
      };
    } catch (err) {
      return fail(err);
    }
  },

  async joinClub(clubId: UUID): Promise<SocialOutcome<true>> {
    const { supa, userId } = await client();
    if (!supa) return NOT_CONFIGURED;
    if (!userId) return SIGNED_OUT;

    try {
      const { error } = await supa
        .from('club_members')
        .upsert({ club_id: clubId, user_id: userId, role: 'member' }, { onConflict: 'club_id,user_id' });
      if (error) throw error;
      return { kind: 'ok', data: true };
    } catch (err) {
      return fail(err);
    }
  },

  async leaveClub(clubId: UUID): Promise<SocialOutcome<true>> {
    const { supa, userId } = await client();
    if (!supa) return NOT_CONFIGURED;
    if (!userId) return SIGNED_OUT;

    try {
      const { error } = await supa.from('club_members').delete().eq('club_id', clubId).eq('user_id', userId);
      if (error) throw error;
      return { kind: 'ok', data: true };
    } catch (err) {
      return fail(err);
    }
  },
};

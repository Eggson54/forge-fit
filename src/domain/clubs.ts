import type { ISODate, UUID } from './types';
import type { Athlete, SharedActivity } from './social';

/**
 * Clubs, and the leaderboards inside them.
 *
 * A leaderboard is the part of a social feature most likely to be quietly
 * wrong, because nobody checks arithmetic they agree with. Somebody in third
 * place who should be in second will notice; somebody in first who should be
 * in second will not. So the ranking rules are explicit and tested rather
 * than being whatever `sort` did.
 *
 * Two decisions shape the rest:
 *
 *  - **A leaderboard only ever counts activities that were shared to it.**
 *    There is no reading of anyone's private history: the input is
 *    `SharedActivity` rows, which exist only because their owner published
 *    them. A club cannot see more of you than you gave it.
 *  - **Ties share a rank.** Two people on exactly 42.0 km are both second,
 *    and the next is fourth. Making one of them arbitrarily third to keep the
 *    numbers consecutive invents a difference that is not in the data.
 */

export type ClubVisibility = 'private' | 'public';
export type ClubRole = 'owner' | 'admin' | 'member';

export interface Club {
  id: UUID;
  ownerId: UUID;
  name: string;
  slug: string | null;
  description?: string | null;
  visibility: ClubVisibility;
}

export interface ClubMember {
  clubId: UUID;
  userId: UUID;
  role: ClubRole;
}

export const ROLE_LABEL: Record<ClubRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

/** Ordered most to least powerful, so a roster reads sensibly. */
const ROLE_RANK: Record<ClubRole, number> = { owner: 0, admin: 1, member: 2 };

export function roleOf(clubId: UUID, userId: UUID | null, members: ClubMember[]): ClubRole | null {
  if (!userId) return null;
  return members.find((m) => m.clubId === clubId && m.userId === userId)?.role ?? null;
}

export function isMember(clubId: UUID, userId: UUID | null, members: ClubMember[]): boolean {
  return roleOf(clubId, userId, members) !== null;
}

/**
 * Whether someone may remove a member.
 *
 * The owner may remove anybody but themselves; an admin may remove ordinary
 * members only. Nobody can remove the owner, because a club with no owner has
 * no one who can delete it — and the owner leaving is a "delete the club"
 * decision, not a "leave" one.
 */
export function canRemove(
  actor: ClubRole | null,
  target: ClubRole,
  samePerson: boolean,
): boolean {
  if (target === 'owner') return false;
  if (samePerson) return true;
  if (actor === 'owner') return true;
  if (actor === 'admin') return target === 'member';
  return false;
}

/** The roster, strongest role first and then alphabetically by name. */
export function sortRoster(
  members: ClubMember[],
  athletes: Map<UUID, Athlete>,
): { member: ClubMember; athlete: Athlete | null }[] {
  return members
    .map((member) => ({ member, athlete: athletes.get(member.userId) ?? null }))
    .sort((a, b) => {
      const rank = ROLE_RANK[a.member.role] - ROLE_RANK[b.member.role];
      if (rank !== 0) return rank;
      const an = (a.athlete?.displayName ?? a.athlete?.handle ?? '').toLowerCase();
      const bn = (b.athlete?.displayName ?? b.athlete?.handle ?? '').toLowerCase();
      return an < bn ? -1 : an > bn ? 1 : 0;
    });
}

// ------------------------------------------------------- leaderboards ------

export type LeaderboardMetric = 'distance' | 'elevation' | 'time' | 'activities';

export const METRIC_LABEL: Record<LeaderboardMetric, string> = {
  distance: 'Distance',
  elevation: 'Elevation',
  time: 'Moving time',
  activities: 'Activities',
};

export interface LeaderboardRow {
  userId: UUID;
  athlete: Athlete | null;
  /** Metres, metres, seconds or a count, depending on the metric. */
  value: number;
  activities: number;
  /** 1-based. Ties share a rank and the next rank skips accordingly. */
  rank: number;
  /** True for the viewer's own row, which is pinned into view separately. */
  you: boolean;
}

function valueOf(activity: SharedActivity, metric: LeaderboardMetric): number {
  switch (metric) {
    case 'distance':
      return activity.distanceM ?? 0;
    case 'elevation':
      return activity.elevationGainM ?? 0;
    case 'time':
      return activity.movingSeconds ?? 0;
    case 'activities':
      return 1;
  }
}

export interface LeaderboardWindow {
  /** Inclusive. */
  from: ISODate;
  /** Inclusive. */
  to: ISODate;
}

/**
 * Rank the members of a club over a window.
 *
 * Members with nothing in the window are included on zero rather than
 * dropped. A leaderboard that silently omits people makes it impossible to
 * tell "did not run" from "is not in this club", and the second is the one
 * that generates support mail.
 *
 * Activities from people who are not members are ignored even if they were
 * passed in, so a caller that over-fetches cannot accidentally leak somebody
 * into a club they never joined.
 */
export function leaderboard(
  members: ClubMember[],
  activities: SharedActivity[],
  athletes: Map<UUID, Athlete>,
  metric: LeaderboardMetric,
  window: LeaderboardWindow,
  me: UUID | null = null,
): LeaderboardRow[] {
  const memberIds = new Set(members.map((m) => m.userId));

  const totals = new Map<UUID, { value: number; activities: number }>();
  for (const id of memberIds) totals.set(id, { value: 0, activities: 0 });

  for (const activity of activities) {
    if (!memberIds.has(activity.userId)) continue;
    if (activity.occurredOn < window.from || activity.occurredOn > window.to) continue;
    const bucket = totals.get(activity.userId)!;
    bucket.value += valueOf(activity, metric);
    bucket.activities += 1;
  }

  const rows = [...totals.entries()]
    .map(([userId, total]) => ({
      userId,
      athlete: athletes.get(userId) ?? null,
      value: Math.round(total.value),
      activities: total.activities,
      rank: 0,
      you: me != null && userId === me,
    }))
    .sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value;
      // Same total: more activities to get there is the tie-break people
      // expect, then a stable one so the order does not flicker.
      if (b.activities !== a.activities) return b.activities - a.activities;
      return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
    });

  let lastValue: number | null = null;
  let lastActivities: number | null = null;
  let lastRank = 0;
  rows.forEach((row, index) => {
    if (row.value === lastValue && row.activities === lastActivities) {
      row.rank = lastRank;
    } else {
      row.rank = index + 1;
      lastRank = row.rank;
      lastValue = row.value;
      lastActivities = row.activities;
    }
  });

  return rows;
}

/**
 * A slug from a club name.
 *
 * Matches `clubs_slug_shape`: lowercase, letters, digits and hyphens, 3 to 40
 * characters. Returns null when nothing usable survives, rather than an
 * invalid slug the insert will then reject.
 */
export function slugFrom(name: string): string | null {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 40)
    // Truncation can leave a trailing hyphen behind.
    .replace(/-+$/, '');
  return slug.length >= 3 ? slug : null;
}

export const CLUB_NOTE =
  'A club sees only the activities its members chose to share. Nothing is read from anybody’s private history, and no health data — weight, nutrition, sleep — is ever visible to a club.';

import {
  canRemove,
  isMember,
  leaderboard,
  roleOf,
  slugFrom,
  sortRoster,
  type ClubMember,
  type LeaderboardMetric,
} from '../domain/clubs';
import type { Athlete, SharedActivity } from '../domain/social';

const CLUB = 'club-1';

const member = (userId: string, role: ClubMember['role'] = 'member'): ClubMember => ({
  clubId: CLUB,
  userId,
  role,
});

const athlete = (id: string, displayName: string | null): Athlete => ({
  id,
  handle: id,
  displayName,
  visibility: 'public',
});

const act = (
  userId: string,
  occurredOn: string,
  over: Partial<SharedActivity> = {},
): SharedActivity => ({
  id: `${userId}-${occurredOn}-${Math.random()}`,
  userId,
  localId: 'l',
  kind: 'run',
  title: 'Run',
  occurredOn,
  distanceM: 10000,
  movingSeconds: 3000,
  elevationGainM: 100,
  route: null,
  visibility: 'public',
  ...over,
});

const WINDOW = { from: '2026-09-01', to: '2026-09-30' };

describe('roleOf and isMember', () => {
  const members = [member('a', 'owner'), member('b', 'admin'), member('c')];

  it('finds a role', () => {
    expect(roleOf(CLUB, 'a', members)).toBe('owner');
    expect(roleOf(CLUB, 'c', members)).toBe('member');
  });

  it('is null for a non-member', () => {
    expect(roleOf(CLUB, 'z', members)).toBeNull();
    expect(isMember(CLUB, 'z', members)).toBe(false);
  });

  it('is null when signed out', () => {
    expect(roleOf(CLUB, null, members)).toBeNull();
  });

  it('does not match a membership of a different club', () => {
    expect(roleOf('other-club', 'a', members)).toBeNull();
  });
});

describe('canRemove', () => {
  it('never lets anyone remove the owner', () => {
    expect(canRemove('owner', 'owner', false)).toBe(false);
    expect(canRemove('admin', 'owner', false)).toBe(false);
    // Not even the owner themselves — leaving is a "delete the club"
    // decision, and a club with no owner cannot be deleted by anyone.
    expect(canRemove('owner', 'owner', true)).toBe(false);
  });

  it('lets anybody else leave on their own', () => {
    expect(canRemove('member', 'member', true)).toBe(true);
    expect(canRemove('admin', 'admin', true)).toBe(true);
  });

  it('lets an owner remove admins and members', () => {
    expect(canRemove('owner', 'admin', false)).toBe(true);
    expect(canRemove('owner', 'member', false)).toBe(true);
  });

  it('lets an admin remove members but not other admins', () => {
    expect(canRemove('admin', 'member', false)).toBe(true);
    expect(canRemove('admin', 'admin', false)).toBe(false);
  });

  it('lets a plain member remove nobody but themselves', () => {
    expect(canRemove('member', 'member', false)).toBe(false);
  });

  it('lets a non-member remove nobody', () => {
    expect(canRemove(null, 'member', false)).toBe(false);
  });
});

describe('sortRoster', () => {
  it('puts the owner first, then admins, then members alphabetically', () => {
    const athletes = new Map([
      ['a', athlete('a', 'Zoe')],
      ['b', athlete('b', 'Bob')],
      ['c', athlete('c', 'Ann')],
      ['d', athlete('d', 'Cat')],
    ]);
    const sorted = sortRoster([member('c'), member('d'), member('b', 'admin'), member('a', 'owner')], athletes);
    expect(sorted.map((r) => r.member.userId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('survives a member with no athlete record', () => {
    const sorted = sortRoster([member('ghost')], new Map());
    expect(sorted[0]!.athlete).toBeNull();
  });
});

describe('leaderboard', () => {
  const athletes = new Map([
    ['a', athlete('a', 'Ann')],
    ['b', athlete('b', 'Bob')],
    ['c', athlete('c', 'Cat')],
  ]);
  const members = [member('a'), member('b'), member('c')];

  const run = (metric: LeaderboardMetric, activities: SharedActivity[], me: string | null = null) =>
    leaderboard(members, activities, athletes, metric, WINDOW, me);

  it('totals distance and ranks highest first', () => {
    const rows = run('distance', [act('a', '2026-09-02'), act('a', '2026-09-03'), act('b', '2026-09-04')]);
    expect(rows[0]!.userId).toBe('a');
    expect(rows[0]!.value).toBe(20000);
    expect(rows[0]!.activities).toBe(2);
    expect(rows[1]!.userId).toBe('b');
  });

  it('includes members with nothing, on zero', () => {
    // Dropping them makes "did not run" indistinguishable from "not a member".
    const rows = run('distance', [act('a', '2026-09-02')]);
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.userId === 'c')!.value).toBe(0);
  });

  it('ignores activities outside the window', () => {
    const rows = run('distance', [act('a', '2026-08-31'), act('a', '2026-10-01'), act('a', '2026-09-15')]);
    expect(rows.find((r) => r.userId === 'a')!.value).toBe(10000);
  });

  it('includes both ends of the window', () => {
    const rows = run('distance', [act('a', '2026-09-01'), act('a', '2026-09-30')]);
    expect(rows.find((r) => r.userId === 'a')!.value).toBe(20000);
  });

  it('ignores activities from people who are not members', () => {
    // A caller that over-fetches must not leak a stranger into a club.
    const rows = run('distance', [act('stranger', '2026-09-02')]);
    expect(rows.map((r) => r.userId)).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    expect(rows.find((r) => r.userId === 'stranger')).toBeUndefined();
  });

  it('gives tied athletes the same rank and skips the next', () => {
    const rows = run('distance', [act('a', '2026-09-02'), act('b', '2026-09-02')]);
    // a and b both on 10000 with one activity each; c on zero.
    expect(rows[0]!.rank).toBe(1);
    expect(rows[1]!.rank).toBe(1);
    expect(rows[2]!.rank).toBe(3);
  });

  it('breaks a tied total by activity count', () => {
    const rows = run('distance', [
      act('a', '2026-09-02', { distanceM: 20000 }),
      act('b', '2026-09-02', { distanceM: 10000 }),
      act('b', '2026-09-03', { distanceM: 10000 }),
    ]);
    // Both on 20000, but b took two runs to get there and ranks above a.
    expect(rows[0]!.userId).toBe('b');
    expect(rows[0]!.rank).toBe(1);
    expect(rows[1]!.rank).toBe(2);
  });

  it('counts activities as a metric', () => {
    const rows = run('activities', [act('a', '2026-09-02'), act('a', '2026-09-03'), act('b', '2026-09-02')]);
    expect(rows[0]!.value).toBe(2);
  });

  it('totals elevation and time', () => {
    const one = [act('a', '2026-09-02', { elevationGainM: 250, movingSeconds: 1800 })];
    expect(run('elevation', one).find((r) => r.userId === 'a')!.value).toBe(250);
    expect(run('time', one).find((r) => r.userId === 'a')!.value).toBe(1800);
  });

  it('treats a null metric value as zero rather than NaN', () => {
    const rows = run('elevation', [act('a', '2026-09-02', { elevationGainM: null })]);
    expect(rows.find((r) => r.userId === 'a')!.value).toBe(0);
  });

  it('marks the viewer', () => {
    const rows = run('distance', [act('a', '2026-09-02')], 'b');
    expect(rows.find((r) => r.userId === 'b')!.you).toBe(true);
    expect(rows.find((r) => r.userId === 'a')!.you).toBe(false);
  });

  it('is stable for members who are completely tied on zero', () => {
    const first = run('distance', []);
    const second = run('distance', []);
    expect(first.map((r) => r.userId)).toEqual(second.map((r) => r.userId));
  });
});

describe('slugFrom', () => {
  it('slugs an ordinary name', () => {
    expect(slugFrom('Leeds Road Runners')).toBe('leeds-road-runners');
  });

  it('collapses punctuation runs', () => {
    expect(slugFrom('Sunday  ---  Long Run!!')).toBe('sunday-long-run');
  });

  it('trims hyphens from both ends', () => {
    expect(slugFrom('  -Hills-  ')).toBe('hills');
  });

  it('is null when nothing usable survives', () => {
    expect(slugFrom('!!!')).toBeNull();
    expect(slugFrom('ab')).toBeNull();
  });

  it('truncates without leaving a trailing hyphen', () => {
    const slug = slugFrom('a'.repeat(38) + ' bbbbb')!;
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
  });
});

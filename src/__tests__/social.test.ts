import {
  buildFeed,
  canViewActivity,
  canViewAthlete,
  followState,
  handleProblem,
  initialFollowStatus,
  isAcceptedFollower,
  kudosSummary,
  normaliseHandle,
  shareableFrom,
  type Athlete,
  type Follow,
  type SharedActivity,
  type ShareableSource,
  type Visibility,
} from '../domain/social';
import type { PrivacyZone } from '../domain/privacy';

const ME = 'me-0000';
const THEM = 'them-000';
const OTHER = 'other-00';

const athlete = (id: string, visibility: Visibility, over: Partial<Athlete> = {}): Athlete => ({
  id,
  handle: id,
  displayName: null,
  visibility,
  ...over,
});

const accepted = (follower: string, followee: string): Follow => ({
  followerId: follower,
  followeeId: followee,
  status: 'accepted',
});
const pending = (follower: string, followee: string): Follow => ({
  followerId: follower,
  followeeId: followee,
  status: 'pending',
});

describe('canViewAthlete', () => {
  it('always lets you see yourself, whatever your visibility', () => {
    expect(canViewAthlete(ME, athlete(ME, 'private'), [])).toBe(true);
  });

  it('shows a public athlete to any signed-in user', () => {
    expect(canViewAthlete(ME, athlete(THEM, 'public'), [])).toBe(true);
  });

  it('hides a followers-only athlete from a stranger', () => {
    expect(canViewAthlete(ME, athlete(THEM, 'followers'), [])).toBe(false);
  });

  it('shows a followers-only athlete to an accepted follower', () => {
    expect(canViewAthlete(ME, athlete(THEM, 'followers'), [accepted(ME, THEM)])).toBe(true);
  });

  it('does not count a pending request as a follow', () => {
    expect(canViewAthlete(ME, athlete(THEM, 'followers'), [pending(ME, THEM)])).toBe(false);
  });

  it('does not treat being followed as following', () => {
    // They follow me; that says nothing about whether I may see them.
    expect(canViewAthlete(ME, athlete(THEM, 'followers'), [accepted(THEM, ME)])).toBe(false);
  });

  it('hides a private athlete even from someone who already follows them', () => {
    // Going private has to apply to the followers you already have, or the
    // switch does nothing for the person most likely to reach for it.
    expect(canViewAthlete(ME, athlete(THEM, 'private'), [accepted(ME, THEM)])).toBe(false);
  });

  it('shows nothing to a signed-out viewer', () => {
    expect(canViewAthlete(null, athlete(THEM, 'public'), [])).toBe(false);
  });
});

describe('isAcceptedFollower', () => {
  it('is direction-sensitive', () => {
    const follows = [accepted(ME, THEM)];
    expect(isAcceptedFollower(ME, THEM, follows)).toBe(true);
    expect(isAcceptedFollower(THEM, ME, follows)).toBe(false);
  });
});

describe('canViewActivity', () => {
  const share = (visibility: Visibility, userId = THEM): SharedActivity => ({
    id: 'act-1',
    userId,
    localId: 'l1',
    kind: 'run',
    title: 'Morning run',
    occurredOn: '2026-09-01',
    distanceM: 5000,
    movingSeconds: 1500,
    elevationGainM: 20,
    route: null,
    visibility,
  });

  it('always shows you your own, even when private', () => {
    expect(canViewActivity(ME, share('private', ME), athlete(ME, 'private'), [])).toBe(true);
  });

  it('shows a public activity from a public athlete', () => {
    expect(canViewActivity(ME, share('public'), athlete(THEM, 'public'), [])).toBe(true);
  });

  it('hides a private activity from a public athlete', () => {
    // Per-activity visibility is real, not decoration on the account setting.
    expect(canViewActivity(ME, share('private'), athlete(THEM, 'public'), [])).toBe(false);
  });

  it('hides a public activity once its athlete goes private', () => {
    // This is the case a naive implementation gets wrong: the activity still
    // says "public", and it must stop being visible anyway.
    expect(canViewActivity(ME, share('public'), athlete(THEM, 'private'), [accepted(ME, THEM)])).toBe(false);
  });

  it('shows a followers-only activity to an accepted follower', () => {
    expect(canViewActivity(ME, share('followers'), athlete(THEM, 'followers'), [accepted(ME, THEM)])).toBe(true);
  });

  it('hides a followers-only activity from a stranger of a public athlete', () => {
    // The athlete is findable, but this particular run is not for everyone.
    expect(canViewActivity(ME, share('followers'), athlete(THEM, 'public'), [])).toBe(false);
  });
});

describe('normaliseHandle', () => {
  it('lowercases and strips a leading at-sign', () => {
    expect(normaliseHandle('@Alice')).toBe('alice');
  });

  it('turns spaces, dots and dashes into underscores', () => {
    expect(normaliseHandle('Alice Smith')).toBe('alice_smith');
    expect(normaliseHandle('alice.smith')).toBe('alice_smith');
    expect(normaliseHandle('alice-smith')).toBe('alice_smith');
  });

  it('collapses runs of underscores', () => {
    expect(normaliseHandle('alice   smith')).toBe('alice_smith');
  });

  it('drops characters the column will not accept', () => {
    expect(normaliseHandle('ali¢e!!')).toBe('alie');
  });

  it('truncates to the column limit', () => {
    expect(normaliseHandle('a'.repeat(40))).toHaveLength(20);
  });
});

describe('handleProblem', () => {
  it('accepts an ordinary handle', () => {
    expect(handleProblem('alice_smith')).toBeNull();
  });

  it('rejects one that is too short', () => {
    expect(handleProblem('al')).toMatch(/3 characters/);
  });

  it('rejects one that normalises away entirely', () => {
    expect(handleProblem('!!!')).toMatch(/Pick a handle/);
  });

  it('rejects leading and trailing underscores', () => {
    expect(handleProblem('_alice')).toMatch(/underscore/);
    expect(handleProblem('alice_')).toMatch(/underscore/);
  });

  it('judges the normalised form, not the raw input', () => {
    expect(handleProblem('@Alice Smith')).toBeNull();
  });
});

describe('followState', () => {
  it('knows you', () => {
    expect(followState(ME, athlete(ME, 'public'), [])).toBe('self');
  });

  it('offers a follow to a public stranger', () => {
    expect(followState(ME, athlete(THEM, 'public'), [])).toBe('none');
  });

  it('reports a pending request rather than offering another', () => {
    expect(followState(ME, athlete(THEM, 'followers'), [pending(ME, THEM)])).toBe('requested');
  });

  it('reports following', () => {
    expect(followState(ME, athlete(THEM, 'public'), [accepted(ME, THEM)])).toBe('following');
  });

  it('distinguishes being followed from following', () => {
    expect(followState(ME, athlete(THEM, 'public'), [accepted(THEM, ME)])).toBe('follows_you');
  });

  it('reports mutual when both directions are accepted', () => {
    expect(followState(ME, athlete(THEM, 'public'), [accepted(ME, THEM), accepted(THEM, ME)])).toBe('mutual');
  });

  it('offers nothing for a private athlete', () => {
    // The insert policy refuses it, so a button here would only ever fail.
    expect(followState(ME, athlete(THEM, 'private'), [])).toBe('unavailable');
  });

  it('still reports an existing follow of someone who went private', () => {
    expect(followState(ME, athlete(THEM, 'private'), [accepted(ME, THEM)])).toBe('following');
  });

  it('is unavailable when signed out', () => {
    expect(followState(null, athlete(THEM, 'public'), [])).toBe('unavailable');
  });
});

describe('initialFollowStatus', () => {
  it('accepts a public follow immediately', () => {
    expect(initialFollowStatus(athlete(THEM, 'public'))).toBe('accepted');
  });

  it('makes a followers-only follow wait for approval', () => {
    expect(initialFollowStatus(athlete(THEM, 'followers'))).toBe('pending');
  });

  it('refuses a private athlete outright', () => {
    expect(initialFollowStatus(athlete(THEM, 'private'))).toBeNull();
  });
});

describe('shareableFrom', () => {
  const source: ShareableSource = {
    id: 'act_local_1',
    date: '2026-09-01',
    type: 'run',
    name: 'Morning run',
    // A short line heading east, away from 0,0.
    points: [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 0.01 },
      { lat: 0, lon: 0.02 },
      { lat: 0, lon: 0.03 },
      { lat: 0, lon: 0.04 },
    ],
    distanceM: 4448.2,
    movingS: 1500.6,
    ascentM: 21.4,
  };

  const home: PrivacyZone = { id: 'z1', label: 'Home', center: { lat: 0, lon: 0 }, radiusM: 800 };

  it('publishes the numbers, rounded', () => {
    const out = shareableFrom(source, [], 'followers');
    expect(out.kind).toBe('ok');
    if (out.kind !== 'ok') return;
    expect(out.share.distanceM).toBe(4448);
    expect(out.share.movingSeconds).toBe(1501);
    expect(out.share.elevationGainM).toBe(21);
    expect(out.share.localId).toBe('act_local_1');
    expect(out.share.visibility).toBe('followers');
  });

  it('cuts the route to the privacy zones', () => {
    const out = shareableFrom(source, [home], 'public');
    expect(out.kind).toBe('ok');
    if (out.kind !== 'ok') return;
    // The first point sits inside the 800m zone around 0,0 and must be gone.
    const flat = out.share.route!.flat();
    expect(flat).not.toContainEqual({ lat: 0, lon: 0 });
    expect(flat.length).toBeLessThan(source.points.length);
  });

  it('keeps trimmed segments as separate lines', () => {
    // A zone in the MIDDLE of the route. Joining the surviving runs back into
    // one line would draw straight through it, and the ends of that line are
    // the coordinates the zone exists to hide.
    const middle: PrivacyZone = { id: 'z2', label: 'Work', center: { lat: 0, lon: 0.02 }, radiusM: 800 };
    const out = shareableFrom(source, [middle], 'public');
    expect(out.kind).toBe('ok');
    if (out.kind !== 'ok') return;
    expect(out.share.route!.length).toBe(2);
  });

  it('refuses rather than silently dropping a map the athlete asked to include', () => {
    const everywhere: PrivacyZone = { id: 'z3', label: 'All', center: { lat: 0, lon: 0.02 }, radiusM: 100000 };
    const out = shareableFrom(source, [everywhere], 'public');
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') return;
    expect(out.reason).toMatch(/without the map/);
  });

  it('publishes without a route when asked', () => {
    const out = shareableFrom(source, [], 'public', { withRoute: false });
    expect(out.kind).toBe('ok');
    if (out.kind !== 'ok') return;
    expect(out.share.route).toBeNull();
  });

  it('never leaves a route on a no-map share even with zones set', () => {
    const out = shareableFrom(source, [home], 'public', { withRoute: false });
    if (out.kind !== 'ok') throw new Error('expected ok');
    expect(out.share.route).toBeNull();
  });

  it('refuses to "share" something privately, which would be a no-op', () => {
    expect(shareableFrom(source, [], 'private').kind).toBe('refused');
  });

  it('carries a trimmed note, or null for an empty one', () => {
    const withNote = shareableFrom(source, [], 'public', { note: '  felt good  ' });
    if (withNote.kind !== 'ok') throw new Error('expected ok');
    expect(withNote.share.note).toBe('felt good');

    const blank = shareableFrom(source, [], 'public', { note: '   ' });
    if (blank.kind !== 'ok') throw new Error('expected ok');
    expect(blank.share.note).toBeNull();
  });

  it('handles an activity with no points at all', () => {
    const out = shareableFrom({ ...source, points: [] }, [], 'public');
    if (out.kind !== 'ok') throw new Error('expected ok');
    expect(out.share.route).toBeNull();
  });
});

describe('kudosSummary', () => {
  const kudos = [
    { activityId: 'a1', userId: ME },
    { activityId: 'a1', userId: OTHER },
    { activityId: 'a2', userId: OTHER },
  ];

  it('counts only that activity', () => {
    expect(kudosSummary('a1', kudos, null).count).toBe(2);
    expect(kudosSummary('a2', kudos, null).count).toBe(1);
  });

  it('knows whether the viewer is one of them', () => {
    expect(kudosSummary('a1', kudos, ME).mine).toBe(true);
    expect(kudosSummary('a2', kudos, ME).mine).toBe(false);
  });

  it('is never "mine" when signed out', () => {
    expect(kudosSummary('a1', kudos, null).mine).toBe(false);
  });
});

describe('buildFeed', () => {
  const act = (id: string, userId: string, occurredOn: string, visibility: Visibility = 'public'): SharedActivity => ({
    id,
    userId,
    localId: id,
    kind: 'run',
    title: id,
    occurredOn,
    distanceM: 1000,
    movingSeconds: 300,
    elevationGainM: 0,
    route: null,
    visibility,
  });

  const athletes = [athlete(ME, 'public'), athlete(THEM, 'public'), athlete(OTHER, 'private')];

  it('orders newest first', () => {
    const feed = buildFeed(ME, [act('a', THEM, '2026-09-01'), act('b', THEM, '2026-09-03')], athletes, []);
    expect(feed.map((f) => f.activity.id)).toEqual(['b', 'a']);
  });

  it('breaks same-day ties stably rather than leaving order to chance', () => {
    const first = buildFeed(ME, [act('a', THEM, '2026-09-01'), act('b', THEM, '2026-09-01')], athletes, []);
    const second = buildFeed(ME, [act('b', THEM, '2026-09-01'), act('a', THEM, '2026-09-01')], athletes, []);
    expect(first.map((f) => f.activity.id)).toEqual(second.map((f) => f.activity.id));
  });

  it('drops rows the viewer may not see, even if the server sent them', () => {
    // A cached row from before somebody went private is a real thing to find
    // in memory.
    const feed = buildFeed(ME, [act('a', OTHER, '2026-09-01')], athletes, []);
    expect(feed).toEqual([]);
  });

  it('drops rows whose athlete is unknown rather than rendering a blank name', () => {
    const feed = buildFeed(ME, [act('a', 'ghost', '2026-09-01')], athletes, []);
    expect(feed).toEqual([]);
  });

  it('marks your own rows', () => {
    const feed = buildFeed(ME, [act('a', ME, '2026-09-01'), act('b', THEM, '2026-09-02')], athletes, []);
    expect(feed.find((f) => f.activity.id === 'a')!.own).toBe(true);
    expect(feed.find((f) => f.activity.id === 'b')!.own).toBe(false);
  });

  it('attaches kudos and comment counts', () => {
    const feed = buildFeed(
      ME,
      [act('a', THEM, '2026-09-01')],
      athletes,
      [{ activityId: 'a', userId: ME }],
      { a: 3 },
    );
    expect(feed[0]!.kudos).toEqual({ count: 1, mine: true });
    expect(feed[0]!.comments).toBe(3);
  });

  it('defaults a missing comment count to zero', () => {
    const feed = buildFeed(ME, [act('a', THEM, '2026-09-01')], athletes, []);
    expect(feed[0]!.comments).toBe(0);
  });
});

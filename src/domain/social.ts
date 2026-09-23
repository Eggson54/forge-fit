import type { ISODate, UUID } from './types';
import { trimToZones, type PrivacyZone } from './privacy';
import type { LatLon } from './geo';

/**
 * The social layer, as rules rather than screens.
 *
 * Everything in this app before now was one person's own data. Adding other
 * people to it is the change that can hurt somebody: a route published from a
 * front door is a home address, and a visibility control that the client
 * honours but the server does not is not a control at all.
 *
 * So three things live here, under test, rather than in a component:
 *
 *  - **What may be seen.** `canViewAthlete` and `canViewActivity` mirror the
 *    row-level policies in `0003_social.sql` exactly. They are not the
 *    enforcement — the database is — but a UI that offers an action the
 *    server will refuse is a UI that teaches people the app is broken, and a
 *    UI that *hides* something the server would serve is a false promise.
 *  - **What gets published.** `shareableFrom` is the only way an activity
 *    becomes a shared row, and it applies privacy zones on the way. A route
 *    that cannot be trimmed safely comes back refused rather than trimmed
 *    badly.
 *  - **Who follows whom.** Follow state has more cases than it looks like it
 *    does, and getting one wrong shows "Follow" to somebody who already does.
 */

// ---------------------------------------------------------- visibility -----

export type Visibility = 'private' | 'followers' | 'public';

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  private: 'Only me',
  followers: 'Followers',
  public: 'Everyone',
};

export const VISIBILITY_NOTE: Record<Visibility, string> = {
  private: 'Nobody else can see this, and nobody can find or follow you.',
  followers: 'Visible to people whose follow request you have accepted. Requests need your approval.',
  public: 'Visible to anyone signed in to ForgeFit. Anyone can follow you without asking.',
};

/** Ordered least to most exposed, for a picker that should read that way. */
export const VISIBILITIES: Visibility[] = ['private', 'followers', 'public'];

export interface Athlete {
  id: UUID;
  handle: string | null;
  displayName: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  locationText?: string | null;
  visibility: Visibility;
}

export type FollowStatus = 'pending' | 'accepted';

export interface Follow {
  followerId: UUID;
  followeeId: UUID;
  status: FollowStatus;
}

/** Whether `viewer` has an accepted follow of `target`. */
export function isAcceptedFollower(viewer: UUID, target: UUID, follows: Follow[]): boolean {
  return follows.some(
    (f) => f.followerId === viewer && f.followeeId === target && f.status === 'accepted',
  );
}

/**
 * Whether `viewer` may see anything at all about `athlete`.
 *
 * Mirrors `can_view_athlete`. Note the private case: it excludes people who
 * followed them *before* they went private. Somebody flipping that switch is
 * asking for it to apply to the followers they already have — anything else
 * makes the control useless to the person most likely to reach for it.
 */
export function canViewAthlete(viewer: UUID | null, athlete: Athlete, follows: Follow[]): boolean {
  if (!viewer) return false;
  if (viewer === athlete.id) return true;
  if (athlete.visibility === 'public') return true;
  if (athlete.visibility === 'followers') return isAcceptedFollower(viewer, athlete.id, follows);
  return false;
}

export interface SharedActivity {
  id: UUID;
  userId: UUID;
  localId: string;
  kind: string;
  title: string;
  note?: string | null;
  occurredOn: ISODate;
  distanceM: number | null;
  movingSeconds: number | null;
  elevationGainM: number | null;
  /** Already trimmed to the owner's privacy zones. Null when no map was shared. */
  route: LatLon[][] | null;
  visibility: Visibility;
}

/**
 * Whether `viewer` may see one shared activity.
 *
 * The athlete gate is applied first, so a public activity belonging to an
 * athlete who has since gone private stops being visible. Applying only the
 * activity's own visibility would leave a trail of individually-public runs
 * readable after somebody locked their account, which is precisely the moment
 * they wanted them hidden.
 */
export function canViewActivity(
  viewer: UUID | null,
  activity: SharedActivity,
  owner: Athlete,
  follows: Follow[],
): boolean {
  if (!viewer) return false;
  if (viewer === activity.userId) return true;
  if (!canViewAthlete(viewer, owner, follows)) return false;
  if (activity.visibility === 'public') return true;
  if (activity.visibility === 'followers') return isAcceptedFollower(viewer, activity.userId, follows);
  return false;
}

// ------------------------------------------------------------ handles ------

/**
 * Tighten a typed handle into the form the database will accept.
 *
 * Matches `athletes_handle_shape` deliberately: lowercase, letters, digits
 * and underscores, 3 to 20 characters. Normalising here rather than only
 * validating means "@Alice Smith" becomes "alice_smith" instead of being
 * rejected with a rule the person then has to guess at.
 */
export function normaliseHandle(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[\s.-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_{2,}/g, '_')
    .slice(0, 20);
}

/** Why a handle is not usable, or null when it is. */
export function handleProblem(raw: string): string | null {
  const handle = normaliseHandle(raw);
  if (handle.length === 0) return 'Pick a handle — letters, numbers and underscores.';
  if (handle.length < 3) return 'Handles are at least 3 characters.';
  // Trailing underscores survive normalisation and read like a typo.
  if (/^_|_$/.test(handle)) return 'Handles cannot start or end with an underscore.';
  return null;
}

// -------------------------------------------------------- follow state -----

export type FollowState =
  | 'self'
  | 'none'
  | 'requested'
  | 'following'
  | 'follows_you'
  | 'mutual'
  | 'unavailable';

/**
 * Where the relationship between two people stands.
 *
 * Six real states and one for "you cannot interact with this person at all".
 * Collapsing any of them is what produces a Follow button shown to somebody
 * who already follows, or a pending request that looks like it failed.
 */
export function followState(me: UUID | null, them: Athlete, follows: Follow[]): FollowState {
  if (!me) return 'unavailable';
  if (me === them.id) return 'self';

  const outbound = follows.find((f) => f.followerId === me && f.followeeId === them.id);
  const inbound = follows.find((f) => f.followerId === them.id && f.followeeId === me);

  const iFollow = outbound?.status === 'accepted';
  const theyFollow = inbound?.status === 'accepted';

  if (iFollow && theyFollow) return 'mutual';
  if (iFollow) return 'following';
  if (outbound?.status === 'pending') return 'requested';
  if (theyFollow) return 'follows_you';
  // A private athlete cannot be followed at all — the insert policy refuses
  // it — so the button must not be offered.
  if (them.visibility === 'private') return 'unavailable';
  return 'none';
}

export const FOLLOW_ACTION_LABEL: Record<FollowState, string | null> = {
  self: null,
  none: 'Follow',
  requested: 'Requested',
  following: 'Following',
  follows_you: 'Follow back',
  mutual: 'Following',
  unavailable: null,
};

/**
 * The status a new follow row should carry.
 *
 * A public athlete accepts automatically; a 'followers' athlete approves each
 * one. This has to agree with the server, which sets nothing automatically —
 * the client writes the status and the insert policy allows it either way.
 */
export function initialFollowStatus(target: Athlete): FollowStatus | null {
  if (target.visibility === 'public') return 'accepted';
  if (target.visibility === 'followers') return 'pending';
  return null;
}

// ---------------------------------------------------------- publishing -----

export interface ShareableSource {
  id: string;
  date: ISODate;
  type: string;
  name: string;
  points: LatLon[];
  distanceM: number;
  movingS: number;
  ascentM: number;
}

export type ShareOutcome =
  | { kind: 'ok'; share: Omit<SharedActivity, 'id' | 'userId'> }
  | { kind: 'refused'; reason: string };

/**
 * Turn one recorded activity into the row that gets published.
 *
 * This is the only place a route leaves the device, and the trimming is not
 * optional. `trimToZones` returns the surviving runs as *separate lines*
 * rather than one filtered list, which matters: joining them back together
 * would draw a straight line through the hidden middle, and the two endpoints
 * of that line are exactly the coordinates the zone existed to hide.
 *
 * `withRoute: false` publishes the numbers and no map at all, which is the
 * honest option for somebody who wants to share a run from an address they do
 * not want plotted and has not set up a zone.
 */
export function shareableFrom(
  activity: ShareableSource,
  zones: PrivacyZone[],
  visibility: Visibility,
  options: { withRoute?: boolean; note?: string } = {},
): ShareOutcome {
  if (visibility === 'private') {
    return { kind: 'refused', reason: 'Sharing something as "only me" does nothing — it is already only you.' };
  }

  const withRoute = options.withRoute ?? true;

  let route: LatLon[][] | null = null;
  if (withRoute && activity.points.length > 0) {
    const lines = trimToZones(activity.points, zones).map((line) =>
      line.map((p) => ({ lat: p.lat, lon: p.lon })),
    );

    // Every point sat inside a zone. That is a route entirely within somewhere
    // the athlete has marked private, and publishing "no map" alongside a
    // distance and a date would still be publishing that they ran today —
    // which is fine — but silently dropping a map they asked to include is
    // not. Say so and let them choose.
    if (lines.length === 0) {
      return {
        kind: 'refused',
        reason: 'Your privacy zones cover this whole route, so there is no map left to share. Share it without the map instead.',
      };
    }
    route = lines;
  }

  return {
    kind: 'ok',
    share: {
      localId: activity.id,
      kind: activity.type,
      title: activity.name,
      note: options.note?.trim() || null,
      occurredOn: activity.date,
      distanceM: Math.round(activity.distanceM),
      movingSeconds: Math.round(activity.movingS),
      elevationGainM: Math.round(activity.ascentM),
      route,
      visibility,
    },
  };
}

// ---------------------------------------------------------------- feed -----

export interface Kudos {
  activityId: UUID;
  userId: UUID;
}

export interface KudosSummary {
  count: number;
  /** Whether the viewer is one of them, so the button reads correctly. */
  mine: boolean;
}

export function kudosSummary(activityId: UUID, kudos: Kudos[], me: UUID | null): KudosSummary {
  const forThis = kudos.filter((k) => k.activityId === activityId);
  return {
    count: forThis.length,
    mine: me != null && forThis.some((k) => k.userId === me),
  };
}

export interface FeedItem {
  activity: SharedActivity;
  athlete: Athlete;
  kudos: KudosSummary;
  comments: number;
  /** True for the viewer's own activity, which is drawn differently. */
  own: boolean;
}

/**
 * The feed, newest first.
 *
 * Filtered through `canViewActivity` rather than trusting that the query only
 * returned readable rows. The server is the enforcement and it is doing its
 * job, but a cached row from before somebody went private is a real thing
 * that can be sitting in memory, and this is cheap.
 *
 * Ties are broken by activity id so the order is stable between renders —
 * two runs on the same day otherwise swap places on every refresh.
 */
export function buildFeed(
  me: UUID | null,
  activities: SharedActivity[],
  athletes: Athlete[],
  kudos: Kudos[],
  commentCounts: Record<UUID, number> = {},
  follows: Follow[] = [],
): FeedItem[] {
  const byId = new Map(athletes.map((a) => [a.id, a]));

  return activities
    .map((activity) => {
      const athlete = byId.get(activity.userId);
      if (!athlete) return null;
      if (!canViewActivity(me, activity, athlete, follows)) return null;
      return {
        activity,
        athlete,
        kudos: kudosSummary(activity.id, kudos, me),
        comments: commentCounts[activity.id] ?? 0,
        own: activity.userId === me,
      };
    })
    .filter((item): item is FeedItem => item !== null)
    .sort((a, b) => {
      if (a.activity.occurredOn !== b.activity.occurredOn) {
        return a.activity.occurredOn < b.activity.occurredOn ? 1 : -1;
      }
      return a.activity.id < b.activity.id ? 1 : -1;
    });
}

/** How somebody is named on screen, with a sensible fallback chain. */
export function displayNameFor(athlete: Athlete): string {
  const name = athlete.displayName?.trim();
  if (name) return name;
  if (athlete.handle) return `@${athlete.handle}`;
  return 'Someone';
}

export const SOCIAL_PRIVACY_NOTE =
  'Sharing is per activity and off by default. Your weight, nutrition, sleep, cycle, bloodwork and protocol data are never shared, and there is nowhere in the shared database to put them. Routes are cut to your privacy zones before they leave the device.';

export const SOCIAL_ROUTE_WARNING =
  'A route that starts at your front door is your address. Set a privacy zone over anywhere you leave from regularly before you share a map.';

import { distanceMeters, type LatLon } from './geo';

/**
 * "Iron Map" — an original gym-collection layer. Gyms you physically visit get
 * claimed; claiming earns points toward explorer tiers.
 *
 * Two rules shape the whole design:
 *
 * 1. A claim requires actually being at the gym. A collection game you can play
 *    from the sofa is a list, and a list nobody earned is worth nothing.
 * 2. Nothing here rewards travelling further or faster. Points come from the
 *    variety of places you train, never from distance covered or speed between
 *    them, because a game that pays for mileage is a game that puts people on
 *    the road to chase it.
 */

export type GymKind =
  | 'commercial'
  | 'independent'
  | 'strength'
  | 'crossfit'
  | 'university'
  | 'hotel'
  | 'community'
  | 'outdoor'
  | 'climbing'
  | 'martial_arts';

export type GymRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export interface Gym {
  id: string;
  name: string;
  kind: GymKind;
  lat: number;
  lon: number;
  /** Street line, shown on the detail sheet. Optional: many POIs lack one. */
  address?: string;
  /** Free-text facilities from the data source, e.g. "platforms", "sauna". */
  amenities?: string[];
  /** True when the source says it is open to the public without membership. */
  dropIn?: boolean;
}

export interface Claim {
  gymId: string;
  /** ISO timestamp of the first claim. */
  claimedAt: string;
  /** Every visit including the first, newest first. */
  visits: string[];
  pointsEarned: number;
  /**
   * A copy of the venue as it was when claimed. Kept with the claim so a gym
   * that closes, gets renamed, or simply falls outside a later search radius
   * does not quietly vanish from someone's collection.
   */
  gym?: Gym;
}

export const KIND_LABEL: Record<GymKind, string> = {
  commercial: 'Commercial gym',
  independent: 'Independent gym',
  strength: 'Strength / powerlifting',
  crossfit: 'CrossFit box',
  university: 'University gym',
  hotel: 'Hotel gym',
  community: 'Community centre',
  outdoor: 'Outdoor / calisthenics',
  climbing: 'Climbing gym',
  martial_arts: 'Martial arts gym',
};

/**
 * Rarity is about how *uncommon the kind of place* is, not how far away it is.
 * A chain gym on every high street is common however far you drove to it; a
 * council outdoor rig is rare because most towns have one at most.
 */
export const KIND_RARITY: Record<GymKind, GymRarity> = {
  commercial: 'common',
  independent: 'uncommon',
  community: 'uncommon',
  crossfit: 'uncommon',
  martial_arts: 'uncommon',
  university: 'rare',
  climbing: 'rare',
  outdoor: 'rare',
  hotel: 'rare',
  strength: 'legendary',
};

export const RARITY_POINTS: Record<GymRarity, number> = {
  common: 10,
  uncommon: 25,
  rare: 50,
  legendary: 100,
};

export const RARITY_LABEL: Record<GymRarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  legendary: 'Legendary',
};

export function rarityOf(gym: Pick<Gym, 'kind'>): GymRarity {
  return KIND_RARITY[gym.kind] ?? 'common';
}

/** Points a first claim on this gym is worth. */
export function claimPoints(gym: Pick<Gym, 'kind'>): number {
  return RARITY_POINTS[rarityOf(gym)];
}

/** Points a return visit is worth — a nod, not a grind. */
export const RETURN_VISIT_POINTS = 2;

/** How close you have to be to claim, in metres. */
export const CLAIM_RADIUS_M = 150;

/** How long before the same gym pays a return visit again. */
export const REVISIT_COOLDOWN_HOURS = 6;

export type CheckInBlock =
  | { ok: true; points: number; first: boolean }
  | { ok: false; reason: 'no_location' | 'too_far'; distanceMeters: number | null }
  | { ok: false; reason: 'cooldown'; hoursRemaining: number; distanceMeters: number | null };

/**
 * Whether this gym can be claimed right now, and for how much.
 *
 * `here` being null is a distinct answer from being too far: one means the app
 * does not know where you are, the other means it does and you are not there.
 * Collapsing them produces the worst error message in mobile software.
 */
export function evaluateCheckIn(
  gym: Gym,
  here: LatLon | null,
  existing: Claim | undefined,
  now: Date,
): CheckInBlock {
  const distance = here ? distanceMeters(here, { lat: gym.lat, lon: gym.lon }) : null;

  if (!here) return { ok: false, reason: 'no_location', distanceMeters: null };
  if (distance !== null && distance > CLAIM_RADIUS_M) {
    return { ok: false, reason: 'too_far', distanceMeters: distance };
  }

  if (!existing) return { ok: true, points: claimPoints(gym), first: true };

  const last = existing.visits[0] ? new Date(existing.visits[0]).getTime() : 0;
  const hoursSince = (now.getTime() - last) / 3_600_000;
  if (hoursSince < REVISIT_COOLDOWN_HOURS) {
    return {
      ok: false,
      reason: 'cooldown',
      hoursRemaining: Math.max(0, Math.ceil(REVISIT_COOLDOWN_HOURS - hoursSince)),
      distanceMeters: distance,
    };
  }
  return { ok: true, points: RETURN_VISIT_POINTS, first: false };
}

export interface ExplorerTier {
  key: string;
  name: string;
  min: number;
  color: string;
  blurb: string;
}

export const EXPLORER_TIERS: ExplorerTier[] = [
  // Blurbs describe the tier, not a gym count: a single legendary claim
  // reaches Regular, and telling that person they "train in more than one
  // place" is the app inventing a fact about them.
  { key: 'local', name: 'Local', min: 0, color: '#A9ADBF', blurb: 'Where it starts.' },
  { key: 'regular', name: 'Regular', min: 60, color: '#7FB2FF', blurb: 'The map has something on it.' },
  { key: 'scout', name: 'Scout', min: 200, color: '#39E6C3', blurb: 'Enough ground covered to have favourites.' },
  { key: 'pathfinder', name: 'Pathfinder', min: 500, color: '#C6F135', blurb: 'Few racks left unfound.' },
  { key: 'cartographer', name: 'Cartographer', min: 1000, color: '#FFB020', blurb: 'You have mapped the iron.' },
];

export interface CollectionSummary {
  claimed: number;
  points: number;
  visits: number;
  byRarity: Record<GymRarity, number>;
  byKind: Partial<Record<GymKind, number>>;
  tier: ExplorerTier;
  nextTier: ExplorerTier | null;
  /** 0–1 toward the next tier; 1 at the top tier. */
  progress: number;
  /** Kinds never yet claimed, rarest first — what to go looking for. */
  missingKinds: GymKind[];
}

const RARITY_ORDER: GymRarity[] = ['legendary', 'rare', 'uncommon', 'common'];

export function summariseCollection(claims: Claim[], gymsById: Record<string, Gym>): CollectionSummary {
  const byRarity: Record<GymRarity, number> = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
  const byKind: Partial<Record<GymKind, number>> = {};
  let points = 0;
  let visits = 0;

  for (const claim of claims) {
    points += claim.pointsEarned;
    visits += claim.visits.length;
    const gym = gymsById[claim.gymId];
    if (!gym) continue;
    byRarity[rarityOf(gym)] += 1;
    byKind[gym.kind] = (byKind[gym.kind] ?? 0) + 1;
  }

  let tier = EXPLORER_TIERS[0];
  for (const t of EXPLORER_TIERS) if (points >= t.min) tier = t;
  const idx = EXPLORER_TIERS.indexOf(tier);
  const nextTier = EXPLORER_TIERS[idx + 1] ?? null;
  const progress = nextTier
    ? Math.max(0, Math.min(1, (points - tier.min) / (nextTier.min - tier.min)))
    : 1;

  const missingKinds = (Object.keys(KIND_LABEL) as GymKind[])
    .filter((k) => !byKind[k])
    .sort((a, b) => RARITY_ORDER.indexOf(KIND_RARITY[a]) - RARITY_ORDER.indexOf(KIND_RARITY[b]));

  return { claimed: claims.length, points, visits, byRarity, byKind, tier, nextTier, progress, missingKinds };
}

export interface GymWithDistance extends Gym {
  distanceMeters: number;
  claimed: boolean;
}

/**
 * Gyms sorted by how far away they are. Unclaimed ones are NOT promoted: the
 * list answers "what is near me", and reordering it by what the game wants you
 * to do would quietly make it lie.
 */
export function nearbyGyms(
  gyms: Gym[],
  here: LatLon | null,
  claimedIds: Set<string>,
  limit = 25,
): GymWithDistance[] {
  const out = gyms.map((g) => ({
    ...g,
    distanceMeters: here ? distanceMeters(here, { lat: g.lat, lon: g.lon }) : Number.POSITIVE_INFINITY,
    claimed: claimedIds.has(g.id),
  }));
  out.sort((a, b) => a.distanceMeters - b.distanceMeters || a.name.localeCompare(b.name));
  return out.slice(0, limit);
}

/** The closest gym that is within claiming range, if any. */
export function claimableNow(gyms: Gym[], here: LatLon | null): Gym | null {
  if (!here) return null;
  let best: { gym: Gym; d: number } | null = null;
  for (const g of gyms) {
    const d = distanceMeters(here, { lat: g.lat, lon: g.lon });
    if (d <= CLAIM_RADIUS_M && (!best || d < best.d)) best = { gym: g, d };
  }
  return best?.gym ?? null;
}

import type { GymKind } from '../../domain/gyms';
import { distanceMeters, offsetBy, type LatLon } from '../../domain/geo';
import type { GymProvider, GymSearchResult } from './types';

/**
 * Sample gyms laid out around whatever point you give it, for development and
 * for the demo build. Deterministic, so screenshots and tests do not drift.
 *
 * The names are invented. Dropping real chains into sample data would put words
 * in a real business's mouth about its hours, facilities and whether it exists
 * on that corner.
 *
 * It returns no basemap geometry: this provider does not know where the streets
 * are, and drawing plausible-looking ones would be a map that lies.
 */
interface Seed {
  name: string;
  kind: GymKind;
  meters: number;
  bearing: number;
  address?: string;
  amenities?: string[];
  dropIn?: boolean;
}

const SEEDS: Seed[] = [
  { name: 'Ironworks Strength Hall', kind: 'strength', meters: 380, bearing: 34, address: 'Unit 4, Forge Lane', amenities: ['competition platforms', 'calibrated plates', 'chalk allowed'] },
  { name: 'Northgate Fitness', kind: 'commercial', meters: 210, bearing: 300, address: '11 Northgate Street', amenities: ['24 hour', 'sauna', 'pool'], dropIn: true },
  { name: 'The Basement Barbell Club', kind: 'independent', meters: 640, bearing: 152, address: '3a Waterside Row', amenities: ['platforms', 'specialty bars'] },
  { name: 'Quarry CrossFit', kind: 'crossfit', meters: 900, bearing: 88, address: 'The Old Quarry Yard', amenities: ['rig', 'sled track'], dropIn: true },
  { name: 'Riverside Community Centre', kind: 'community', meters: 520, bearing: 244, address: 'Riverside Walk', amenities: ['cheap entry', 'sports hall'], dropIn: true },
  { name: 'Eastfield University Sports Hub', kind: 'university', meters: 1450, bearing: 71, address: 'Eastfield Campus', amenities: ['50m pool', 'sprint track'] },
  { name: 'Hollow Hill Calisthenics Park', kind: 'outdoor', meters: 760, bearing: 198, address: 'Hollow Hill Green', amenities: ['pull-up rig', 'parallel bars', 'free'], dropIn: true },
  { name: 'Grit & Chalk Climbing', kind: 'climbing', meters: 1180, bearing: 316, address: '7 Tannery Street', amenities: ['bouldering', 'lead wall', 'training board'], dropIn: true },
  { name: 'The Anvil Boxing Gym', kind: 'martial_arts', meters: 690, bearing: 12, address: '22 Anvil Court', amenities: ['ring', 'heavy bags'] },
  { name: 'Meridian Hotel Fitness Room', kind: 'hotel', meters: 1020, bearing: 128, address: 'Meridian Hotel, Station Square', amenities: ['guests only', 'treadmills'] },
  { name: 'Southpark Leisure', kind: 'commercial', meters: 1620, bearing: 186, address: 'Southpark Retail Park', amenities: ['classes', 'pool'], dropIn: true },
  { name: 'Foundry Lifting Co.', kind: 'independent', meters: 1340, bearing: 260, address: 'Arch 9, Foundry Viaduct', amenities: ['strongman yard', 'log & yoke'] },
  { name: 'Kestrel Street Gym', kind: 'commercial', meters: 430, bearing: 96, address: '48 Kestrel Street', amenities: ['24 hour'], dropIn: true },
  { name: 'Old Mill Weightlifting', kind: 'strength', meters: 2100, bearing: 22, address: 'Old Mill Works', amenities: ['Olympic platforms', 'coaching'] },
];

/**
 * Snap the origin to a coarse grid — about 1.1 km — before placing anything.
 *
 * Generating gyms around the *live* position moves every one of them as the
 * user walks, so the distance to each never changes and no gym can ever be
 * reached. Sample venues have to behave like places: fixed, and either near
 * you or not.
 */
function anchorFor(center: LatLon): LatLon {
  return {
    lat: Math.round(center.lat * 100) / 100,
    lon: Math.round(center.lon * 100) / 100,
  };
}

function gymsAround(rawCenter: LatLon) {
  const center = anchorFor(rawCenter);
  return SEEDS.map((s, i) => {
    const at = offsetBy(center, s.meters, s.bearing);
    return {
      id: `demo_${i}_${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
      name: s.name,
      kind: s.kind,
      lat: at.lat,
      lon: at.lon,
      address: s.address,
      amenities: s.amenities,
      dropIn: s.dropIn,
    };
  });
}

export const demoGymProvider: GymProvider = {
  name: 'sample',
  async search(center, radiusMeters) {
    const all = gymsAround(center);
    // Filter by true distance from where the user actually is, not by the seed
    // offset: the anchor is a grid point, so those are two different numbers.
    const within = all.filter((g) => distanceMeters(center, g) <= radiusMeters);
    return {
      gyms: within,
      features: [],
      attribution: 'Sample data — connect a gym source to see real venues.',
      sample: true,
    } satisfies GymSearchResult;
  },
};

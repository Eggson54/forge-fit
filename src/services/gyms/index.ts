import { config } from '../config';
import type { LatLon } from '../../domain/geo';
import type { GymProvider, GymSearchResult } from './types';
import { demoGymProvider } from './demo';

export * from './types';

/**
 * Talks to YOUR backend, which proxies whichever POI source you use and holds
 * any credentials that source needs. No maps key is ever bundled into the app,
 * and the only thing that leaves the device is the coarse centre point the user
 * opted into sharing.
 */
const backendProvider: GymProvider = {
  name: 'backend',
  async search(center, radiusMeters) {
    const url = `${config.gyms.apiUrl.replace(/\/$/, '')}/nearby`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        // Three decimals is about 110 m — enough to find the right
        // neighbourhood, not enough to point at a front door.
        lat: Math.round(center.lat * 1000) / 1000,
        lon: Math.round(center.lon * 1000) / 1000,
        radiusMeters,
      }),
    });
    if (!res.ok) throw new Error(`Gym search failed: ${res.status}`);
    const body = (await res.json()) as Partial<GymSearchResult>;
    return {
      gyms: body.gyms ?? [],
      features: body.features ?? [],
      attribution: body.attribution ?? 'Venue data via your gym source.',
      sample: false,
    };
  },
};

export const gymProvider: GymProvider = config.gyms.enabled ? backendProvider : demoGymProvider;

export async function searchGyms(center: LatLon, radiusMeters: number): Promise<GymSearchResult> {
  try {
    return await gymProvider.search(center, radiusMeters);
  } catch {
    // A failed lookup should leave the map empty and say so, not crash the tab.
    return { gyms: [], features: [], attribution: 'Could not reach the gym source.', sample: false };
  }
}

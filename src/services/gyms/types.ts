import type { Gym } from '../../domain/gyms';
import type { LatLon } from '../../domain/geo';

/**
 * Optional basemap geometry. The app draws whatever the provider supplies and
 * nothing more — it never invents streets. A source that returns no geometry
 * gets the graticule-and-rings map, which is honest about knowing where things
 * are relative to you without claiming to know what the roads look like.
 */
export type MapFeatureKind = 'water' | 'park' | 'road' | 'rail' | 'building';

export interface MapFeature {
  id: string;
  kind: MapFeatureKind;
  /** Open polyline for roads/rail, closed ring for water/park/building. */
  path: LatLon[];
  closed: boolean;
}

export interface GymSearchResult {
  gyms: Gym[];
  features: MapFeature[];
  /** Where the data came from, shown in the map's attribution line. */
  attribution: string;
  /** True when this is illustrative sample data rather than real POIs. */
  sample: boolean;
}

export interface GymProvider {
  readonly name: string;
  search(center: LatLon, radiusMeters: number): Promise<GymSearchResult>;
}

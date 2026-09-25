import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Card, Chip, EmptyState, Screen, SectionHeader, StatTile, Text } from '../src/components/ui';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { MapView } from '../src/components/MapView';
import { Icon } from '../src/components/Icon';
import { colors, spacing } from '../src/theme';
import { formatDistance, formatElevation } from '../src/domain/geo';
import { HEATMAP_NOTE, buildHeatmap, readHeatmap } from '../src/domain/heatmap';
import { PRIVACY_NOTE, describeEffect } from '../src/domain/privacy';
import { TILES_NOTE } from '../src/domain/tiles';
import { useActivityStore } from '../src/stores/useActivityStore';
import { useMapStore } from '../src/stores/useMapStore';
import { useRouteStore } from '../src/stores/useRouteStore';
import { useProfileStore } from '../src/stores/useProfileStore';

type Window = 30 | 90 | 365 | 0;

const WINDOWS: { label: string; value: Window }[] = [
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: 'A year', value: 365 },
  { label: 'Everything', value: 0 },
];

/**
 * Everywhere you have been.
 *
 * The single screen that makes a year of recording feel like something,
 * rather than a list of rows.
 */
export default function MapScreen() {
  const activities = useActivityStore((s) => s.activities);
  const zones = useMapStore((s) => s.zones);
  const sourceId = useMapStore((s) => s.sourceId);
  const units = useProfileStore((s) => s.profile.units);
  const savedRoutes = useRouteStore((s) => s.saved);
  const [window, setWindow] = useState<Window>(90);

  const chosen = useMemo(() => {
    if (window === 0) return activities;
    const cutoff = new Date(Date.now() - window * 86_400_000).toISOString().slice(0, 10);
    return activities.filter((a) => a.date >= cutoff);
  }, [activities, window]);

  const heatmap = useMemo(
    // Cells of roughly fifty metres. Finer bins look right in the abstract
    // and vanish in practice: at a city-wide view a thirteen-metre cell is a
    // third of a pixel, so the heatmap silently becomes invisible at exactly
    // the zoom the screen is for. Fifty metres stays about two pixels wide
    // there and is still finer than a street at close range.
    () => buildHeatmap(chosen.map((a) => a.points), { zoom: 14, resolution: 48 }),
    [chosen],
  );

  const reading = readHeatmap(heatmap);
  const totalM = chosen.reduce((a, x) => a + x.distanceM, 0);
  const totalAscent = chosen.reduce((a, x) => a + x.ascentM, 0);

  // Zones are applied to the routes behind the heatmap too — a heatmap that
  // leaks the front door leaks it more thoroughly than one route does.
  const hiddenAnywhere = chosen.some((a) => describeEffect(a.points, zones).hidden > 0);

  return (
    <Screen gradient>
      <ScreenHeader title="Your map" subtitle="Everywhere you have been" />

      {activities.length === 0 ? (
        <EmptyState tint={colors.electric}
          icon="map"
          title="Nothing recorded yet"
          subtitle="Record a route and it appears here. After a few, this map starts showing the streets you always take and the half of the city you never do."
        />
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md }}>
            {WINDOWS.map((w) => (
              <Chip key={w.value} label={w.label} selected={window === w.value} onPress={() => setWindow(w.value)} />
            ))}
          </View>

          <MapView
            routes={chosen.map((a) => a.points)}
            heatmap={heatmap}
            zones={zones}
            units={units}
            sourceId={sourceId}
            height={340}
            routeColor="rgba(255,90,31,0.45)"
          />

          <Card style={{ marginTop: spacing.md }}>
            <View style={{ flexDirection: 'row' }}>
              <StatTile value={`${chosen.length}`} label="Activities" accent={colors.primary} />
              <StatTile value={formatDistance(totalM, units)} label="Distance" accent={colors.steps} />
              <StatTile value={formatElevation(totalAscent, units)} label="Climbed" accent={colors.carbs} />
            </View>
          </Card>

          {reading && (
            <Card style={{ gap: spacing.sm, marginTop: spacing.md }}>
              <Text variant="bodyStrong">{reading.headline}</Text>
              <Text variant="caption" color={colors.textDim}>{reading.detail}</Text>
              <Text variant="caption" color={colors.textFaint}>{HEATMAP_NOTE}</Text>
            </Card>
          )}

          <SectionHeader title="Recent routes" />
          {chosen.slice(0, 6).map((a) => (
            <Card
              key={a.id}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm }}
              onPress={() => router.push(`/record/${a.id}`)}
            >
              <View style={{ width: 84 }}>
                <MapView
                  routes={[a.points]}
                  zones={zones}
                  units={units}
                  sourceId={sourceId}
                  height={60}
                  interactive={false}
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="bodyStrong" numberOfLines={1}>{a.name}</Text>
                <Text variant="caption" color={colors.textFaint}>
                  {a.date} · {formatDistance(a.distanceM, units)}
                </Text>
              </View>
              <Icon name="chevron_right" size={15} color={colors.textFaint} />
            </Card>
          ))}
        </>
      )}

      <SectionHeader title="Planning" />
      <Card style={{ gap: spacing.md }} onPress={() => router.push('/routes')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Icon name="map" size={18} color={colors.primary} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyStrong">
              {savedRoutes.length === 0
                ? 'Plan a route'
                : `${savedRoutes.length} planned ${savedRoutes.length === 1 ? 'route' : 'routes'}`}
            </Text>
            <Text variant="caption" color={colors.textFaint}>
              Tap out a course, see how far it is, send it to your watch.
            </Text>
          </View>
          <Icon name="chevron_right" size={15} color={colors.textFaint} />
        </View>
      </Card>

      <SectionHeader title="Privacy" />
      <Card style={{ gap: spacing.md }} onPress={() => router.push('/settings/privacy-zones')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Icon name="lock" size={18} color={zones.length ? colors.success : colors.amber} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyStrong">
              {zones.length === 0
                ? 'No privacy zones set'
                : `${zones.length} privacy ${zones.length === 1 ? 'zone' : 'zones'}`}
            </Text>
            <Text variant="caption" color={colors.textFaint}>
              {zones.length === 0
                ? 'Every route on this screen shows exactly where it started.'
                : hiddenAnywhere
                  ? 'Applied to every route above.'
                  : 'Set, but none of these routes go near one.'}
            </Text>
          </View>
          <Icon name="chevron_right" size={15} color={colors.textFaint} />
        </View>
        <Text variant="caption" color={colors.textFaint}>{PRIVACY_NOTE}</Text>
      </Card>

      <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
        {TILES_NOTE}
      </Text>
    </Screen>
  );
}

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Chip, EmptyState, Input, Screen, SectionHeader, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { MapView } from '../../src/components/MapView';
import { Icon } from '../../src/components/Icon';
import { colors, spacing } from '../../src/theme';
import { formatDistance, offsetBy, type LatLon } from '../../src/domain/geo';
import {
  PRIVACY_NOTE,
  PRIVACY_WHY,
  ZONE_RADII,
  describeEffect,
  startIsProtected,
} from '../../src/domain/privacy';
import { location } from '../../src/services/location';
import { useActivityStore } from '../../src/stores/useActivityStore';
import { useMapStore } from '../../src/stores/useMapStore';
import { useProfileStore } from '../../src/stores/useProfileStore';

/**
 * Privacy zones.
 *
 * The screen does one thing most settings screens do not: it shows the
 * consequence before the decision. Somebody can see exactly how much of their
 * own routes a zone removes, on a map, and how many of their recordings would
 * still start from an unprotected door.
 */
export default function PrivacyZones() {
  const zones = useMapStore((s) => s.zones);
  const sourceId = useMapStore((s) => s.sourceId);
  const addZone = useMapStore((s) => s.addZone);
  const updateZone = useMapStore((s) => s.updateZone);
  const removeZone = useMapStore((s) => s.removeZone);
  const activities = useActivityStore((s) => s.activities);
  const units = useProfileStore((s) => s.profile.units);

  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [picked, setPicked] = useState<LatLon | null>(null);
  const [locating, setLocating] = useState(false);

  // How many recordings would still give away where they began.
  const unprotected = activities.filter((a) => !startIsProtected(a.points, zones)).length;
  const starts = activities.map((a) => a.points[0]).filter((p): p is NonNullable<typeof p> => !!p);

  const pickCurrentLocation = async () => {
    setLocating(true);
    try {
      const { fix } = await location.request();
      if (fix) setPicked({ lat: fix.lat, lon: fix.lon });
    } finally {
      setLocating(false);
    }
  };

  return (
    <Screen gradient>
      <ScreenHeader title="Privacy zones" />

      <Card style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Icon name="shield" size={17} color={colors.water} />
          <Text variant="bodyStrong" style={{ flex: 1 }}>Why this exists</Text>
        </View>
        <Text variant="caption" color={colors.textDim}>{PRIVACY_WHY}</Text>
        <Text variant="caption" color={colors.textFaint}>{PRIVACY_NOTE}</Text>
      </Card>

      {activities.length > 0 && (
        <Card
          style={{
            marginTop: spacing.md,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: unprotected > 0 ? colors.amber : colors.success,
            gap: 4,
          }}
        >
          <Text variant="bodyStrong" color={unprotected > 0 ? colors.amber : colors.success}>
            {unprotected === 0
              ? 'Every recorded route starts inside a zone'
              : `${unprotected} of ${activities.length} routes start outside any zone`}
          </Text>
          <Text variant="caption" color={colors.textFaint}>
            {unprotected === 0
              ? 'Nothing you have recorded shows where it began.'
              : 'Each of those shows exactly where it began. That is fine if they start from a park; it is not if they start from your door.'}
          </Text>
        </Card>
      )}

      {starts.length > 0 && (
        <>
          <SectionHeader title="Where your routes begin" />
          <MapView
            routes={[]}
            markers={starts.slice(0, 60).map((p) => ({
              at: p,
              color: startIsProtected([p], zones) ? colors.success : colors.amber,
            }))}
            units={units}
            sourceId={sourceId}
            height={230}
          />
          <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.xs }}>
            Green starts are inside a zone; amber ones are not. Deliberately shown unprotected — you cannot decide
            where to put a zone without seeing this.
          </Text>
        </>
      )}

      <SectionHeader title="Your zones" />
      {zones.length === 0 ? (
        <EmptyState icon="lock" title="None yet" subtitle="Add one around anywhere you regularly start from." />
      ) : (
        zones.map((zone) => {
          const affected = activities.filter((a) => describeEffect(a.points, [zone]).hidden > 0).length;
          return (
            <Card key={zone.id} style={{ gap: spacing.md, marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Icon name="lock" size={16} color={colors.water} />
                <Text variant="bodyStrong" style={{ flex: 1 }}>{zone.label}</Text>
                <Text variant="caption" color={colors.textFaint}>
                  {formatDistance(zone.radiusM, units)}
                </Text>
              </View>

              <MapView
                routes={[circle(zone.center, zone.radiusM)]}
                markers={[{ at: zone.center, color: colors.water }]}
                units={units}
                sourceId={sourceId}
                height={150}
                interactive={false}
                routeColor={colors.water}
              />

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {ZONE_RADII.map((r) => (
                  <Chip
                    key={r}
                    label={formatDistance(r, units)}
                    selected={zone.radiusM === r}
                    onPress={() => updateZone(zone.id, { radiusM: r })}
                  />
                ))}
              </View>

              <Text variant="caption" color={colors.textFaint}>
                {affected === 0
                  ? 'None of your recorded routes pass through this one yet.'
                  : `Hides part of ${affected} of your ${activities.length} recorded ${activities.length === 1 ? 'route' : 'routes'}. Their distance, time and climbing are unchanged.`}
              </Text>

              <Button title="Remove this zone" variant="ghost" onPress={() => removeZone(zone.id)} />
            </Card>
          );
        })
      )}

      <SectionHeader title="Add a zone" />
      <Card style={{ gap: spacing.md }}>
        {adding ? (
          <>
            <Input value={label} onChangeText={setLabel} placeholder="Home, work, the club…" />
            <Button
              title={locating ? 'Finding you…' : picked ? 'Use a different spot' : 'Use where I am now'}
              variant="secondary"
              onPress={() => void pickCurrentLocation()}
              disabled={locating}
            />
            {picked && (
              <>
                <MapView
                  routes={[circle(picked, 400)]}
                  markers={[{ at: picked, color: colors.water }]}
                  units={units}
                  sourceId={sourceId}
                  height={170}
                  routeColor={colors.water}
                  onPressPoint={setPicked}
                />
                <Text variant="caption" color={colors.textFaint}>
                  Tap the map to move it. The circle is the 400 m default; you can change it after.
                </Text>
              </>
            )}
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Add"
                  disabled={!picked}
                  onPress={() => {
                    if (!picked) return;
                    addZone(picked, label);
                    setAdding(false);
                    setLabel('');
                    setPicked(null);
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Cancel" variant="ghost" onPress={() => { setAdding(false); setPicked(null); }} />
              </View>
            </View>
          </>
        ) : (
          <Button title="Add a privacy zone" onPress={() => setAdding(true)} />
        )}
      </Card>

      <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
        Zones are applied when a route is drawn or shared, never when it is recorded. That means removing a zone brings
        the route back, and adding one never destroys anything you measured.
      </Text>
    </Screen>
  );
}

/** A ring of points around a centre, for drawing a zone's edge. */
function circle(center: LatLon, radiusM: number, steps = 48): LatLon[] {
  return Array.from({ length: steps + 1 }, (_, i) => offsetBy(center, radiusM, (i / steps) * 360));
}

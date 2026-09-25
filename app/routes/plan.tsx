import React, { useCallback, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Chip, Input, Screen, SectionHeader, StatTile, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { MapView } from '../../src/components/MapView';
import { colors, spacing } from '../../src/theme';
import { formatDistance, type LatLon } from '../../src/domain/geo';
import { formatDuration, formatPaceSec } from '../../src/domain/track';
import {
  EMPTY_PLAN,
  FALLBACK_PACES,
  ROUTE_PLAN_NOTE,
  ROUTE_PLAN_WIGGLE,
  addWaypoint,
  closeLoop,
  estimateSeconds,
  outAndBack,
  paceFromSecPerKm,
  paceToSecPerKm,
  planFrom,
  planQuality,
  removeLast,
  typicalPaceSecPerKm,
} from '../../src/domain/routePlan';
import { gpxFiles } from '../../src/services/gpxFiles';
import { location } from '../../src/services/location';
import { useActivityStore } from '../../src/stores/useActivityStore';
import { useMapStore } from '../../src/stores/useMapStore';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { useRouteStore } from '../../src/stores/useRouteStore';

/**
 * Tap out a route before you run it.
 *
 * The compromise is on the screen rather than in a comment: legs are straight
 * lines, the note says so, and `planQuality` speaks up when enough of them are
 * long enough that the distance is probably under-reading. A planner that drew
 * a straight line through a housing estate and called it three kilometres
 * would be worse than no planner.
 */
export default function PlanRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const saved = useRouteStore((s) => s.saved);
  const save = useRouteStore((s) => s.save);
  const remove = useRouteStore((s) => s.remove);
  const sourceId = useMapStore((s) => s.sourceId);
  const units = useProfileStore((s) => s.profile.units);
  const activities = useActivityStore((s) => s.activities);

  const existing = useMemo(() => saved.find((r) => r.id === id) ?? null, [saved, id]);

  const [plan, setPlan] = useState(() => (existing ? planFrom(existing.waypoints) : EMPTY_PLAN));
  const [name, setName] = useState(existing?.name ?? '');

  // A pace the athlete has actually run beats a guess, and a guess presented
  // as theirs would be worse than asking.
  const runPace = useMemo(
    () =>
      typicalPaceSecPerKm(
        activities
          .filter((a) => a.type === 'run')
          .slice(0, 20)
          .map((a) => ({ distanceM: a.distanceM, seconds: a.movingS > 0 ? a.movingS : a.elapsedS })),
      ),
    [activities],
  );
  // Held in the unit on screen, so a chip's label and the number behind it
  // cannot drift apart. Converted once, at the point of estimating.
  const unit = units === 'imperial' ? 'mi' : 'km';
  const [pace, setPace] = useState<number | null>(null);
  const shownPace = pace ?? (runPace != null ? Math.round(paceFromSecPerKm(runPace, units)) : null);

  // Somewhere to look before anything is tapped. The last place they
  // actually ran, because that is where the next route almost certainly
  // starts — and because an empty map with no viewport cannot be tapped at
  // all, which is what made this necessary rather than merely nice.
  const [here, setHere] = useState<LatLon | null>(null);
  const [locating, setLocating] = useState(false);
  const startNear = useMemo<LatLon | undefined>(() => {
    if (existing?.waypoints.length) return existing.waypoints[0];
    const last = activities.find((a) => a.points.length > 0);
    if (last) return last.points[0];
    return here ?? undefined;
  }, [existing, activities, here]);

  // Only ever from a button press. The planner needs somewhere to start, and
  // asking is better than silently reading a position for a screen that has
  // not been told it may.
  const findMe = async () => {
    setLocating(true);
    const { fix } = await location.request();
    setLocating(false);
    if (fix) setHere({ lat: fix.lat, lon: fix.lon });
    else
      Alert.alert(
        'No position',
        'Location was not available, so there is nowhere to centre the map. You can still plan a route from an activity you have already recorded.',
      );
  };

  const quality = useMemo(() => planQuality(plan), [plan]);
  const seconds =
    shownPace != null ? estimateSeconds(plan.distanceM, paceToSecPerKm(shownPace, units)) : null;

  const onTap = useCallback((p: LatLon) => setPlan((current) => addWaypoint(current, p)), []);

  const onSave = () => {
    const route = save(name, plan);
    if (!route) {
      Alert.alert('Not enough to save', 'A route needs at least two points. Tap the map to add them.');
      return;
    }
    // Saving replaces the version being edited rather than stacking a copy.
    if (existing) remove(existing.id);
    router.replace('/routes');
  };

  const onExport = async () => {
    const route = save(name, plan);
    if (!route) {
      Alert.alert('Nothing to send', 'Tap out a route first.');
      return;
    }
    if (existing) remove(existing.id);
    const ok = await gpxFiles.exportRoute(route);
    if (!ok) {
      Alert.alert(
        'Saved, but not sent',
        'The route is in your list. Sharing a file needs a development build — in Expo Go there is nowhere to hand it to.',
      );
    }
    router.replace('/routes');
  };

  const rounded = FALLBACK_PACES[units === 'imperial' ? 'imperial' : 'metric'];
  const mine = runPace != null ? Math.round(paceFromSecPerKm(runPace, units)) : null;
  const paceChoices = mine != null ? [mine, ...rounded.filter((p) => p !== mine)] : rounded;

  return (
    <Screen gradient>
      <ScreenHeader title={existing ? 'Edit route' : 'Plan a route'} subtitle="Tap the map to add a point" />

      {!startNear && (
        <Card style={{ gap: spacing.md }}>
          <Text variant="bodyStrong">Where are you planning?</Text>
          <Text variant="caption" color={colors.textDim}>
            There is no recorded activity to centre the map on yet, and a map with nowhere to look is a
            blank square. Point it at where you are and start tapping.
          </Text>
          <Button title={locating ? 'Finding you…' : 'Centre on my location'} disabled={locating} onPress={() => void findMe()} />
        </Card>
      )}

      {startNear && (
      <Card padded={false} style={{ overflow: 'hidden' }}>
        <MapView
          routes={plan.waypoints.length > 1 ? [plan.waypoints] : []}
          markers={plan.waypoints.map((at, i) => ({
            at,
            color: i === 0 ? colors.lime : colors.primary,
            label: i === 0 ? 'Start' : String(i + 1),
          }))}
          // Deliberately not passed the privacy zones. Those hide where you
          // have *been* from other people; blanking the map under your own
          // finger while you plan would only stop you tapping your own street.
          sourceId={sourceId}
          units={units}
          height={320}
          center={startNear}
          refit={false}
          onPressPoint={onTap}
        />
      </Card>
      )}

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <StatTile
          // Before anything is tapped there is no route, which is not the
          // same as a route of no length. "0 ft" reads as a measurement.
          value={plan.waypoints.length > 1 ? formatDistance(plan.distanceM, units) : '—'}
          label="Distance"
          // Emphasised through the value's colour rather than an accent dot:
          // the dot adds a row of its own, so one accented tile among three
          // sits twelve pixels lower than its neighbours.
          color={colors.primary}
        />
        <StatTile value={seconds != null ? formatDuration(seconds) : '—'} label="Estimated time" />
        <StatTile value={String(plan.waypoints.length)} label="Points" />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Button
          title="Undo"
          variant="secondary"
          fullWidth={false}
          disabled={plan.waypoints.length === 0}
          onPress={() => setPlan(removeLast)}
        />
        <Button
          title="Close the loop"
          variant="secondary"
          fullWidth={false}
          disabled={plan.waypoints.length < 3 || plan.closed}
          onPress={() => setPlan(closeLoop)}
        />
        <Button
          title="Out and back"
          variant="secondary"
          fullWidth={false}
          disabled={plan.waypoints.length < 2}
          onPress={() => setPlan(outAndBack)}
        />
        <Button
          title="Clear"
          variant="ghost"
          fullWidth={false}
          disabled={plan.waypoints.length === 0}
          onPress={() => setPlan(EMPTY_PLAN)}
        />
      </View>

      {quality.wiggleWarning && (
        <Card tone="alt">
          <Text variant="caption" color={colors.warning}>
            {ROUTE_PLAN_WIGGLE} Longest leg so far: {formatDistance(quality.longestLegM, units)}.
          </Text>
        </Card>
      )}

      <Card style={{ gap: spacing.sm }}>
        <SectionHeader title="Pace to estimate with" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {paceChoices.map((p) => (
            <Chip
              key={p}
              label={formatPaceSec(p, unit)}
              selected={shownPace === p}
              onPress={() => setPace(p)}
            />
          ))}
        </View>
        <Text variant="caption" color={colors.textFaint}>
          {runPace != null
            ? `The first is your own median pace across your recent runs. It is a median rather than an average so one walk logged as a run does not move it.`
            : 'Nothing recorded to take a pace from yet, so these are just round numbers — pick whichever is nearest.'}
        </Text>
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <Input label="Name" value={name} onChangeText={setName} placeholder="Round the park" />
        <Button title={existing ? 'Save changes' : 'Save route'} onPress={onSave} disabled={plan.waypoints.length < 2} />
        <Button
          title="Save and send as GPX"
          variant="secondary"
          onPress={() => void onExport()}
          disabled={plan.waypoints.length < 2}
        />
      </Card>

      <Card tone="alt">
        <Text variant="caption" color={colors.textDim}>
          {ROUTE_PLAN_NOTE}
        </Text>
      </Card>
    </Screen>
  );
}

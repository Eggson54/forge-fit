import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, EmptyState, Pill, Screen, SectionHeader, StatTile, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { MapView } from '../../src/components/MapView';
import { LineChart } from '../../src/components/ui';
import { colors, spacing } from '../../src/theme';
import { formatDistance, formatElevation } from '../../src/domain/geo';
import { formatDuration } from '../../src/domain/track';
import { climbCategory, gradientPct } from '../../src/domain/segments';
import { formatDayMonth } from '../../src/domain/date';
import { useActivityStore } from '../../src/stores/useActivityStore';
import { useMapStore } from '../../src/stores/useMapStore';
import { useProfileStore } from '../../src/stores/useProfileStore';

export default function SegmentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const segment = useActivityStore((s) => s.segments.find((x) => x.id === id) ?? null);
  const board = useActivityStore((s) => s.board(id!));
  const hideSegment = useActivityStore((s) => s.hideSegment);
  const removeSegment = useActivityStore((s) => s.removeSegment);
  const units = useProfileStore((s) => s.profile.units);
  const zones = useMapStore((s) => s.zones);
  const sourceId = useMapStore((s) => s.sourceId);

  if (!segment) {
    return (
      <Screen gradient>
        <ScreenHeader title="Segment" />
        <EmptyState icon="map" title="Not found" subtitle="This segment is no longer here." />
      </Screen>
    );
  }

  const category = climbCategory(segment);
  // Oldest first for the chart: a trend that runs right to left reads backwards.
  const overTime = [...board.efforts].sort((a, b) => (a.date < b.date ? -1 : 1));

  return (
    <Screen gradient>
      <ScreenHeader title={segment.name} subtitle={formatDistance(segment.distanceM, units)} />

      <MapView
        routes={[segment.path]}
        zones={zones}
        units={units}
        height={210}
        sourceId={sourceId}
        routeColor={colors.carbs}
      />

      <Card style={{ marginTop: spacing.md }}>
        <View style={{ flexDirection: 'row' }}>
          <StatTile value={formatDistance(segment.distanceM, units)} label="Length" accent={colors.carbs} />
          <StatTile value={formatElevation(segment.ascentM, units)} label="Climb" accent={colors.steps} />
          <StatTile value={`${gradientPct(segment)}%`} label="Average" accent={colors.amber} />
        </View>
        {category && (
          <View style={{ marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Pill label={category === 'HC' ? 'Hors catégorie' : `Category ${category}`} color={colors.amber} />
            <Text variant="caption" color={colors.textFaint} style={{ flex: 1 }}>
              The cycling convention, from length and gradient. It says nothing about how you will find it today.
            </Text>
          </View>
        )}
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Text variant="body" color={colors.textDim}>{board.note}</Text>
      </Card>

      {overTime.length >= 3 && (
        <>
          <SectionHeader title="Over time" />
          <Card>
            <LineChart
              data={overTime.map((e) => ({ label: formatDayMonth(e.date), value: e.seconds }))}
              height={120}
              color={colors.primary}
            />
            <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.xs }}>
              Lower is faster. {formatDayMonth(overTime[0]!.date)} to {formatDayMonth(overTime[overTime.length - 1]!.date)}.
            </Text>
          </Card>
        </>
      )}

      <SectionHeader title="Your times" />
      {board.efforts.length === 0 ? (
        <EmptyState icon="timer" title="No times yet" subtitle="The next activity through here gets timed automatically." />
      ) : (
        <Card style={{ gap: 2 }}>
          {board.efforts.map((e, i) => (
            <View key={`${e.activityId}-${i}`} style={styles.row}>
              <Text variant="label" color={i === 0 ? colors.primary : colors.textDim} style={{ width: 26 }}>
                {i + 1}
              </Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="body" numberOfLines={1} onPress={() => router.push(`/record/${e.activityId}`)}>
                  {e.activityName}
                </Text>
                <Text variant="caption" color={colors.textFaint}>
                  {formatDayMonth(e.date)}
                  {e.avgHr != null ? ` · ${e.avgHr} bpm` : ''}
                </Text>
              </View>
              <Text variant="bodyStrong" color={i === 0 ? colors.primary : colors.text}>
                {formatDuration(e.seconds)}
              </Text>
            </View>
          ))}
        </Card>
      )}

      <SectionHeader title="This segment" />
      <Card style={{ gap: spacing.sm }}>
        <Button
          title={segment.hidden ? 'Show in the list' : 'Hide from the list'}
          variant="ghost"
          onPress={() => hideSegment(segment.id, !segment.hidden)}
        />
        <Text variant="caption" color={colors.textFaint}>
          Hiding keeps timing it — it just stops cluttering the list.
        </Text>
        <Button
          title="Delete segment and its times"
          variant="danger"
          onPress={() => {
            removeSegment(segment.id);
            router.back();
          }}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
});

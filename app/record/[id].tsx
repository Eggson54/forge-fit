import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, EmptyState, Input, Screen, SectionHeader, StatTile, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { ElevationProfile, TraceMap } from '../../src/components/TraceMap';
import { Icon } from '../../src/components/Icon';
import { colors, spacing } from '../../src/theme';
import { distanceMeters } from '../../src/domain/geo';
import { displayDistance } from '../../src/domain/cardio';
import {
  KM,
  MILE,
  TRACK_CAVEAT,
  formatDuration,
  formatPaceSec,
  gradeAdjustedPace,
  splits,
  trackStats,
} from '../../src/domain/track';
import { BEST_EFFORTS_NOTE } from '../../src/domain/bestEfforts';
import { MIN_SEGMENT_M, SEGMENTS_NOTE } from '../../src/domain/segments';
import { useActivityStore } from '../../src/stores/useActivityStore';
import { useProfileStore } from '../../src/stores/useProfileStore';

export default function ActivityDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const activity = useActivityStore((s) => s.activities.find((a) => a.id === id) ?? null);
  const efforts = useActivityStore((s) => s.segmentEfforts.filter((e) => e.activityId === id));
  const segments = useActivityStore((s) => s.segments);
  const createSegment = useActivityStore((s) => s.createSegment);
  const remove = useActivityStore((s) => s.remove);
  const rename = useActivityStore((s) => s.rename);
  const units = useProfileStore((s) => s.profile.units);

  const [highlight, setHighlight] = useState<{ from: number; to: number } | null>(null);
  const [naming, setNaming] = useState(false);
  const [segmentName, setSegmentName] = useState('');
  const [editingName, setEditingName] = useState<string | null>(null);

  const unitM = units === 'imperial' ? MILE : KM;
  const unitLabel = units === 'imperial' ? 'mi' : 'km';

  const derived = useMemo(() => {
    if (!activity) return null;
    const stats = trackStats(activity.points);
    return {
      stats,
      splitList: splits(activity.points, unitM),
      gap: gradeAdjustedPace(activity.points),
      profile: activity.elevation ?? [],
    };
  }, [activity, unitM]);

  if (!activity || !derived) {
    return (
      <Screen gradient>
        <ScreenHeader title="Activity" />
        <EmptyState icon="map" title="Not found" subtitle="This activity is no longer here." />
      </Screen>
    );
  }

  const distance = displayDistance(activity.distanceM / 1000, units);
  const pace = activity.movingS > 0 ? (activity.movingS / activity.distanceM) * unitM : null;

  // A segment is carved from whatever stretch is currently highlighted. With
  // nothing highlighted, the whole route is the obvious default.
  const range = highlight ?? { from: 0, to: activity.points.length - 1 };
  const rangeMeters = metersBetween(activity.points, range.from, range.to);

  return (
    <Screen gradient>
      <ScreenHeader title={activity.name} subtitle={activity.date} />

      <TraceMap points={activity.points} height={220} highlight={highlight} />

      {derived.profile.length > 2 && (
        <View style={{ marginTop: spacing.sm }}>
          <ElevationProfile points={derived.profile} />
          <Text variant="caption" color={colors.textFaint}>
            {activity.ascentM} m up · {activity.descentM} m down
          </Text>
        </View>
      )}

      <Card style={{ marginTop: spacing.md }}>
        <View style={{ flexDirection: 'row' }}>
          <StatTile value={distance ? `${distance.value}` : '—'} label={distance?.unit ?? unitLabel} accent={colors.primary} />
          <StatTile value={formatDuration(activity.movingS)} label="Moving" accent={colors.steps} />
          <StatTile value={pace ? formatPaceSec(pace, unitLabel).split(' ')[0]! : '—'} label={`/${unitLabel}`} accent={colors.calorie} />
        </View>
        {(activity.avgHr || derived.gap) && (
          <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
            {activity.avgHr != null && <StatTile value={`${activity.avgHr}`} label="Avg HR" accent={colors.danger} />}
            {activity.maxHr != null && <StatTile value={`${activity.maxHr}`} label="Max HR" accent={colors.danger} />}
            {derived.gap != null && (
              <StatTile
                value={formatPaceSec(units === 'imperial' ? derived.gap * 1.609344 : derived.gap, unitLabel).split(' ')[0]!}
                label="Hill-adjusted"
                accent={colors.protein}
              />
            )}
          </View>
        )}
        {activity.elapsedS - activity.movingS > 30 && (
          <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
            {formatDuration(activity.elapsedS)} elapsed — {formatDuration(activity.elapsedS - activity.movingS)} of it
            stopped, which pace ignores.
          </Text>
        )}
      </Card>

      {derived.splitList.length > 0 && (
        <>
          <SectionHeader title="Splits" />
          <Card style={{ gap: 2 }}>
            {derived.splitList.map((s) => {
              const fastest = Math.min(...derived.splitList.map((x) => x.paceSecPerUnit));
              const slowest = Math.max(...derived.splitList.map((x) => x.paceSecPerUnit));
              // Scaled to this run's own range, because against an absolute
              // scale every split of an easy run looks identical — but with a
              // floor on that range. An evenly paced run has a spread of a
              // couple of seconds, and stretching those two seconds across
              // the full width turns noise into a dramatic-looking collapse.
              // The floor is five per cent of pace: below that, the bars stay
              // nearly equal, which is the truth.
              const span = Math.max(slowest - fastest, fastest * 0.05);
              const fill = 0.3 + 0.7 * (1 - (s.paceSecPerUnit - fastest) / span);
              return (
                <View key={s.index} style={styles.split}>
                  {/* A partial last split gets its distance rather than a
                      number: its pace is extrapolated from a fraction of a
                      unit, and an unlabelled "5" next to four full splits
                      invites reading it as a fifth kilometre. */}
                  <Text variant="caption" color={colors.textDim} style={{ width: 34 }} numberOfLines={1}>
                    {s.distanceM < unitM * 0.95
                      ? `${(s.distanceM / unitM).toFixed(1)}`
                      : `${s.index}`}
                  </Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${fill * 100}%` }]} />
                  </View>
                  <Text variant="label" style={{ width: 62, textAlign: 'right' }}>
                    {formatPaceSec(s.paceSecPerUnit, unitLabel).split(' ')[0]}
                  </Text>
                  {s.avgHr != null && (
                    <Text variant="caption" color={colors.textFaint} style={{ width: 34, textAlign: 'right' }}>
                      {s.avgHr}
                    </Text>
                  )}
                </View>
              );
            })}
          </Card>
        </>
      )}

      {activity.efforts.length > 0 && (
        <>
          <SectionHeader title="Best efforts" />
          <Card style={{ gap: spacing.xs }}>
            {activity.efforts.map((e) => (
              <View key={e.key} style={styles.row}>
                <Text
                  variant="body"
                  style={{ flex: 1 }}
                  onPress={() => setHighlight({ from: e.startIndex, to: e.endIndex })}
                >
                  {e.label}
                </Text>
                <Text variant="bodyStrong">{formatDuration(e.seconds)}</Text>
              </View>
            ))}
            <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.xs }}>
              {BEST_EFFORTS_NOTE}
            </Text>
          </Card>
        </>
      )}

      {efforts.length > 0 && (
        <>
          <SectionHeader title="Segments on this route" />
          <Card style={{ gap: spacing.xs }}>
            {efforts.map((e, i) => {
              const segment = segments.find((s) => s.id === e.segmentId);
              return (
                <View key={`${e.segmentId}-${i}`} style={styles.row}>
                  <Text
                    variant="body"
                    style={{ flex: 1 }}
                    onPress={() => router.push(`/segments/${e.segmentId}`)}
                  >
                    {segment?.name ?? 'Segment'}
                  </Text>
                  <Text variant="bodyStrong">{formatDuration(e.seconds)}</Text>
                  <Icon name="chevron_right" size={15} color={colors.textFaint} />
                </View>
              );
            })}
          </Card>
        </>
      )}

      <SectionHeader title="Make a segment" />
      <Card style={{ gap: spacing.md }}>
        <Text variant="caption" color={colors.textDim}>
          {SEGMENTS_NOTE}
        </Text>
        {highlight ? (
          <Text variant="caption" color={colors.primary}>
            Using the highlighted stretch — {Math.round(rangeMeters)} m.
          </Text>
        ) : (
          <Text variant="caption" color={colors.textFaint}>
            Tap a best effort above to pick out a stretch, or leave it to use the whole route.
          </Text>
        )}
        {naming ? (
          <>
            <Input value={segmentName} onChangeText={setSegmentName} placeholder="Name this segment" />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Create"
                  disabled={rangeMeters < MIN_SEGMENT_M}
                  onPress={() => {
                    const created = createSegment(activity.id, range.from, range.to, segmentName);
                    setNaming(false);
                    setSegmentName('');
                    if (created) router.push(`/segments/${created.id}`);
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Cancel" variant="ghost" onPress={() => setNaming(false)} />
              </View>
            </View>
            {rangeMeters < MIN_SEGMENT_M && (
              <Text variant="caption" color={colors.warning}>
                Too short. A segment needs at least {MIN_SEGMENT_M} m, or the start and finish overlap and matching
                stops being reliable.
              </Text>
            )}
          </>
        ) : (
          <Button title="Create a segment" variant="secondary" onPress={() => setNaming(true)} />
        )}
        {highlight && <Button title="Clear highlight" variant="ghost" onPress={() => setHighlight(null)} />}
      </Card>

      <SectionHeader title="This activity" />
      <Card style={{ gap: spacing.md }}>
        {editingName == null ? (
          <Button title="Rename" variant="ghost" onPress={() => setEditingName(activity.name)} />
        ) : (
          <>
            <Input value={editingName} onChangeText={setEditingName} placeholder="Activity name" />
            <Button
              title="Save name"
              onPress={() => {
                rename(activity.id, editingName);
                setEditingName(null);
              }}
            />
          </>
        )}
        <Button
          title="Delete this activity"
          variant="danger"
          onPress={() => {
            remove(activity.id);
            router.back();
          }}
        />
      </Card>

      <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
        {TRACK_CAVEAT}
      </Text>
    </Screen>
  );
}

function metersBetween(points: { lat: number; lon: number }[], from: number, to: number): number {
  let d = 0;
  for (let i = Math.max(1, from + 1); i <= Math.min(points.length - 1, to); i++) {
    d += distanceMeters(points[i - 1]!, points[i]!);
  }
  return d;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  split: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3 },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
});

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Card, Screen, SectionHeader, SegmentedControl, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, radius, spacing } from '../../src/theme';
import { daysBetween, nearestValue } from '../../src/domain/trend';
import { formatDateLong, formatDayMonth } from '../../src/domain/date';
import { displayWeight } from '../../src/domain/units';
import type { PhotoPose, ProgressPhoto } from '../../src/domain/types';
import { useLogStore } from '../../src/stores/useLogStore';
import { useProfileStore } from '../../src/stores/useProfileStore';

const POSES: PhotoPose[] = ['front', 'side', 'back'];

/**
 * Side-by-side comparison — the reason to take progress photos at all. A
 * timeline of thumbnails never shows you the change; two pictures next to each
 * other do.
 */
export default function ComparePhotos() {
  const params = useLocalSearchParams<{ pose?: PhotoPose }>();
  const photos = useLogStore((s) => s.photos);
  const weightLogs = useLogStore((s) => s.weight);
  const units = useProfileStore((s) => s.profile.units);

  const [pose, setPose] = useState<PhotoPose>(params.pose ?? 'front');

  // Oldest first, so the filmstrip reads left-to-right as time passing.
  const posePhotos = useMemo(
    () => photos.filter((p) => p.pose === pose).sort((a, b) => (a.date < b.date ? -1 : 1)),
    [photos, pose],
  );

  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);

  // Default to the widest span available, and fall back whenever the pose
  // changes underneath a selection that no longer exists.
  const left = posePhotos.find((p) => p.id === leftId) ?? posePhotos[0] ?? null;
  const right = posePhotos.find((p) => p.id === rightId) ?? posePhotos[posePhotos.length - 1] ?? null;

  const weightSeries = useMemo(
    () => weightLogs.map((w) => ({ date: w.date, value: w.weightKg })),
    [weightLogs],
  );

  const leftWeight = left ? nearestValue(weightSeries, left.date) : null;
  const rightWeight = right ? nearestValue(weightSeries, right.date) : null;
  const deltaKg = leftWeight && rightWeight ? rightWeight.value - leftWeight.value : null;
  const delta = deltaKg == null ? null : displayWeight(Math.abs(deltaKg), units);
  const span = left && right ? daysBetween(left.date, right.date) : 0;

  return (
    <Screen gradient>
      <ScreenHeader title="Compare" />

      <SegmentedControl options={POSES.map((p) => ({ label: cap(p), value: p }))} value={pose} onChange={setPose} />

      {posePhotos.length < 2 ? (
        <Card style={{ marginTop: spacing.lg }}>
          <Text variant="bodyStrong">Not enough {pose} photos yet</Text>
          <Text variant="caption" color={colors.textDim} style={{ marginTop: spacing.xs }}>
            Two of the same pose, taken some weeks apart, is what makes a comparison worth looking at.
          </Text>
        </Card>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
            <Side photo={left} label="Before" weightKg={leftWeight?.value ?? null} units={units} />
            <Side photo={right} label="After" weightKg={rightWeight?.value ?? null} units={units} />
          </View>

          <Card style={{ marginTop: spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text variant="metric">{span}</Text>
                <Text variant="caption" color={colors.textDim}>
                  days apart
                </Text>
              </View>
              {delta && deltaKg != null ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="metric" color={colors.protein}>
                    {deltaKg > 0 ? '+' : '−'}
                    {delta.value} {delta.unit}
                  </Text>
                  <Text variant="caption" color={colors.textDim}>
                    between weigh-ins
                  </Text>
                </View>
              ) : (
                <Text variant="caption" color={colors.textFaint} style={{ flex: 1, textAlign: 'right' }}>
                  No weigh-in within a week of both photos
                </Text>
              )}
            </View>
          </Card>

          <SectionHeader title="Pick the before" />
          <Filmstrip photos={posePhotos} selectedId={left?.id ?? null} onSelect={setLeftId} />

          <SectionHeader title="Pick the after" />
          <Filmstrip photos={posePhotos} selectedId={right?.id ?? null} onSelect={setRightId} />

          <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.md }}>
            Lighting, time of day and how full you are all move what a photo shows. Same spot, same light, same time is
            what makes two of them comparable.
          </Text>
        </>
      )}
    </Screen>
  );
}

function Side({
  photo,
  label,
  weightKg,
  units,
}: {
  photo: ProgressPhoto | null;
  label: string;
  weightKg: number | null;
  units: 'imperial' | 'metric';
}) {
  const w = weightKg == null ? null : displayWeight(weightKg, units);
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text variant="overline" color={colors.textDim} style={{ marginBottom: spacing.xs }}>
        {label}
      </Text>
      {photo ? (
        <>
          <Image source={{ uri: photo.uri }} style={styles.photo} contentFit="cover" />
          <Text variant="label" style={{ marginTop: spacing.xs }}>
            {formatDateLong(photo.date)}
          </Text>
          <Text variant="caption" color={colors.textDim}>
            {w ? `${w.value} ${w.unit}` : 'no weigh-in nearby'}
          </Text>
        </>
      ) : (
        <View style={[styles.photo, styles.empty]} />
      )}
    </View>
  );
}

function Filmstrip({
  photos,
  selectedId,
  onSelect,
}: {
  photos: ProgressPhoto[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -spacing.xl }}
      contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.xl }}
    >
      {photos.map((p) => (
        <Pressable key={p.id} onPress={() => onSelect(p.id)} style={{ alignItems: 'center' }}>
          <Image
            source={{ uri: p.uri }}
            style={[styles.thumb, p.id === selectedId && styles.thumbOn]}
            contentFit="cover"
          />
          <Text variant="caption" color={p.id === selectedId ? colors.text : colors.textFaint} style={{ marginTop: 4 }}>
            {formatDayMonth(p.date)}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const styles = StyleSheet.create({
  photo: {
    width: '100%',
    aspectRatio: 0.72,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
  },
  empty: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  thumb: {
    width: 56,
    height: 74,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceHigh,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbOn: { borderColor: colors.primary },
});

import React from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Card, EmptyState, Screen, SectionHeader, SegmentedControl, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { colors, radius, spacing } from '../../src/theme';
import { todayISO } from '../../src/domain/date';
import type { PhotoPose } from '../../src/domain/types';
import { useLogStore } from '../../src/stores/useLogStore';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { nearestValue } from '../../src/domain/trend';
import { displayWeight } from '../../src/domain/units';
import { formatDateLong } from '../../src/domain/date';

const POSES: PhotoPose[] = ['front', 'side', 'back'];

export default function Photos() {
  const photos = useLogStore((s) => s.photos);
  const addPhoto = useLogStore((s) => s.addPhoto);
  const removePhoto = useLogStore((s) => s.removePhoto);
  const [pose, setPose] = React.useState<PhotoPose>('front');
  const units = useProfileStore((st) => st.profile.units);
  const weightLogs = useLogStore((st) => st.weight);

  const weightSeries = React.useMemo(
    () => weightLogs.map((w) => ({ date: w.date, value: w.weightKg })),
    [weightLogs],
  );
  const weightFor = React.useCallback(
    (date: string) => {
      const hit = nearestValue(weightSeries, date, 7);
      if (!hit) return null;
      const d = displayWeight(hit.value, units);
      return `${d.value} ${d.unit}`;
    },
    [weightSeries, units],
  );

  const pick = async (fromCamera: boolean) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Enable access to add a progress photo.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (!result.canceled && result.assets[0]) {
      addPhoto({ date: todayISO(), pose, uri: result.assets[0].uri });
    }
  };

  const posePhotos = photos.filter((p) => p.pose === pose).sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <Screen gradient>
      <ScreenHeader title="Progress Photos" />

      <Card tone="alt" style={{ marginBottom: spacing.md }}>
        <Text variant="caption" color={colors.textDim}>
          Photos are stored privately on your device. ForgeFit never makes medical or body-composition claims from your
          images — they're your own visual record.
        </Text>
      </Card>

      <SegmentedControl options={POSES.map((p) => ({ label: cap(p), value: p }))} value={pose} onChange={setPose} />

      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
        <Card style={{ flex: 1, alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg }} onPress={() => pick(true)}>
          <Icon name="camera" size={24} color={colors.primary} />
          <Text variant="label">Take Photo</Text>
        </Card>
        <Card style={{ flex: 1, alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg }} onPress={() => pick(false)}>
          <Icon name="plus" size={24} color={colors.primary} />
          <Text variant="label">Upload</Text>
        </Card>
      </View>

      <SectionHeader
        title={`${cap(pose)} timeline`}
        action={posePhotos.length >= 2 ? 'Compare' : undefined}
        onAction={() => router.push({ pathname: '/progress/compare', params: { pose } })}
      />
      {posePhotos.length === 0 ? (
        <EmptyState tint={colors.lime}
          icon="camera"
          title="No photos yet"
          subtitle={`Add your first ${pose} photo to start a timeline.`}
          action="Add a photo"
          onAction={() => pick(true)}
        />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {posePhotos.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => router.push({ pathname: '/progress/compare', params: { pose } })}
              onLongPress={() =>
                Alert.alert('Remove photo?', '', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => removePhoto(p.id) },
                ])
              }
              accessibilityRole="button"
              accessibilityLabel={`${cap(pose)} photo from ${formatDateLong(p.date)}. Long press to remove.`}
              style={{ width: '47%' }}
            >
              <Image source={{ uri: p.uri }} style={{ width: '100%', aspectRatio: 0.75, borderRadius: radius.md, backgroundColor: colors.surfaceHigh }} contentFit="cover" />
              <Text variant="caption" color={colors.textDim} style={{ marginTop: 4 }} numberOfLines={1}>
                {formatDateLong(p.date)}
              </Text>
              {/* What you weighed then. A photo dated "Aug 10" is a picture; a
                  photo at 189 lb is a comparison. The nearest weigh-in within a
                  week, because photos and weigh-ins rarely land on the same day
                  and reaching further would attach a number from another month. */}
              {weightFor(p.date) && (
                <Text variant="caption" color={colors.textFaint} numberOfLines={1}>
                  {weightFor(p.date)}
                </Text>
              )}
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

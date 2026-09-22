import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Card, EmptyState, Pill, Screen, Text } from '../../src/components/ui';
import { FadeIn } from '../../src/components/anim';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { TraceMap } from '../../src/components/TraceMap';
import { Icon } from '../../src/components/Icon';
import { colors, spacing } from '../../src/theme';
import { formatDistance } from '../../src/domain/geo';
import { formatDuration } from '../../src/domain/track';
import { SEGMENTS_NOTE, climbCategory, gradientPct } from '../../src/domain/segments';
import { useActivityStore } from '../../src/stores/useActivityStore';
import { useProfileStore } from '../../src/stores/useProfileStore';

export default function Segments() {
  const segments = useActivityStore((s) => s.segments);
  const segmentEfforts = useActivityStore((s) => s.segmentEfforts);
  const board = useActivityStore((s) => s.board);
  const units = useProfileStore((s) => s.profile.units);

  const visible = useActivityStore.getState().visibleSegments();
  const hiddenCount = segments.length - visible.length;

  return (
    <Screen gradient>
      <ScreenHeader title="Segments" subtitle="Your stretches, your times" />

      {visible.length === 0 ? (
        <EmptyState
          icon="map"
          title="No segments yet"
          subtitle="Record a route, open it, and carve out the hill or the loop you keep coming back to. Every later activity through it is timed for you."
        />
      ) : (
        visible.map((segment, i) => {
          const b = board(segment.id);
          const category = climbCategory(segment);
          return (
            <FadeIn key={segment.id} delay={i * 50}>
              <Card style={{ gap: spacing.sm, marginBottom: spacing.md }} onPress={() => router.push(`/segments/${segment.id}`)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                    {segment.name}
                  </Text>
                  {category && <Pill label={category === 'HC' ? 'HC' : `Cat ${category}`} color={colors.amber} />}
                  <Icon name="chevron_right" size={15} color={colors.textFaint} />
                </View>

                <TraceMap points={segment.path} height={90} color={colors.carbs} />

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <Text variant="caption" color={colors.textDim}>
                    {formatDistance(segment.distanceM, units)}
                  </Text>
                  {segment.ascentM > 5 && (
                    <Text variant="caption" color={colors.textDim}>
                      {segment.ascentM} m · {gradientPct(segment)}%
                    </Text>
                  )}
                  <Text variant="caption" color={colors.textFaint} style={{ flex: 1, textAlign: 'right' }}>
                    {b.best ? `Best ${formatDuration(b.best.seconds)} · ${b.efforts.length} ${b.efforts.length === 1 ? 'go' : 'goes'}` : 'No times yet'}
                  </Text>
                </View>
              </Card>
            </FadeIn>
          );
        })
      )}

      {hiddenCount > 0 && (
        <Text variant="caption" color={colors.textFaint}>
          {hiddenCount} hidden {hiddenCount === 1 ? 'segment' : 'segments'} still being timed in the background.
        </Text>
      )}

      <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.xl }}>
        {SEGMENTS_NOTE} {segmentEfforts.length > 0 ? `${segmentEfforts.length} timed efforts so far.` : ''}
      </Text>
    </Screen>
  );
}

import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, EmptyState, Pill, Screen, SectionHeader, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { TraceMap } from '../../src/components/TraceMap';
import { colors, spacing } from '../../src/theme';
import { formatDistance } from '../../src/domain/geo';
import { formatDayMonth } from '../../src/domain/date';
import { ROUTE_PLAN_NOTE } from '../../src/domain/routePlan';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { useRouteStore } from '../../src/stores/useRouteStore';

/**
 * Routes you planned, as opposed to routes you ran.
 *
 * Kept apart from the activity history on purpose: a plan and a recording
 * look alike on a map and mean opposite things, and a list that mixed them
 * would have you exporting last Tuesday's run to your watch as a target.
 */
export default function Routes() {
  const saved = useRouteStore((s) => s.saved);
  const units = useProfileStore((s) => s.profile.units);

  return (
    <Screen gradient>
      <ScreenHeader
        title="Routes"
        subtitle="Planned, not recorded"
        right={<Button title="New" size="sm" fullWidth={false} onPress={() => router.push('/routes/plan')} />}
      />

      {saved.length === 0 && (
        <EmptyState
          icon="map"
          tint={colors.primary}
          title="No routes yet"
          subtitle="Tap out a course on the map, see how far it is, and send it to your watch as a GPX file."
          action="Plan one"
          onAction={() => router.push('/routes/plan')}
        />
      )}

      {saved.length > 0 && (
        <View style={{ gap: spacing.md }}>
          <SectionHeader title={`${saved.length} saved`} />
          {saved.map((r) => (
            <Card key={r.id} style={{ gap: spacing.sm }} onPress={() => router.push(`/routes/plan?id=${r.id}`)}>
              <TraceMap points={r.waypoints} height={140} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {r.name}
                </Text>
                {r.closed && <Pill label="Loop" color={colors.lime} />}
                <Text variant="label" color={colors.textDim}>
                  {formatDistance(r.distanceM, units)}
                </Text>
              </View>
              <Text variant="caption" color={colors.textFaint}>
                Planned {formatDayMonth(r.createdAt.slice(0, 10))}
              </Text>
            </Card>
          ))}
        </View>
      )}

      <Card tone="alt">
        <Text variant="caption" color={colors.textDim}>
          {ROUTE_PLAN_NOTE}
        </Text>
      </Card>
    </Screen>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, useWindowDimensions, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Button, Card, Screen, SectionHeader, Text } from '../../src/components/ui';
import { FadeIn } from '../../src/components/anim';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { GymMap, RarityLegend, RARITY_COLOR } from '../../src/components/GymMap';
import { colors, layout, radius, spacing } from '../../src/theme';
import { bearingDegrees, compassPoint, formatDistance } from '../../src/domain/geo';
import {
  CLAIM_RADIUS_M,
  KIND_LABEL,
  RARITY_LABEL,
  claimPoints,
  nearbyGyms,
  rarityOf,
} from '../../src/domain/gyms';
import { searchRadiiFor, useGymStore, type SearchRadius } from '../../src/stores/useGymStore';
import { useProfileStore } from '../../src/stores/useProfileStore';

export default function GymMapScreen() {
  const { width } = useWindowDimensions();
  const units = useProfileStore((s) => s.profile.units);

  const locationEnabled = useGymStore((s) => s.locationEnabled);
  const permission = useGymStore((s) => s.permission);
  const fix = useGymStore((s) => s.fix);
  const gyms = useGymStore((s) => s.gyms);
  const features = useGymStore((s) => s.features);
  const attribution = useGymStore((s) => s.attribution);
  const sampleData = useGymStore((s) => s.sampleData);
  const searchRadius = useGymStore((s) => s.radius);
  const loading = useGymStore((s) => s.loading);
  const claims = useGymStore((s) => s.claims);
  const enableLocation = useGymStore((s) => s.enableLocation);
  const refreshFix = useGymStore((s) => s.refreshFix);
  const search = useGymStore((s) => s.search);
  const setRadius = useGymStore((s) => s.setRadius);
  const summary = useGymStore((s) => s.summary());

  const [selected, setSelected] = useState<string | null>(null);
  const claimedIds = useMemo(() => new Set(claims.map((c) => c.gymId)), [claims]);

  // The stored radius is a plain number, so a metric default can survive a
  // switch to imperial and leave no chip looking selected. Snap it to the
  // nearest value in the list this user actually sees.
  const radii = useMemo(() => searchRadiiFor(units), [units]);
  useEffect(() => {
    if (radii.includes(searchRadius)) return;
    const nearest = radii.reduce((a, b) =>
      Math.abs(b - searchRadius) < Math.abs(a - searchRadius) ? b : a,
    );
    setRadius(nearest);
  }, [radii, searchRadius, setRadius]);

  // On focus, not on mount. The router keeps this screen alive, so a mount
  // effect runs exactly once per session — which meant walking to a gym,
  // opening the app and being told you were still at home.
  useFocusEffect(
    React.useCallback(() => {
      if (!locationEnabled) return;
      refreshFix().then((f) => {
        if (f) search(f);
      });
    }, [locationEnabled, refreshFix, search]),
  );

  const mapW = width - layout.screenPadding * 2;
  const rows = useMemo(() => nearbyGyms(gyms, fix, claimedIds, 30), [gyms, fix, claimedIds]);
  const inRange = rows.filter((r) => r.distanceMeters <= CLAIM_RADIUS_M && !r.claimed);

  if (!locationEnabled) {
    return (
      <Screen gradient>
        <ScreenHeader title="Iron Map" />
        <FadeIn>
          <Card style={{ gap: spacing.lg, marginTop: spacing.md }}>
            <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md }}>
              <View style={styles.markIcon}>
                <Icon name="map" size={26} color={colors.primary} strokeWidth={1.7} />
              </View>
              <Text variant="h2" center>Collect the rooms you train in</Text>
              <Text variant="body" color={colors.textDim} center>
                Find gyms near you, claim the ones you actually visit, and build a collection across the
                places you lift.
              </Text>
            </View>

            <View style={{ gap: spacing.md, borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: spacing.lg }}>
              <Text variant="overline" color={colors.textFaint}>BEFORE YOU TURN THIS ON</Text>
              {[
                'Your location is used to find nearby gyms and to check you are actually at one when you claim it.',
                'Positions stay on your device. If a gym source is set up, only a coordinate rounded to about 110 metres is sent.',
                'Never used to target advertising, and never sold.',
                'You can turn this off at any time, which clears the stored position immediately.',
              ].map((line) => (
                <View key={line} style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={styles.bullet} />
                  <Text variant="caption" color={colors.textDim} style={{ flex: 1, minWidth: 0 }}>
                    {line}
                  </Text>
                </View>
              ))}
            </View>

            <Button title="Turn on the map" onPress={() => enableLocation()} />
            {permission === 'denied' && (
              <Text variant="caption" color={colors.warning} center>
                Location is blocked for ForgeFit. You will need to allow it in your system settings.
              </Text>
            )}
            {permission === 'unavailable' && (
              <Text variant="caption" color={colors.textFaint} center>
                Location is not available on this device or build.
              </Text>
            )}
          </Card>
        </FadeIn>
      </Screen>
    );
  }

  return (
    <Screen gradient>
      <ScreenHeader
        title="Iron Map"
        right={
          <Pressable
            onPress={() => router.push('/gyms/collection')}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel="Your gym collection"
          >
            <Text variant="label" color={colors.primary}>Collection</Text>
          </Pressable>
        }
      />

      <FadeIn>
        <View style={{ gap: spacing.sm }}>
          <GymMap
            gyms={gyms}
            claimedIds={claimedIds}
            here={fix}
            features={features}
            width={mapW}
            height={Math.round(mapW * 0.92)}
            units={units}
            selectedId={selected}
            onSelect={(g) => setSelected((s) => (s === g.id ? null : g.id))}
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <RarityLegend />
            </View>
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Pressable
                onPress={() => refreshFix().then((f) => f && search(f))}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Refresh nearby gyms"
                style={styles.iconBtn}
              >
                <Icon name="repeat" size={15} color={colors.textFaint} strokeWidth={1.8} />
              </Pressable>
            )}
          </View>

          <Text variant="caption" color={colors.textFaint}>
            {attribution}
          </Text>
        </View>
      </FadeIn>

      {/* Anything you can claim right now leads, because that is the one thing
          this screen can do that a list cannot. */}
      {inRange.length > 0 && (
        <FadeIn delay={60}>
          <Card style={{ marginTop: spacing.md, gap: spacing.md, borderColor: colors.primary, borderWidth: 1 }}>
            <Text variant="overline" color={colors.primary}>YOU ARE HERE</Text>
            {inRange.map((g) => (
              <Pressable
                key={g.id}
                onPress={() => router.push(`/gyms/${g.id}`)}
                accessibilityRole="link"
                accessibilityLabel={`Claim ${g.name}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>{g.name}</Text>
                  <Text variant="caption" color={colors.textDim}>
                    {formatDistance(g.distanceMeters, units)} away · worth {claimPoints(g)} pts
                  </Text>
                </View>
                <View style={styles.claimPill}>
                  <Text variant="label" color={colors.bg}>Claim</Text>
                </View>
              </Pressable>
            ))}
          </Card>
        </FadeIn>
      )}

      <Card style={{ marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="bodyStrong" color={summary.tier.color}>{summary.tier.name}</Text>
          <Text variant="caption" color={colors.textDim}>
            {summary.claimed} claimed · {summary.points} pts
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/gyms/collection')}
          hitSlop={8}
          accessibilityRole="link"
          accessibilityLabel="Open your collection"
        >
          <Icon name="chevron_right" size={18} color={colors.textFaint} strokeWidth={2} />
        </Pressable>
      </Card>

      <SectionHeader title={`Nearby · ${rows.length}`} />

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
        {radii.map((r) => (
          <Pressable
            key={r}
            onPress={() => setRadius(r as SearchRadius)}
            accessibilityRole="button"
            accessibilityState={{ selected: searchRadius === r }}
            accessibilityLabel={`Search within ${formatDistance(r, units)}`}
            style={[styles.radiusChip, searchRadius === r && styles.radiusChipOn]}
          >
            <Text variant="caption" color={searchRadius === r ? colors.bg : colors.textDim}>
              {formatDistance(r, units)}
            </Text>
          </Pressable>
        ))}
      </View>

      {rows.length === 0 ? (
        <Card>
          <Text variant="caption" color={colors.textFaint}>
            {loading ? 'Looking…' : 'No gyms found in this radius. Try widening the search.'}
          </Text>
        </Card>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {rows.map((g, i) => (
            <FadeIn key={g.id} delay={Math.min(200, i * 25)}>
              <Card
                onPress={() => router.push(`/gyms/${g.id}`)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
              >
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: g.claimed ? RARITY_COLOR[rarityOf(g)] : 'transparent',
                      borderColor: RARITY_COLOR[rarityOf(g)],
                    },
                  ]}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>{g.name}</Text>
                  <Text variant="caption" color={colors.textDim} numberOfLines={1}>
                    {KIND_LABEL[g.kind]} · {RARITY_LABEL[rarityOf(g)]}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="label" color={g.claimed ? colors.success : colors.text}>
                    {Number.isFinite(g.distanceMeters) ? formatDistance(g.distanceMeters, units) : '—'}
                  </Text>
                  <Text variant="caption" color={colors.textFaint}>
                    {fix ? compassPoint(bearingDegrees(fix, g)) : ''}
                    {g.claimed ? ' · claimed' : ` · ${claimPoints(g)} pts`}
                  </Text>
                </View>
              </Card>
            </FadeIn>
          ))}
        </View>
      )}

      {sampleData && (
        <Card tone="alt" style={{ marginTop: spacing.lg }}>
          <Text variant="caption" color={colors.textFaint}>
            These are sample venues placed around you so the map is usable in this build. Point
            EXPO_PUBLIC_GYM_API_URL at your backend to search real gyms — the app never holds a maps key
            itself.
          </Text>
        </Card>
      )}
    </Screen>
  );
}

const styles = {
  markIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(255,90,31,0.12)',
  },
  bullet: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary, marginTop: 7 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  claimPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  radiusChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  radiusChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.6 },
};

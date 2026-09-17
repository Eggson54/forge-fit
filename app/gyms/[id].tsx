import React, { useMemo, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Button, Card, Screen, Text } from '../../src/components/ui';
import { Celebration, FadeIn } from '../../src/components/anim';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { GymMap, RARITY_COLOR } from '../../src/components/GymMap';
import { colors, layout, radius, spacing } from '../../src/theme';
import { formatDateWithWeekday } from '../../src/domain/date';
import { bearingDegrees, compassPoint, distanceMeters, formatDistance } from '../../src/domain/geo';
import {
  barChoices,
  describeKit,
  isStandardKit,
  plateChoices,
  smallestJump,
} from '../../src/domain/gymKit';
import {
  CLAIM_RADIUS_M,
  KIND_LABEL,
  RARITY_LABEL,
  RETURN_VISIT_POINTS,
  claimPoints,
  evaluateCheckIn,
  rarityOf,
} from '../../src/domain/gyms';
import { useGymStore } from '../../src/stores/useGymStore';
import { useProfileStore } from '../../src/stores/useProfileStore';

export default function GymDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const units = useProfileStore((s) => s.profile.units);

  const gym = useGymStore((s) => s.gymsById()[String(id)]);
  const fix = useGymStore((s) => s.fix);
  const claim = useGymStore((s) => s.claimFor(String(id)));
  const checkIn = useGymStore((s) => s.checkIn);
  const refreshFix = useGymStore((s) => s.refreshFix);
  const [celebrate, setCelebrate] = useState<{ points: number; first: boolean } | null>(null);
  const [editingKit, setEditingKit] = useState(false);
  const kit = useGymStore((s) => s.kitFor(String(id)));
  const setKit = useGymStore((s) => s.setKit);
  const clearKit = useGymStore((s) => s.clearKit);

  // Whether you can claim depends on where you are *now*, so the position is
  // re-read every time this screen is opened rather than trusted from before.
  useFocusEffect(
    React.useCallback(() => {
      refreshFix();
    }, [refreshFix]),
  );

  const verdict = useMemo(
    () => (gym ? evaluateCheckIn(gym, fix, claim, new Date()) : null),
    [gym, fix, claim],
  );

  if (!gym) {
    return (
      <Screen gradient>
        <ScreenHeader title="Gym" />
        <Card>
          <Text variant="body" color={colors.textDim}>
            This venue is no longer in your current search. Widen the radius on the map to find it again.
          </Text>
        </Card>
      </Screen>
    );
  }

  const tint = RARITY_COLOR[rarityOf(gym)];
  const distance = fix ? distanceMeters(fix, gym) : null;
  const mapW = width - layout.screenPadding * 2;

  const onClaim = () => {
    const result = checkIn(gym.id);
    if (!result) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCelebrate(result);
  };

  return (
    <Screen gradient>
      <ScreenHeader title={claim ? 'Claimed' : 'Gym'} />

      {celebrate && <Celebration count={celebrate.first ? 18 : 8} />}

      <FadeIn>
        <Card style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
            <View style={[styles.badge, { borderColor: tint, backgroundColor: claim ? tint : 'transparent' }]}>
              <Icon name="dumbbell" size={17} color={claim ? '#0B0B0F' : tint} strokeWidth={1.9} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text variant="h3">{gym.name}</Text>
              <Text variant="caption" color={colors.textDim}>
                {KIND_LABEL[gym.kind]}
              </Text>
              {gym.address && (
                <Text variant="caption" color={colors.textFaint} numberOfLines={2}>
                  {gym.address}
                </Text>
              )}
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            <View style={[styles.tag, { borderColor: tint }]}>
              <Text variant="caption" color={tint}>{RARITY_LABEL[rarityOf(gym)]}</Text>
            </View>
            <View style={styles.tag}>
              <Text variant="caption" color={colors.textDim}>
                {claim ? `${claim.pointsEarned} pts earned` : `${claimPoints(gym)} pts`}
              </Text>
            </View>
            {distance !== null && (
              <View style={styles.tag}>
                <Text variant="caption" color={colors.textDim}>
                  {formatDistance(distance, units)} {fix ? compassPoint(bearingDegrees(fix, gym)) : ''}
                </Text>
              </View>
            )}
            {gym.dropIn && (
              <View style={styles.tag}>
                <Text variant="caption" color={colors.success}>Drop-in</Text>
              </View>
            )}
          </View>
        </Card>
      </FadeIn>

      <View style={{ marginTop: spacing.md }}>
        <GymMap
          gyms={[gym]}
          claimedIds={claim ? new Set([gym.id]) : new Set()}
          here={fix}
          width={mapW}
          height={Math.round(mapW * 0.6)}
          units={units}
          selectedId={gym.id}
        />
      </View>

      <Card
        style={{
          marginTop: spacing.md,
          gap: spacing.md,
          ...(celebrate ? { borderColor: tint, borderWidth: 1 } : null),
        }}
      >
        {celebrate ? (
          // Flipping straight to "already logged today" turns the reward into
          // a cooldown notice. The claim you just made is what belongs here.
          <View style={{ alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm }}>
            <Text variant="display" color={tint}>+{celebrate.points}</Text>
            <Text variant="bodyStrong">
              {celebrate.first ? 'Claimed' : 'Visit logged'}
            </Text>
            <Text variant="caption" color={colors.textDim} center>
              {celebrate.first
                ? `${gym.name} is in your collection.`
                : `That is ${claim?.visits.length ?? 1} visits here.`}
            </Text>
          </View>
        ) : verdict?.ok ? (
          <>
            <Text variant="bodyStrong">
              {verdict.first ? 'You can claim this gym' : 'Log another visit'}
            </Text>
            <Text variant="caption" color={colors.textDim}>
              {verdict.first
                ? `Worth ${verdict.points} points, added to your collection.`
                : `Return visits are worth ${RETURN_VISIT_POINTS} points.`}
            </Text>
            <Button title={verdict.first ? `Claim · ${verdict.points} pts` : 'Log visit'} onPress={onClaim} />
          </>
        ) : verdict?.reason === 'too_far' ? (
          <>
            <Text variant="bodyStrong" color={colors.textDim}>Not close enough yet</Text>
            <Text variant="caption" color={colors.textFaint}>
              You need to be within {formatDistance(CLAIM_RADIUS_M, units)} of the door. Right now you are{' '}
              {formatDistance(verdict.distanceMeters ?? 0, units)} away. Nothing here rewards the journey —
              claim it when you are there to train.
            </Text>
          </>
        ) : verdict?.reason === 'cooldown' ? (
          <>
            <Text variant="bodyStrong" color={colors.textDim}>Already logged today</Text>
            <Text variant="caption" color={colors.textFaint}>
              Another visit counts in about {verdict.hoursRemaining}{' '}
              {verdict.hoursRemaining === 1 ? 'hour' : 'hours'}.
            </Text>
          </>
        ) : (
          <>
            <Text variant="bodyStrong" color={colors.textDim}>Location is off</Text>
            <Text variant="caption" color={colors.textFaint}>
              Claiming checks that you are actually at the gym, so it needs your position.
            </Text>
            <Pressable onPress={() => router.push('/gyms')} hitSlop={8} accessibilityRole="link">
              <Text variant="label" color={colors.primary}>Back to the map ›</Text>
            </Pressable>
          </>
        )}
      </Card>

      {/* What this gym actually has. The calculator has always read one
          inventory from the profile, which is right only if you train in one
          place — and the gym with no 2.5s is the one where the maths matters. */}
      <Card style={{ marginTop: spacing.md, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="overline" color={colors.textFaint}>EQUIPMENT HERE</Text>
            <Text variant="caption" color={colors.textDim}>{describeKit(kit, units)}</Text>
          </View>
          <Pressable
            onPress={() => setEditingKit((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityState={{ expanded: editingKit }}
            accessibilityLabel={editingKit ? 'Done editing equipment' : 'Edit the equipment at this gym'}
          >
            <Text variant="label" color={colors.primary}>{editingKit ? 'Done' : 'Edit'}</Text>
          </Pressable>
        </View>

        {editingKit && (
          <>
            <Text variant="caption" color={colors.textFaint}>
              Plates ({units === 'imperial' ? 'lb' : 'kg'}) — pick what is on the racks here.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {plateChoices(units).map((p) => {
                const on = kit?.plates.includes(p) ?? false;
                return (
                  <Pressable
                    key={p}
                    onPress={() => {
                      const current = kit?.plates ?? [];
                      setKit(gym.id, {
                        unit: units,
                        bars: kit?.bars ?? [],
                        plates: on ? current.filter((x) => x !== p) : [...current, p],
                      });
                    }}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${p} ${units === 'imperial' ? 'pound' : 'kilo'} plates`}
                    style={[styles.kitChip, on && styles.kitChipOn]}
                  >
                    <Text variant="caption" color={on ? colors.bg : colors.textDim}>{p}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text variant="caption" color={colors.textFaint}>Bars</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {barChoices(units).map((b) => {
                const on = kit?.bars.includes(b) ?? false;
                return (
                  <Pressable
                    key={b}
                    onPress={() => {
                      const current = kit?.bars ?? [];
                      setKit(gym.id, {
                        unit: units,
                        plates: kit?.plates ?? [],
                        bars: on ? current.filter((x) => x !== b) : [...current, b],
                      });
                    }}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={b === 0 ? 'No bar' : `${b} bar`}
                    style={[styles.kitChip, on && styles.kitChipOn]}
                  >
                    <Text variant="caption" color={on ? colors.bg : colors.textDim}>
                      {b === 0 ? 'none' : b}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text variant="caption" color={colors.textFaint}>
              Leave these empty to use the standard set. Smallest jump you can make here:{' '}
              {smallestJump(units, kit)} {units === 'imperial' ? 'lb' : 'kg'}.
            </Text>
            {!isStandardKit(kit) && (
              <Pressable onPress={() => clearKit(gym.id)} hitSlop={8} accessibilityRole="button">
                <Text variant="label" color={colors.textDim}>Reset to standard</Text>
              </Pressable>
            )}
          </>
        )}

        <Pressable
          onPress={() => router.push({ pathname: '/tools/plates', params: { gymId: gym.id } })}
          hitSlop={8}
          accessibilityRole="link"
          accessibilityLabel="Open the plate calculator for this gym"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <Icon name="sliders" size={14} color={colors.primary} strokeWidth={1.9} />
          <Text variant="label" color={colors.primary}>Plate maths for this gym ›</Text>
        </Pressable>
      </Card>

      {gym.amenities && gym.amenities.length > 0 && (
        <Card style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <Text variant="overline" color={colors.textFaint}>WHAT IS THERE</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {gym.amenities.map((a) => (
              <View key={a} style={styles.tag}>
                <Text variant="caption" color={colors.textDim}>{a}</Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      {claim && (
        <Card style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <Text variant="overline" color={colors.textFaint}>YOUR VISITS · {claim.visits.length}</Text>
          {claim.visits.slice(0, 8).map((v, i) => (
            <View key={`${v}_${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="caption" color={colors.textDim}>{formatDateWithWeekday(v)}</Text>
              {i === claim.visits.length - 1 && (
                <Text variant="caption" color={tint}>first claim</Text>
              )}
            </View>
          ))}
        </Card>
      )}

    </Screen>
  );
}

const styles = {
  badge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  kitChip: {
    minWidth: 42,
    alignItems: 'center' as const,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  kitChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tag: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
};

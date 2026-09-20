import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Card, Screen, SectionHeader, Text, Well } from '../../src/components/ui';
import { FadeIn } from '../../src/components/anim';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { colors, domainAccent, spacing } from '../../src/theme';
import { formatDateWithWeekday, todayISO } from '../../src/domain/date';
import { displayVolume, groupThousands } from '../../src/domain/units';
import { lifetimeStats, monthlyTotals, trainingGrid, type TrainingDay } from '../../src/domain/trainingYear';
import { sessionsByGym } from '../../src/domain/gymStats';
import { onThisDay } from '../../src/domain/onThisDay';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';
import { useProfileStore } from '../../src/stores/useProfileStore';

/** Five steps from "rest day" to "your heaviest kind of day". */
const LEVEL_FILL = [
  'rgba(255,255,255,0.045)',
  'rgba(255,90,31,0.28)',
  'rgba(255,90,31,0.52)',
  'rgba(255,90,31,0.78)',
  '#FF5A1F',
];

const CELL = 11;
const GAP = 3;
const DAY_LABELS = ['M', '', 'W', '', 'F', '', 'S'];

export default function TrainingYear() {
  const workouts = useWorkoutStore((s) => s.workouts);
  const units = useProfileStore((s) => s.profile.units);
  const [selected, setSelected] = useState<TrainingDay | null>(null);

  const today = todayISO();
  const grid = useMemo(() => trainingGrid(workouts, today, 53), [workouts, today]);
  const stats = useMemo(() => lifetimeStats(workouts), [workouts]);
  const months = useMemo(() => monthlyTotals(grid), [grid]);
  const gyms = useMemo(() => sessionsByGym(workouts), [workouts]);
  const recollections = useMemo(() => onThisDay(workouts, today), [workouts, today]);

  const volume = displayVolume(stats.volumeKg, units);
  const busiest = months.reduce<(typeof months)[number] | null>(
    (best, m) => (!best || m.sessions > best.sessions ? m : best),
    null,
  );

  return (
    <Screen gradient>
      <ScreenHeader
        title="Your training year"
        subtitle={stats.firstSession ? `Since ${formatDateWithWeekday(stats.firstSession)}` : undefined}
      />

      {stats.sessions === 0 ? (
        <Card>
          <Text variant="body" color={colors.textDim}>
            Nothing logged yet. This fills in as you train — one square per day, brighter for a heavier one.
          </Text>
        </Card>
      ) : (
        <>
          <FadeIn>
            <Card style={{ gap: spacing.md }}>
              {/* Horizontal because a year of weeks is 53 columns wide and a
                  phone is not. Scrolled to the present, which is where the
                  interesting end is. */}
              {/* The weekday letters sit OUTSIDE the scroller so they stay
                  pinned; inside it they slid away with the grid. */}
              <View style={{ flexDirection: 'row' }}>
                <View style={{ width: 16, paddingTop: 16, gap: GAP }}>
                  {DAY_LABELS.map((d, i) => (
                    <View key={i} style={{ height: CELL, justifyContent: 'center' }}>
                      <Text variant="caption" color={colors.textFaint} style={{ fontSize: 8 }}>
                        {d}
                      </Text>
                    </View>
                  ))}
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingRight: spacing.md }}
                  ref={(r) => r?.scrollToEnd({ animated: false })}
                >
                  <View>
                    {/* Absolutely placed so a three-letter month is not squeezed
                        into one 11px column and hyphenated down the page. */}
                    <View style={{ height: 14, marginBottom: 2, width: grid.weeks.length * (CELL + GAP) }}>
                      {grid.monthLabels.map((label, i) =>
                        label ? (
                          <Text
                            key={i}
                            variant="caption"
                            color={colors.textFaint}
                            numberOfLines={1}
                            style={{ position: 'absolute', left: i * (CELL + GAP), fontSize: 9, width: 34 }}
                          >
                            {label}
                          </Text>
                        ) : null,
                      )}
                    </View>

                    <View style={{ flexDirection: 'row', gap: GAP }}>
                      {grid.weeks.map((column, w) => (
                        <View key={w} style={{ gap: GAP }}>
                          {column.map((day) => {
                            const future = day.date > today;
                            const isSelected = selected?.date === day.date;
                            return (
                              <Pressable
                                key={day.date}
                                onPress={() => setSelected(isSelected ? null : day)}
                                accessibilityRole="button"
                                accessibilityLabel={
                                  day.sessions > 0
                                    ? `${formatDateWithWeekday(day.date)}: ${day.sessions} session${day.sessions === 1 ? '' : 's'}, ${day.sets} sets`
                                    : `${formatDateWithWeekday(day.date)}: rest`
                                }
                                style={{
                                  width: CELL,
                                  height: CELL,
                                  borderRadius: 2.5,
                                  backgroundColor: future ? 'transparent' : LEVEL_FILL[day.level],
                                  borderWidth: isSelected ? 1.4 : future ? 0.5 : 0,
                                  borderColor: isSelected ? colors.text : 'rgba(255,255,255,0.05)',
                                }}
                              />
                            );
                          })}
                        </View>
                      ))}
                    </View>
                  </View>
                </ScrollView>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <Text variant="caption" color={colors.textFaint} style={{ flex: 1, minWidth: 0 }}>
                  {selected
                    ? selected.sessions > 0
                      ? `${formatDateWithWeekday(selected.date)} · ${selected.sessions} session${selected.sessions === 1 ? '' : 's'} · ${selected.sets} sets`
                      : `${formatDateWithWeekday(selected.date)} · rest`
                    : 'Tap a square for that day'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Text variant="caption" color={colors.textFaint} style={{ fontSize: 9 }}>less</Text>
                  {LEVEL_FILL.map((fill, i) => (
                    <View key={i} style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: fill }} />
                  ))}
                  <Text variant="caption" color={colors.textFaint} style={{ fontSize: 9 }}>more</Text>
                </View>
              </View>

              <Text variant="caption" color={colors.textFaint}>
                Shade is relative to your own days, not a fixed scale — the question it answers is how a day
                compares to your others.
              </Text>
            </Card>
          </FadeIn>

          {recollections.length > 0 && (
            <>
              <SectionHeader title="On this day" accent={domainAccent.progress} />
              <Card style={{ gap: spacing.md }}>
                {recollections.slice(0, 3).map(({ workout, ago }) => (
                  <Pressable
                    key={workout.id}
                    onPress={() => router.push(`/workout/${workout.id}`)}
                    accessibilityRole="link"
                    accessibilityLabel={`${ago}: ${workout.name}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 40 }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="bodyStrong" numberOfLines={1}>{workout.name}</Text>
                      <Text variant="caption" color={colors.textDim}>{ago}</Text>
                    </View>
                    <Icon name="chevron_right" size={15} color={colors.textFaint} strokeWidth={2} />
                  </Pressable>
                ))}
              </Card>
            </>
          )}

          <SectionHeader title="Everything so far" accent={domainAccent.progress} />
          <Well padded={false}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingVertical: spacing.sm }}>
              <Tile value={groupThousands(stats.sessions)} label="Sessions" tint={colors.primary} />
              <Tile value={groupThousands(stats.days)} label="Days trained" tint={colors.steps} />
              <Tile value={groupThousands(stats.sets)} label="Sets" tint={colors.protein} />
              <Tile value={groupThousands(stats.reps)} label="Reps" tint={colors.carbs} />
              <Tile value={`${volume.value}`} label={`Volume (${volume.unit})`} tint={colors.calorie} />
              <Tile value={`${stats.hours}`} label="Hours" tint={colors.water} />
              <Tile value={groupThousands(stats.exercises)} label="Exercises" tint={colors.sleep} />
              <Tile value={groupThousands(stats.longestRun)} label="Longest run" tint={colors.amber} />
            </View>
          </Well>

          <SectionHeader title="By month" accent={domainAccent.progress} />
          <Card style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 92 }}>
              {months.map((m) => {
                const peak = Math.max(1, ...months.map((x) => x.sessions));
                return (
                  <View key={m.month} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                    <View
                      style={{
                        width: '100%',
                        height: Math.max(3, Math.round((m.sessions / peak) * 70)),
                        borderRadius: 3,
                        backgroundColor: m.sessions > 0 ? colors.primary : 'rgba(255,255,255,0.05)',
                        opacity: m.sessions > 0 ? 0.55 + 0.45 * (m.sessions / peak) : 1,
                      }}
                    />
                    <Text variant="caption" color={colors.textFaint} style={{ fontSize: 9 }}>
                      {m.label}
                    </Text>
                  </View>
                );
              })}
            </View>
            {busiest && busiest.sessions > 0 && (
              <Text variant="caption" color={colors.textFaint}>
                Busiest month: {busiest.label}, {busiest.sessions} sessions.
              </Text>
            )}
          </Card>

          {gyms.length > 0 && (
            <>
              <SectionHeader title="Where it happened" accent={domainAccent.gyms} />
              <Card style={{ gap: spacing.sm }}>
                {gyms.slice(0, 5).map((g) => (
                  <Pressable
                    key={g.gymId}
                    onPress={() => router.push(`/gyms/${g.gymId}`)}
                    accessibilityRole="link"
                    accessibilityLabel={`${g.gymName}, ${g.sessions} sessions`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 34 }}
                  >
                    <Icon name="map" size={13} color={domainAccent.gyms} strokeWidth={1.9} />
                    <Text variant="body" style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
                      {g.gymName}
                    </Text>
                    <Text variant="label" color={colors.textDim}>{g.sessions}</Text>
                  </Pressable>
                ))}
              </Card>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

function Tile({ value, label, tint }: { value: string; label: string; tint: string }) {
  return (
    <View style={{ width: '25%', alignItems: 'center', gap: 2, paddingVertical: spacing.md }}>
      <Text variant="bodyStrong" color={tint} numberOfLines={1}>
        {value}
      </Text>
      <Text variant="caption" color={colors.textFaint} style={{ fontSize: 10 }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

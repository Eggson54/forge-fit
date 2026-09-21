import React, { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Card, EmptyState, Screen, Text } from '../src/components/ui';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Icon } from '../src/components/Icon';
import { MuscleThumb } from '../src/components/body/MuscleThumb';
import { colors, noOutline, radius, spacing } from '../src/theme';
import { KIND_LABEL, groupHits, searchEntries, type SearchEntry, type SearchKind } from '../src/domain/search';
import { EXERCISE_LIBRARY } from '../src/data/exercises';
import { FOOD_DB } from '../src/data/foods';
import { useWorkoutStore } from '../src/stores/useWorkoutStore';
import { useRoutineStore } from '../src/stores/useRoutineStore';
import { useProtocolStore } from '../src/stores/useProtocolStore';
import { groupThousands } from '../src/domain/units';

/** Screens worth reaching by name rather than by remembering which tab hides them. */
const SCREENS: SearchEntry[] = [
  { id: 's_records', kind: 'screen', title: 'Personal records', keywords: ['pr', 'best', 'lifts'], href: '/workout/records' },
  { id: 's_history', kind: 'screen', title: 'Workout history', keywords: ['past', 'sessions', 'log'], href: '/workout/history' },
  { id: 's_programs', kind: 'screen', title: 'Training programs', keywords: ['plan', 'split'], href: '/workout/programs' },
  { id: 's_routines', kind: 'screen', title: 'My routines', keywords: ['saved', 'template'], href: '/workout/routines' },
  { id: 's_library', kind: 'screen', title: 'Exercise library', keywords: ['movements', 'lifts'], href: '/workout/library' },
  { id: 's_recipes', kind: 'screen', title: 'Saved meals & recipes', keywords: ['recipe', 'batch', 'servings', 'meal prep', 'portion'], href: '/nutrition/meals' },
  { id: 's_measure', kind: 'screen', title: 'Measurements', keywords: ['tape', 'waist', 'arms'], href: '/progress/measurements' },
  { id: 's_photos', kind: 'screen', title: 'Progress photos', keywords: ['pictures', 'before after'], href: '/progress/photos' },
  { id: 's_weight', kind: 'screen', title: 'Weight log', keywords: ['scale', 'weigh in'], href: '/progress/weight' },
  { id: 's_habits', kind: 'screen', title: 'Sleep, steps & water', keywords: ['trends', 'hydration', 'rest', 'recovery'], href: '/progress/habits' },
  { id: 's_year', kind: 'screen', title: 'Your training year', keywords: ['heatmap', 'calendar', 'lifetime', 'totals', 'history'], href: '/progress/year' },
  { id: 's_compare', kind: 'screen', title: 'Compare photos', keywords: ['before after', 'side by side'], href: '/progress/compare' },
  { id: 's_meals', kind: 'screen', title: 'Saved meals', keywords: ['recipe', 'favourite', 'quick log', 'combo'], href: '/nutrition/meals' },
  { id: 's_trends', kind: 'screen', title: 'Nutrition trends', keywords: ['calories', 'macros', 'charts'], href: '/nutrition/trends' },
  { id: 's_coach', kind: 'screen', title: 'Coach', keywords: ['ai', 'ask', 'chat'], href: '/coach' },
  { id: 's_review', kind: 'screen', title: 'Weekly review', keywords: ['summary', 'recap'], href: '/weekly-review' },
  { id: 's_achieve', kind: 'screen', title: 'Achievements', keywords: ['badges', 'awards'], href: '/achievements' },
  {
    id: 's_standards',
    kind: 'screen',
    title: 'Strength standards',
    keywords: ['standards', 'level', 'ratio', 'bodyweight', 'intermediate', 'advanced', 'elite', 'how strong'],
    href: '/workout/standards',
  },
  {
    id: 's_cardio',
    kind: 'screen',
    title: 'Conditioning',
    keywords: ['cardio', 'run', 'running', 'ride', 'cycling', 'swim', 'row', 'walk', 'pace', 'distance', 'zone 2'],
    href: '/progress/cardio',
  },
  {
    id: 's_bodyfat',
    kind: 'screen',
    title: 'Body composition',
    keywords: ['body fat', 'bodyfat', 'lean mass', 'fat mass', 'navy', 'composition', 'recomp'],
    href: '/progress/body-fat',
  },
  {
    id: 's_energy',
    kind: 'screen',
    title: 'Energy balance',
    keywords: ['tdee', 'maintenance', 'calories', 'deficit', 'surplus', 'cut', 'bulk', 'metabolism'],
    href: '/nutrition/energy',
  },
  {
    id: 's_recovery',
    kind: 'screen',
    title: 'Recovery',
    keywords: ['rest', 'sore', 'muscle', 'days since', 'fresh', 'recovered', 'split'],
    href: '/workout/recovery',
  },
  {
    id: 's_readiness',
    kind: 'screen',
    title: 'Readiness',
    keywords: ['recovery score', 'ready', 'fatigue', 'sleep', 'deload', 'fresh', 'tired'],
    href: '/readiness',
  },
  {
    id: 's_timing',
    kind: 'screen',
    title: 'Meal timing',
    keywords: ['eating window', 'fasting', 'intermittent', 'overnight', 'protein spread', 'when to eat'],
    href: '/nutrition/timing',
  },
  {
    id: 's_health',
    kind: 'screen',
    title: 'Health monitor',
    keywords: ['hrv', 'resting heart rate', 'rhr', 'respiratory', 'temperature', 'blood oxygen', 'spo2', 'vitals', 'baseline'],
    href: '/health',
  },
  {
    id: 's_scores',
    kind: 'screen',
    title: 'Today — your scores',
    keywords: ['strain', 'sleep score', 'recovery score', 'nutrition score', 'energy bank', 'cardio load', 'target strain'],
    href: '/scores',
  },
  {
    id: 's_bioage',
    kind: 'screen',
    title: 'Fitness age',
    keywords: ['biological age', 'bio age', 'vo2 max', 'age', 'biomarkers', 'projection'],
    href: '/bio-age',
  },
  {
    id: 's_journal',
    kind: 'screen',
    title: 'Journal',
    keywords: ['habits', 'alcohol', 'mood', 'stress', 'soreness', 'daylight', 'correlations', 'patterns'],
    href: '/journal',
  },
  {
    id: 's_diag',
    kind: 'screen',
    title: 'Integration diagnostics',
    keywords: ['strava', 'apple health', 'healthkit', 'apple watch', 'connect', 'not working', 'debug', 'redirect uri'],
    href: '/settings/diagnostics',
  },
  { id: 's_board', kind: 'screen', title: 'Leaderboard', keywords: ['rank', 'forge score', 'friends'], href: '/leaderboard' },
  { id: 's_remind', kind: 'screen', title: 'Reminders', keywords: ['notifications', 'alerts'], href: '/reminders' },
  { id: 's_1rm', kind: 'screen', title: 'One-rep max calculator', keywords: ['1rm', 'estimate', 'max'], href: '/tools/one-rep-max' },
  { id: 's_plates', kind: 'screen', title: 'Plate calculator', keywords: ['barbell', 'loading', 'plates'], href: '/tools/plates' },
  { id: 's_warmup', kind: 'screen', title: 'Warm-up builder', keywords: ['ramp', 'sets'], href: '/tools/warmup' },
  { id: 's_interval', kind: 'screen', title: 'Interval timer', keywords: ['tabata', 'emom', 'circuit', 'hiit', 'conditioning', 'stopwatch'], href: '/tools/interval' },
  { id: 's_goals', kind: 'screen', title: 'Goals & targets', keywords: ['macros', 'calories', 'steps'], href: '/settings/goals' },
  { id: 's_settings', kind: 'screen', title: 'Settings', keywords: ['account', 'preferences', 'units'], href: '/settings' },
  { id: 's_privacy', kind: 'screen', title: 'Privacy & data', keywords: ['export', 'delete account', 'gdpr'], href: '/settings/privacy' },
  { id: 's_sub', kind: 'screen', title: 'Subscription', keywords: ['pro', 'billing', 'plan'], href: '/settings/subscription' },
  { id: 's_integr', kind: 'screen', title: 'Integrations', keywords: ['apple health', 'watch', 'strava'], href: '/settings/integrations' },
  { id: 's_proto', kind: 'screen', title: 'Protocol tracker', keywords: ['peptides', 'doses', 'log'], href: '/protocol' },
  { id: 's_gyms', kind: 'screen', title: 'Iron Map', keywords: ['gyms', 'map', 'near me', 'collect', 'claim'], href: '/gyms' },
  { id: 's_coll', kind: 'screen', title: 'Gym collection', keywords: ['claimed', 'explorer', 'tier', 'points'], href: '/gyms/collection' },
];

const KIND_ICON: Record<SearchKind, 'dumbbell' | 'nutrition' | 'list' | 'chevron_right' | 'document'> = {
  exercise: 'dumbbell',
  food: 'nutrition',
  routine: 'list',
  screen: 'chevron_right',
  protocol: 'document',
};

export default function Search() {
  const [query, setQuery] = useState('');
  const routines = useRoutineStore((s) => s.routines);
  const protocols = useProtocolStore((s) => s.protocols);
  const customExercises = useWorkoutStore((s) => s.customExercises);

  // The searchable index. Everything is already in memory, so this is a shape
  // change rather than a fetch — no debounce, no spinner, no empty flash.
  const entries = useMemo<SearchEntry[]>(() => {
    const exercises: SearchEntry[] = [...customExercises, ...EXERCISE_LIBRARY].map((e) => ({
      id: `ex_${e.id}`,
      kind: 'exercise',
      title: e.name,
      subtitle: `${label(e.primaryMuscle)} · ${label(e.equipment)}`,
      keywords: e.secondaryMuscles.map(label),
      href: `/exercise/${e.id}`,
    }));
    const foods: SearchEntry[] = FOOD_DB.map((f) => ({
      id: `fd_${f.id}`,
      kind: 'food',
      title: f.name,
      subtitle: `${groupThousands(f.calories)} kcal · ${f.servingLabel}`,
      href: `/nutrition/add?foodId=${f.id}`,
    }));
    const rts: SearchEntry[] = routines.map((r) => ({
      id: `rt_${r.id}`,
      kind: 'routine',
      title: r.name,
      subtitle: `${r.exercises.length} exercises`,
      keywords: r.exercises.map((e) => e.name),
      href: '/workout/routines',
    }));
    const protos: SearchEntry[] = protocols.map((p) => ({
      id: `pr_${p.id}`,
      kind: 'protocol',
      title: p.name,
      subtitle: 'Protocol',
      href: `/protocol/${p.id}`,
    }));
    return [...SCREENS, ...rts, ...exercises, ...protos, ...foods];
  }, [routines, protocols, customExercises]);

  const groups = useMemo(() => groupHits(searchEntries(query, entries, 40)), [query, entries]);
  const total = groups.reduce((a, g) => a + g.hits.length, 0);

  return (
    <Screen gradient>
      <ScreenHeader title="Search" />

      <View style={styles.field}>
        <Icon name="search" size={17} color={colors.textFaint} strokeWidth={1.8} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Lifts, foods, routines, screens…"
          placeholderTextColor={colors.textFaint}
          autoFocus
          autoCorrect={false}
          accessibilityLabel="Search the app"
          selectionColor={colors.primary}
          style={[styles.input, noOutline]}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
            <Icon name="close" size={15} color={colors.textFaint} strokeWidth={1.8} />
          </Pressable>
        )}
      </View>

      {query.trim().length === 0 ? (
        <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
          <Text variant="overline" color={colors.textFaint}>TRY</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {['bench', 'chest', 'export', 'chicken', 'plate calculator', 'apple health'].map((q) => (
              <Pressable
                key={q}
                onPress={() => setQuery(q)}
                accessibilityRole="button"
                accessibilityLabel={`Search for ${q}`}
                style={styles.suggestion}
              >
                <Text variant="caption" color={colors.textDim}>{q}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : total === 0 ? (
        <EmptyState icon="search" title="Nothing matched" subtitle={`No lifts, foods, routines or screens for "${query.trim()}".`} />
      ) : (
        <View style={{ gap: spacing.lg, marginTop: spacing.md }}>
          {groups.map((group) => (
            <View key={group.kind} style={{ gap: spacing.sm }}>
              <Text variant="overline" color={colors.textFaint}>
                {KIND_LABEL[group.kind]} · {group.hits.length}
              </Text>
              <Card style={{ paddingVertical: spacing.xs }}>
                {group.hits.map((hit, i) => (
                  <Pressable
                    key={hit.id}
                    onPress={() => router.push(hit.href as never)}
                    accessibilityRole="link"
                    accessibilityLabel={hit.subtitle ? `${hit.title}, ${hit.subtitle}` : hit.title}
                    style={[styles.row, i > 0 && styles.rowDivider]}
                  >
                    {hit.kind === 'exercise' ? (
                      <MuscleThumb muscle={muscleOf(hit.subtitle)} size={26} />
                    ) : (
                      <View style={styles.kindDot}>
                        <Icon name={KIND_ICON[hit.kind]} size={14} color={colors.textFaint} strokeWidth={1.8} />
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="body" numberOfLines={1}>{hit.title}</Text>
                      {hit.subtitle && (
                        <Text variant="caption" color={colors.textFaint} numberOfLines={1}>{hit.subtitle}</Text>
                      )}
                    </View>
                    <Icon name="chevron_right" size={15} color={colors.textFaint} strokeWidth={1.8} />
                  </Pressable>
                ))}
              </Card>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const label = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** The subtitle leads with the primary muscle, which is all the thumb needs. */
const muscleOf = (subtitle?: string) =>
  (subtitle ?? '').split(' · ')[0].toLowerCase().replace(/ /g, '_') as never;

const styles = {
  field: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  // A web TextInput carries an intrinsic min width from its size attribute, so
  // flex:1 alone cannot shrink it and the clear button gets pushed off the row.
  input: { flex: 1, minWidth: 0, color: colors.text, fontSize: 15, height: '100%' as const },
  suggestion: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    minHeight: 48,
  },
  rowDivider: { borderTopWidth: 0.5, borderTopColor: colors.border },
  kindDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.surface,
  },
};

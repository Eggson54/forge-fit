import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Button, Card, Text } from '../../src/components/ui';
import { Icon } from '../../src/components/Icon';
import { MuscleThumb } from '../../src/components/body/MuscleThumb';
import { PrBanner } from '../../src/components/PrBanner';
import { colors, domainAccent, noOutline, radius, spacing } from '../../src/theme';
import { formatDuration } from '../../src/domain/date';
import { workoutStats } from '../../src/domain/strength';
import { displayVolume, displayWeight, kgToLb, round, toKg } from '../../src/domain/units';
import type { ExerciseTracking, SetEntry, Workout, WorkoutExercise } from '../../src/domain/types';
import { SET_KIND_LABEL, SET_KIND_MARK, isWarmupSet, nextSetKind, setKind } from '../../src/domain/sets';
import { amountLabel, loadLabel, trackingFor } from '../../src/domain/tracking';
import { exerciseById } from '../../src/data/exercises';
import { SUPERSET_TRANSITION_SECONDS, groupExercises, restAfterSet, supersetLabel, type ExerciseGroup } from '../../src/domain/superset';
import { warmupPlan } from '../../src/domain/warmup';
import { barsAt, platesAt } from '../../src/domain/gymKit';
import { useWorkoutStore } from '../../src/stores/useWorkoutStore';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { useGamificationStore } from '../../src/stores/useGamificationStore';
import { currentAchievementInputs } from '../../src/stores/achievementInputs';
import { useProgramStore } from '../../src/stores/useProgramStore';
import { useGymStore } from '../../src/stores/useGymStore';
import { useRestStore } from '../../src/stores/useRestStore';
import { claimableNow } from '../../src/domain/gyms';
import { programById } from '../../src/data/programs';

export default function ActiveWorkout() {
  const insets = useSafeAreaInsets();
  const active = useWorkoutStore((s) => s.workouts.find((w) => w.id === s.activeId) ?? null);
  const finishActive = useWorkoutStore((s) => s.finishActive);
  const discardActive = useWorkoutStore((s) => s.discardActive);

  const units = useProfileStore((s) => s.profile.units);
  const bodyweightKg = useProfileStore((s) => s.profile.weightKg ?? null);

  const [elapsed, setElapsed] = useState(0);
  const [pr, setPr] = useState<{ name: string; kg: number; id: number } | null>(null);

  useEffect(() => {
    if (!active) return;
    const started = active.startedAt ? Date.parse(active.startedAt) : Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.startedAt]);

  const stats = useMemo(() => (active ? workoutStats(active, bodyweightKg) : null), [active, bodyweightKg]);
  const groups = useMemo(() => groupExercises(active?.exercises ?? []), [active?.exercises]);

  if (!active) {
    return (
      <View style={[styles.root, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <Text variant="title">No active workout</Text>
        <Button title="Back" variant="ghost" fullWidth={false} onPress={() => router.replace('/(tabs)/workout')} style={{ marginTop: spacing.lg }} />
      </View>
    );
  }

  const onFinish = () => {
    const totalSets = active.exercises.reduce((a, e) => a + e.sets.filter((s) => s.completed).length, 0);
    if (totalSets === 0) {
      Alert.alert('No sets logged', 'Complete at least one set, or discard this workout.');
      return;
    }
    // Attach the venue if the phone is standing in one. Only a gym already
    // claimed counts: silently recording an unclaimed address the user never
    // acknowledged would be collecting a place history they did not ask for.
    const gymState = useGymStore.getState();
    const here = claimableNow(
      gymState.gyms.filter((g) => gymState.claimedIds().has(g.id)),
      gymState.fix,
    );
    const done = finishActive(here ? { id: here.id, name: here.name } : undefined);
    // The rest timer outlives the screen now, so the session ending has to take
    // it down — a countdown floating over the summary belongs to nothing.
    useRestStore.getState().dismiss();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // A session started from the plan advances it. Matching on the generated
    // name keeps the plan out of the workout model — a workout is a workout
    // whether or not a plan asked for it.
    const programState = useProgramStore.getState();
    const program = programState.enrolment ? programById(programState.enrolment.programId) : null;
    if (done && program && done.name.startsWith(`${program.name} · `)) programState.markSessionDone(done.date);
    // Achievement sync
    const g = useGamificationStore.getState();
    g.syncAchievements(currentAchievementInputs());
    router.replace({ pathname: '/workout/[id]', params: { id: done?.id ?? '' } });
  };

  const onDiscard = () => {
    Alert.alert('Discard workout?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => { discardActive(); useRestStore.getState().dismiss(); router.replace('/(tabs)/workout'); } },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/(tabs)/workout')} hitSlop={10}>
          <Text variant="label" color={colors.textDim}>
            Minimize
          </Text>
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text variant="metric">{formatDuration(elapsed)}</Text>
          <Text variant="caption" color={colors.textDim}>
            {stats?.totalVolumeKg ? `${displayVolume(stats.totalVolumeKg, units).value} vol` : 'elapsed'}
          </Text>
        </View>
        <Pressable onPress={onDiscard} hitSlop={10}>
          <Text variant="label" color={colors.danger}>
            Discard
          </Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxxl }} keyboardShouldPersistTaps="handled">
        <Text variant="h2" style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
          {active.name}
        </Text>
        {groups.map((group, gi) => (
          <ExerciseGroupBlock
            key={group.items[0]!.id}
            group={group}
            isLast={gi === groups.length - 1}
            onRest={(sec, label) => useRestStore.getState().start(sec, label)}
            onPr={(name, kg) => setPr({ name, kg, id: Date.now() })}
          />
        ))}
        {active.exercises.length === 0 && (
          <Text variant="body" color={colors.textDim} center style={{ paddingHorizontal: spacing.xl, paddingVertical: spacing.xl }}>
            Add your first exercise to start logging sets.
          </Text>
        )}
        <View style={{ padding: spacing.xl, gap: spacing.md }}>
          <Button title="Add Exercise" variant="secondary" icon={<Icon name="plus" size={18} color={colors.text} />} onPress={() => router.push('/workout/library?select=1')} />
          {active.exercises.length > 0 && (
            <>
              <GymPicker workout={active} />
              <SessionNote workout={active} />
            </>
          )}
          {active.exercises.length > 0 && (
            <Text variant="caption" color={colors.textFaint} center>
              Tap a set number to mark it <Text variant="caption" color={colors.amber}>W</Text>arm-up,{' '}
              <Text variant="caption" color={colors.info}>D</Text>rop or to{' '}
              <Text variant="caption" color={colors.danger}>F</Text>ailure. Long-press the tick to delete a set.
            </Text>
          )}
        </View>
      </ScrollView>

      {pr && (
        <PrBanner
          key={pr.id}
          exerciseName={pr.name}
          value={displayWeight(pr.kg, units).value}
          unit={displayWeight(pr.kg, units).unit}
          onDone={() => setPr(null)}
        />
      )}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
        <Button title="Finish Workout" onPress={onFinish} size="lg" />
      </View>
    </View>
  );
}

/**
 * Where this session is happening.
 *
 * Finishing a workout tags it automatically when the phone is standing in a
 * claimed gym, but that needs location on AND that gym already claimed. Most
 * sessions will meet neither, so the venue is settable by hand from the gyms
 * already in the collection — otherwise the feature looks dead to everyone who
 * has not turned the map on.
 */
function GymPicker({ workout }: { workout: Workout }) {
  const setGym = useWorkoutStore((s) => s.setWorkoutGym);
  const claims = useGymStore((s) => s.claims);
  const byId = useGymStore((s) => s.gymsById());
  const [open, setOpen] = useState(false);

  const options = claims.map((c) => byId[c.gymId]).filter((g): g is NonNullable<typeof g> => !!g);
  if (options.length === 0 && !workout.gym) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={
          workout.gym ? `Training at ${workout.gym.name}. Tap to change.` : 'Set where you are training'
        }
        style={styles.noteOpen}
      >
        <Icon name="map" size={14} color={workout.gym ? domainAccent.gyms : colors.textFaint} strokeWidth={1.8} />
        <Text variant="caption" color={workout.gym ? domainAccent.gyms : colors.textFaint}>
          {workout.gym ? workout.gym.name : 'Where are you training?'}
        </Text>
      </Pressable>

      {open && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {options.map((g) => {
            const chosen = workout.gym?.id === g.id;
            return (
              <Pressable
                key={g.id}
                onPress={() => {
                  setGym(chosen ? null : { id: g.id, name: g.name });
                  setOpen(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: chosen }}
                accessibilityLabel={g.name}
                style={[styles.gymChip, chosen && styles.gymChipOn]}
              >
                <Text variant="caption" color={chosen ? colors.bg : colors.textDim}>
                  {g.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

/**
 * How the session as a whole went. Per-exercise notes cover a cue or a tweak;
 * this is for the things that belong to the day — slept badly, gym was packed,
 * everything felt heavy.
 */
function SessionNote({ workout }: { workout: Workout }) {
  const setNote = useWorkoutStore((s) => s.setWorkoutNote);
  const [open, setOpen] = useState(workout.notes != null);

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} style={styles.noteOpen} hitSlop={6} accessibilityRole="button">
        <Icon name="document" size={14} color={colors.textFaint} strokeWidth={1.8} />
        <Text variant="caption" color={colors.textFaint}>
          How did the session go?
        </Text>
      </Pressable>
    );
  }
  return (
    <TextInput
      value={workout.notes ?? ''}
      onChangeText={setNote}
      placeholder="Slept badly, gym was packed, everything felt heavy…"
      placeholderTextColor={colors.textFaint}
      multiline
      style={[styles.note, noOutline]}
      selectionColor={colors.primary}
    />
  );
}

/**
 * One superset, or a single exercise. The rail and the A/B letters are what
 * tell you at a glance that two cards are trained together rather than in
 * sequence — the rest behaviour differs, so the grouping has to be visible.
 */
function ExerciseGroupBlock({
  group,
  isLast,
  onRest,
  onPr,
}: {
  group: ExerciseGroup<WorkoutExercise>;
  isLast: boolean;
  onRest: (seconds: number, label: string) => void;
  onPr: (name: string, e1RMKg: number) => void;
}) {
  const toggleSuperset = useWorkoutStore((s) => s.toggleSupersetWithNext);
  const isSuperset = group.items.length > 1;

  return (
    <View style={isSuperset ? styles.group : undefined}>
      {isSuperset && (
        <View style={styles.groupHeader}>
          <View style={styles.groupBadge}>
            <Icon name="repeat" size={12} color={colors.onPrimary} strokeWidth={2.4} />
            <Text variant="overline" color={colors.onPrimary}>
              Superset
            </Text>
          </View>
          <Text variant="caption" color={colors.textFaint}>
            {SUPERSET_TRANSITION_SECONDS}s between · full rest after {supersetLabel(group.items.length - 1)}
          </Text>
        </View>
      )}

      {group.items.map((ex, i) => (
        <View key={ex.id}>
          <ExerciseBlock
            exercise={ex}
            letter={isSuperset ? supersetLabel(i) : null}
            onRest={(seconds, label) => onRest(restAfterSet(group, i, seconds), label)}
            onPr={onPr}
          />
          {/* Sits in the gap between two cards, where the link it makes is. */}
          {(i < group.items.length - 1 || !isLast) && (
            <Pressable
              onPress={() => toggleSuperset(ex.id)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={
                i < group.items.length - 1 ? 'Break this superset here' : 'Superset with the next exercise'
              }
              style={styles.linkButton}
            >
              <Icon
                name={i < group.items.length - 1 ? 'link_off' : 'repeat'}
                size={13}
                color={colors.textFaint}
                strokeWidth={1.9}
              />
              <Text variant="caption" color={colors.textFaint}>
                {i < group.items.length - 1 ? 'Unlink' : 'Superset with next'}
              </Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

const REST_CHOICES = [45, 60, 90, 120, 150, 180, 240];

/** 150 → "2:30", 60 → "1:00", 45 → "45s". */
function formatRest(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function ExerciseBlock({
  exercise,
  letter,
  onRest,
  onPr,
}: {
  exercise: WorkoutExercise;
  letter: string | null;
  onRest: (seconds: number, label: string) => void;
  onPr: (name: string, e1RMKg: number) => void;
}) {
  // Read from the store rather than threaded down: this block already pulls
  // everything else it needs from there, and the group in between has no
  // business carrying a gym id.
  const workoutGymId = useWorkoutStore((s) => s.activeWorkout()?.gym?.id ?? null);
  const addWarmupSets = useWorkoutStore((s) => s.addWarmupSets);
  const gymKit = useGymStore((s) => s.kitFor(workoutGymId));
  const profilePlates = useProfileStore((s) => s.profile.availablePlates);
  const experience = useProfileStore((s) => s.profile.experience);
  const units = useProfileStore((s) => s.profile.units);
  const previousFor = useWorkoutStore((s) => s.previousFor);
  const recommendationFor = useWorkoutStore((s) => s.recommendationFor);
  const addSet = useWorkoutStore((s) => s.addSet);
  const removeExercise = useWorkoutStore((s) => s.removeExercise);
  const setNote = useWorkoutStore((s) => s.setExerciseNote);
  const setRest = useWorkoutStore((s) => s.setExerciseRest);
  const [noteOpen, setNoteOpen] = useState(exercise.notes != null);
  const [restOpen, setRestOpen] = useState(false);

  // The heaviest weight already typed into this exercise, in display units.
  const heaviestEntered = (() => {
    const kg = Math.max(0, ...exercise.sets.map((set) => set.weightKg ?? 0));
    return kg > 0 ? Math.round(displayWeight(kg, units).value * 10) / 10 : null;
  })();

  const tracking = trackingFor(exerciseById(exercise.exerciseId));

  const addWarmup = () => {
    if (heaviestEntered == null) return;
    const library = exerciseById(exercise.exerciseId);
    const barbell = library?.equipment === 'barbell';
    const bars = barsAt(units, gymKit);
    const plan = warmupPlan({
      workingWeight: heaviestEntered,
      bar: barbell ? (bars[0] ?? 0) : 0,
      unit: units,
      barbell,
      plates: platesAt(units, gymKit, profilePlates),
    });
    if (plan.length === 0) return;
    addWarmupSets(
      exercise.id,
      plan.map((step) => ({ weightKg: toKg(step.loadedWeight, units), reps: step.reps })),
    );
    Haptics.selectionAsync().catch(() => {});
  };
  const prev = previousFor(exercise.exerciseId);
  const rec = recommendationFor(exercise.exerciseId, experience, units);
  const recWeight = rec ? displayWeight(rec.weightKg, units) : null;
  const prevWeight = prev ? displayWeight(prev.weightKg, units) : null;

  return (
    <Card style={{ marginHorizontal: spacing.xl, marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md }}>
        <MuscleThumb muscle={exercise.primaryMuscle} size={30} />
        <View style={{ flex: 1 }}>
          <Text variant="title">
            {letter ? <Text variant="title" color={colors.primary}>{letter} </Text> : null}
            {exercise.name}
          </Text>
          <View style={{ marginTop: 2 }}>
            {prevWeight && (
              <Text variant="caption" color={colors.textDim} numberOfLines={1}>
                Prev: {round(prevWeight.value, 1)} {prevWeight.unit} × {prev!.reps}
              </Text>
            )}
            {recWeight && (
              <Text variant="caption" color={colors.primary} numberOfLines={1}>
                Target: {round(recWeight.value, 1)} {recWeight.unit} × {rec!.reps}
              </Text>
            )}
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {/* Straight to the plate maths for the weight already entered, which is
              the question being asked at the rack anyway. */}
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/tools/plates',
                params: {
                  ...(heaviestEntered ? { target: String(heaviestEntered) } : null),
                  // So the maths uses the plates at the gym you are standing in.
                  ...(workoutGymId ? { gymId: workoutGymId } : null),
                },
              })
            }
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Plate calculator"
            style={styles.removeExercise}
          >
            <Icon name="sliders" size={16} color={colors.textFaint} strokeWidth={1.8} />
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/workout/swap', params: { weId: exercise.id } })}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Swap ${exercise.name} for something else`}
            style={styles.removeExercise}
          >
            <Icon name="repeat" size={16} color={colors.textFaint} strokeWidth={1.8} />
          </Pressable>
          <Pressable
            onPress={() => removeExercise(exercise.id)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${exercise.name}`}
            style={styles.removeExercise}
          >
            <Icon name="trash" size={16} color={colors.textFaint} strokeWidth={1.8} />
          </Pressable>
        </View>
      </View>

      {/* Rest is set once at generation time from the exercise category, which is
          a fair default and a poor rule — how long you need between sets depends
          on the load and on the queue for the rack. */}
      <Pressable
        onPress={() => setRestOpen((v) => !v)}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Rest between sets: ${formatRest(exercise.restSeconds)}. Tap to change.`}
        style={styles.restPill}
      >
        <Icon name="clock" size={13} color={colors.textFaint} strokeWidth={1.8} />
        <Text variant="caption" color={restOpen ? colors.primary : colors.textDim}>
          {formatRest(exercise.restSeconds)} rest
        </Text>
      </Pressable>

      {restOpen && (
        <View style={styles.restChoices}>
          {REST_CHOICES.map((sec) => {
            const active = exercise.restSeconds === sec;
            return (
              <Pressable
                key={sec}
                onPress={() => setRest(exercise.id, sec)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Rest ${formatRest(sec)}`}
                style={[styles.restChoice, active && styles.restChoiceOn]}
              >
                <Text variant="caption" color={active ? colors.bg : colors.textDim}>
                  {formatRest(sec)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* column header */}
      <View style={[styles.setRow, { marginTop: spacing.md }]}>
        <Text variant="caption" color={colors.textFaint} style={{ width: 28 }}>SET</Text>
        <Text variant="caption" color={colors.textFaint} style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
          {loadLabel(tracking, units === 'imperial' ? 'LB' : 'KG') ?? ''}
        </Text>
        <Text variant="caption" color={colors.textFaint} style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>{amountLabel(tracking)}</Text>
        <Text variant="caption" color={colors.textFaint} style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>RPE</Text>
        <View style={{ width: 36 }} />
      </View>

      {exercise.sets.map((set, i) => (
        <SetRow
          key={set.id}
          weId={exercise.id}
          exerciseName={exercise.name}
          tracking={tracking}
          set={set}
          index={i + 1}
          units={units}
          restSeconds={exercise.restSeconds}
          onRest={onRest}
          onPr={onPr}
        />
      ))}

      {noteOpen ? (
        <TextInput
          value={exercise.notes ?? ''}
          onChangeText={(t) => setNote(exercise.id, t)}
          accessibilityLabel={`Note on ${exercise.name}`}
          placeholder="Cue, tweak, how it felt…"
          placeholderTextColor={colors.textFaint}
          multiline
          style={[styles.note, noOutline]}
          selectionColor={colors.primary}
        />
      ) : (
        <Pressable onPress={() => setNoteOpen(true)} style={styles.noteOpen} hitSlop={6}>
          <Icon name="document" size={14} color={colors.textFaint} strokeWidth={1.8} />
          <Text variant="caption" color={colors.textFaint}>Add a note</Text>
        </Pressable>
      )}

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Pressable onPress={() => addSet(exercise.id)} style={[styles.addSet, { flex: 1 }]}>
          <Icon name="plus" size={16} color={colors.primary} />
          <Text variant="label" color={colors.primary}>Add set</Text>
        </Pressable>
        {/* The warm-up tool could always build a ramp; it could never put one
            in the session. Writing it here is the whole point of having it. */}
        {heaviestEntered != null && tracking !== 'duration' && (
          <Pressable
            onPress={addWarmup}
            style={[styles.addSet, { flex: 1 }]}
            accessibilityRole="button"
            accessibilityLabel={`Add warm-up sets ramping to ${heaviestEntered}`}
          >
            <Icon name="chart" size={15} color={colors.textDim} strokeWidth={1.9} />
            <Text variant="label" color={colors.textDim}>Warm-up</Text>
          </Pressable>
        )}
      </View>
    </Card>
  );
}

function SetRow({
  weId,
  exerciseName,
  tracking,
  set,
  index,
  units,
  restSeconds,
  onRest,
  onPr,
}: {
  weId: string;
  exerciseName: string;
  tracking: ExerciseTracking;
  set: SetEntry;
  index: number;
  units: 'imperial' | 'metric';
  restSeconds: number;
  onRest: (seconds: number, label: string) => void;
  onPr: (name: string, e1RMKg: number) => void;
}) {
  const updateSet = useWorkoutStore((s) => s.updateSet);
  const removeSet = useWorkoutStore((s) => s.removeSet);
  const toggle = useWorkoutStore((s) => s.toggleSetComplete);
  const cycleKind = useWorkoutStore((s) => s.cycleSetKind);

  const [weight, setWeight] = useState(set.weightKg != null ? String(round(units === 'imperial' ? kgToLb(set.weightKg) : set.weightKg, 1)) : '');
  const [reps, setReps] = useState(set.reps != null ? String(set.reps) : '');
  const [rpe, setRpe] = useState(set.rpe != null ? String(set.rpe) : '');
  const [seconds, setSeconds] = useState(set.seconds != null ? String(set.seconds) : '');

  const kind = setKind(set);
  const mark = SET_KIND_MARK[kind];

  const commitWeight = (t: string) => {
    setWeight(t);
    const num = parseFloat(t);
    updateSet(weId, set.id, { weightKg: isNaN(num) ? null : round(toKg(num, units), 2) });
  };
  const commitReps = (t: string) => {
    setReps(t);
    const num = parseInt(t, 10);
    updateSet(weId, set.id, { reps: isNaN(num) ? null : num });
  };
  const commitSeconds = (t: string) => {
    setSeconds(t);
    // Accept "90" or "1:30"; a hold is spoken either way.
    const parts = t.split(':');
    const value =
      parts.length === 2
        ? (parseInt(parts[0]!, 10) || 0) * 60 + (parseInt(parts[1]!, 10) || 0)
        : parseInt(t, 10);
    updateSet(weId, set.id, { seconds: isNaN(value) ? null : Math.max(0, value) });
  };

  const commitRpe = (t: string) => {
    setRpe(t);
    const num = parseFloat(t);
    updateSet(weId, set.id, { rpe: isNaN(num) ? null : Math.min(10, num) });
  };

  const onToggle = () => {
    const wasComplete = set.completed;
    const newPr = toggle(weId, set.id);
    if (newPr) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onPr(newPr.exerciseName, newPr.e1RMKg);
    } else {
      Haptics.selectionAsync().catch(() => {});
    }
    // A warm-up doesn't earn a full working rest; capping it keeps the timer
    // from sitting on screen through the whole ramp.
    if (!wasComplete) {
      onRest(isWarmupSet(set) ? Math.min(restSeconds, 60) : restSeconds, `Set ${index} · ${exerciseName}`);
    }
  };

  return (
    <View style={[styles.setRow, set.completed && { backgroundColor: 'rgba(61,220,132,0.06)', borderRadius: radius.sm }]}>
      <Pressable
        onPress={() => cycleKind(weId, set.id)}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`${SET_KIND_LABEL[kind]} — tap for ${SET_KIND_LABEL[nextSetKind(set)].toLowerCase()}`}
        style={{ width: 28 }}
      >
        <Text variant="bodyStrong" color={set.isPr ? colors.amber : mark ? KIND_COLOR[kind] : colors.text} center>
          {set.isPr ? '★' : (mark ?? index)}
        </Text>
      </Pressable>
      {tracking === 'duration' ? (
        // A hold carries no external load, so the column is left empty rather
        // than offering a number that means nothing.
        <View style={{ flex: 1, minWidth: 0 }} />
      ) : (
        <Cell
          value={weight}
          onChange={commitWeight}
          placeholder={tracking === 'bodyweight' ? '+0' : '0'}
          label={
            tracking === 'bodyweight'
              ? `Added weight in ${units === 'imperial' ? 'pounds' : 'kilos'}, set ${index}`
              : `Weight in ${units === 'imperial' ? 'pounds' : 'kilos'}, set ${index}`
          }
        />
      )}
      {tracking === 'duration' ? (
        <Cell
          value={seconds}
          onChange={commitSeconds}
          placeholder="0:45"
          label={`Time, set ${index}`}
          keyboard="numbers-and-punctuation"
        />
      ) : (
        <Cell value={reps} onChange={commitReps} placeholder="0" label={`Reps, set ${index}`} />
      )}
      <Cell value={rpe} onChange={commitRpe} placeholder="-" label={`Rate of perceived exertion, set ${index}`} />
      {/* The most-tapped control in the app, and it was the one a screen
          reader could say least about. */}
      <Pressable
        onPress={onToggle}
        onLongPress={() => removeSet(weId, set.id)}
        hitSlop={6}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: set.completed }}
        accessibilityLabel={`${exerciseName}, set ${index}`}
        accessibilityHint="Double tap to mark complete. Long press to delete this set."
        style={[styles.check, set.completed && styles.checkOn]}
      >
        {set.completed ? <Icon name="check" size={16} color="#0B0B0F" strokeWidth={2.6} /> : <View style={styles.checkDot} />}
      </Pressable>
    </View>
  );
}

function Cell({
  value,
  onChange,
  placeholder,
  label,
  keyboard = 'decimal-pad',
}: {
  value: string;
  onChange: (t: string) => void;
  placeholder: string;
  /** Which column this is — the grid's header row is not read with the field. */
  label: string;
  keyboard?: 'decimal-pad' | 'numbers-and-punctuation';
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      keyboardType={keyboard}
      placeholder={placeholder}
      placeholderTextColor={colors.textFaint}
      accessibilityLabel={label}
      style={[styles.cell, noOutline]}
      selectionColor={colors.primary}
    />
  );
}

const KIND_COLOR: Record<string, string> = {
  working: colors.text,
  warmup: colors.amber,
  drop: colors.info,
  failure: colors.danger,
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  footer: { padding: spacing.xl, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.sm },
  // minWidth 0 matters: a web TextInput carries an intrinsic min-content width
  // from its `size` attribute, which stops flex from shrinking the cells and
  // pushes RPE and the complete toggle off the row.
  cell: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: 2,
  },
  check: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.success },
  checkDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: colors.textFaint },
  removeExercise: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  note: {
    marginTop: spacing.sm,
    padding: spacing.md,
    minHeight: 60,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceHigh,
    color: colors.text,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  group: {
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
    marginLeft: spacing.md,
    marginBottom: spacing.md,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingBottom: spacing.xs,
    flexWrap: 'wrap',
  },
  groupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    marginTop: -spacing.sm,
    marginBottom: spacing.xs,
  },
  noteOpen: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingTop: spacing.sm },
  restPill: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', marginTop: spacing.sm },
  restChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  restChoice: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minWidth: 52,
    alignItems: 'center',
  },
  restChoiceOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  gymChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  gymChipOn: { backgroundColor: domainAccent.gyms, borderColor: domainAccent.gyms },
  addSet: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.md, marginTop: spacing.xs },
});

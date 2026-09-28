import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Chip, Input, LinearProgress, SegmentedControl, Text } from '../src/components/ui';
import { colors, radius, spacing } from '../src/theme';
import { Icon, type IconName } from '../src/components/Icon';
import { AmbientBackdrop } from '../src/components/AmbientBackdrop';
import { DEFAULT_PROFILE, useProfileStore } from '../src/stores/useProfileStore';
import { recommendedTargets } from '../src/domain/nutrition';
import { ftInToCm, groupThousands, round, toKg } from '../src/domain/units';
import { ageProblem, heightProblem, weightProblem } from '../src/domain/bodyInputs';
import type {
  ActivityLevel,
  DietaryPreference,
  Equipment,
  Experience,
  Goal,
  Profile,
  Sex,
  Units,
} from '../src/domain/types';
import { analytics } from '../src/services/analytics';

const GOALS: { value: Goal; label: string; sub: string }[] = [
  { value: 'build_muscle', label: 'Build Muscle', sub: 'Add size and strength' },
  { value: 'lose_fat', label: 'Lose Fat', sub: 'Lean out, keep muscle' },
  { value: 'recomposition', label: 'Recomposition', sub: 'Build + lean at once' },
  { value: 'gain_weight', label: 'Gain Weight', sub: 'Eat to grow' },
  { value: 'maintain', label: 'Maintain', sub: 'Hold your progress' },
  { value: 'athletic_performance', label: 'Athletic Performance', sub: 'Train for capacity' },
];

const ACTIVITY: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Sedentary — desk job, little movement' },
  { value: 'light', label: 'Light — 1-2 workouts/week' },
  { value: 'moderate', label: 'Moderate — 3-4 workouts/week' },
  { value: 'active', label: 'Active — 5-6 workouts/week' },
  { value: 'very_active', label: 'Very active — daily / physical job' },
];

const EQUIPMENT: { value: Equipment; label: string }[] = [
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'dumbbells', label: 'Dumbbells' },
  { value: 'barbell', label: 'Barbell' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'machines', label: 'Machines' },
  { value: 'cables', label: 'Cables' },
  { value: 'bands', label: 'Bands' },
  { value: 'full_gym', label: 'Full Gym' },
];

const DIETS: { value: DietaryPreference; label: string }[] = [
  { value: 'none', label: 'No preference' },
  { value: 'high_protein', label: 'High protein' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'keto', label: 'Keto' },
  { value: 'paleo', label: 'Paleo' },
  { value: 'mediterranean', label: 'Mediterranean' },
  { value: 'pescatarian', label: 'Pescatarian' },
];

const TOTAL_STEPS = 11;

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const completeOnboarding = useProfileStore((s) => s.completeOnboarding);
  const saveDraft = useProfileStore((s) => s.saveOnboardingDraft);
  const clearDraft = useProfileStore((s) => s.clearOnboardingDraft);

  // Eleven steps is a long way to lose to a phone call, so the answers so far
  // are kept and offered back rather than silently restarting at step one.
  // Read once on mount: reading it live would fight the save effect below.
  const saved = useMemo(() => useProfileStore.getState().onboardingDraft, []);
  const [resumeOffered, setResumeOffered] = useState(saved != null && saved.step > 0);

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Profile>({ ...DEFAULT_PROFILE });

  // Height/weight held in display units for editing.
  const [units, setUnits] = useState<Units>('imperial');
  const [heightFt, setHeightFt] = useState('5');
  const [heightIn, setHeightIn] = useState('10');
  const [heightCm, setHeightCm] = useState('178');
  const [weightInput, setWeightInput] = useState('');
  const [targetInput, setTargetInput] = useState('');

  const resume = () => {
    if (!saved) return;
    setDraft(saved.profile);
    setUnits(saved.units);
    setHeightFt(saved.heightFt);
    setHeightIn(saved.heightIn);
    setHeightCm(saved.heightCm);
    setWeightInput(saved.weightInput);
    setTargetInput(saved.targetInput);
    setStep(saved.step);
    setResumeOffered(false);
  };

  const startOver = () => {
    clearDraft();
    setResumeOffered(false);
  };

  // Persist on every change, so a force-quit loses at most the current keystroke.
  React.useEffect(() => {
    if (resumeOffered) return;
    saveDraft({ step, profile: draft, units, heightFt, heightIn, heightCm, weightInput, targetInput });
  }, [resumeOffered, step, draft, units, heightFt, heightIn, heightCm, weightInput, targetInput, saveDraft]);

  const set = (patch: Partial<Profile>) => setDraft((d) => ({ ...d, ...patch }));

  React.useEffect(() => {
    if (step === 0) analytics.track('onboarding_started');
  }, [step]);

  const commitHeight = () => {
    const cm = units === 'imperial' ? ftInToCm(Number(heightFt) || 0, Number(heightIn) || 0) : Number(heightCm) || 0;
    set({ heightCm: round(cm) });
  };
  const commitWeight = () => {
    if (weightInput) set({ weightKg: round(toKg(Number(weightInput), units), 1) });
  };
  const commitTarget = () => {
    if (targetInput) set({ targetWeightKg: round(toKg(Number(targetInput), units), 1) });
  };

  const previewTargets = useMemo(() => recommendedTargets({ ...draft, units }), [draft, units]);

  const next = () => {
    if (step === 2) {
      commitHeight();
      commitWeight();
    }
    if (step === 4) commitTarget();
    if (step < TOTAL_STEPS - 1) {
      setStep((s) => s + 1);
    } else {
      finish();
    }
  };

  const finish = () => {
    const finalProfile: Profile = { ...draft, units };
    completeOnboarding(finalProfile);
    analytics.track('onboarding_completed', { goal: finalProfile.goal });
    router.replace('/(tabs)/home');
  };

  const toggleEquipment = (e: Equipment) =>
    set({ equipment: draft.equipment.includes(e) ? draft.equipment.filter((x) => x !== e) : [...draft.equipment, e] });
  const toggleDiet = (d: DietaryPreference) =>
    set({ dietaryPreferences: draft.dietaryPreferences.includes(d) ? draft.dietaryPreferences.filter((x) => x !== d) : [...draft.dietaryPreferences.filter((x) => x !== 'none'), d] });

  // Checked live, so the message appears as the typo is made rather than
  // after Continue. Weight stays optional here as it always was; what changed
  // is that a number which cannot be a person no longer goes through.
  const ageIssue = ageProblem(draft.age ? String(draft.age) : '');
  const heightIssue = heightProblem(units === 'imperial' ? { ft: heightFt, inches: heightIn } : { cm: heightCm });
  const weightIssue = weightProblem(weightInput, units, { optional: true });
  const targetIssue = weightProblem(targetInput, units, { optional: true });

  const canNext = (): boolean => {
    switch (step) {
      case 0:
        return draft.name.trim().length > 0;
      case 1:
        return !ageIssue;
      case 2:
        return !heightIssue && !weightIssue;
      case 4:
        return !targetIssue;
      case 9:
        return draft.equipment.length > 0;
      default:
        return true;
    }
  };

  if (resumeOffered && saved) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + spacing.md }}>
        <AmbientBackdrop />
        <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg }}>
          <Icon name="repeat" size={34} color={colors.primary} strokeWidth={1.6} />
          <View style={{ gap: spacing.sm }}>
            <Text variant="display">Pick up where you left off?</Text>
            <Text variant="body" color={colors.textDim}>
              You got to step {saved.step + 1} of {TOTAL_STEPS}
              {saved.profile.name.trim() ? `, ${saved.profile.name.trim()}` : ''}. Everything you answered is still here.
            </Text>
          </View>
          <View style={{ gap: spacing.sm }}>
            <Button title={`Continue from step ${saved.step + 1}`} onPress={resume} />
            <Button title="Start over" variant="ghost" onPress={startOver} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + spacing.md }}>
      <AmbientBackdrop />
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="caption" color={colors.textDim}>
            Step {step + 1} of {TOTAL_STEPS}
          </Text>
          {isOptional(step) && (
            <Text variant="label" color={colors.textDim} onPress={next}>
              Skip
            </Text>
          )}
        </View>
        <LinearProgress progress={(step + 1) / TOTAL_STEPS} />
      </View>

      {/* Centred rather than top-aligned: most steps are one question and two
          controls, and pinned to the top they sat above half a phone screen of
          nothing. flexGrow keeps a long step (equipment, dietary) scrolling
          from its own top, since justifyContent only distributes free space. */}
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl, flexGrow: 1, justifyContent: 'center' }}
        keyboardShouldPersistTaps="handled"
      >
        {step === 0 && (
          <StepShell title="What should we call you?" icon="profile" subtitle="Your coach keeps it personal.">
            <Input label="First name" value={draft.name} onChangeText={(name) => set({ name })} placeholder="Alex" autoFocus />
          </StepShell>
        )}

        {step === 1 && (
          <StepShell title="The basics" icon="scale" subtitle="Used to personalize your targets. Optional.">
            <Text variant="label" color={colors.textDim}>Sex</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {(['male', 'female', 'other', 'prefer_not_say'] as Sex[]).map((s) => (
                <Chip key={s} label={sexLabel(s)} selected={draft.sex === s} onPress={() => set({ sex: s })} />
              ))}
            </View>
            <Input label="Age" value={draft.age ? String(draft.age) : ''} onChangeText={(t) => set({ age: Number(t) || null })} keyboardType="number-pad" placeholder="30" error={ageIssue ?? undefined} />
          </StepShell>
        )}

        {step === 2 && (
          <StepShell title="Height & weight" icon="scale" subtitle="You can change units any time.">
            <SegmentedControl
              options={[
                { label: 'Imperial (lb/ft)', value: 'imperial' },
                { label: 'Metric (kg/cm)', value: 'metric' },
              ]}
              value={units}
              onChange={(u) => setUnits(u as Units)}
            />
            {units === 'imperial' ? (
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Input label="Height (ft)" value={heightFt} onChangeText={setHeightFt} keyboardType="number-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <Input label="Height (in)" value={heightIn} onChangeText={setHeightIn} keyboardType="number-pad" />
                </View>
              </View>
            ) : (
              <Input label="Height" value={heightCm} onChangeText={setHeightCm} keyboardType="number-pad" suffix="cm" />
            )}
            {/* Under both boxes rather than on one: in feet and inches the
                mistake is usually in the pair, not in either box alone. */}
            {heightIssue && (
              <Text variant="caption" color={colors.danger}>
                {heightIssue}
              </Text>
            )}
            <Input
              label="Current weight"
              value={weightInput}
              onChangeText={setWeightInput}
              keyboardType="decimal-pad"
              suffix={units === 'imperial' ? 'lb' : 'kg'}
              placeholder={units === 'imperial' ? '175' : '80'}
              error={weightIssue ?? undefined}
            />
          </StepShell>
        )}

        {step === 3 && (
          <StepShell title="What's your goal?" icon="target" subtitle="This shapes your calories, macros and training.">
            <View style={{ gap: spacing.sm }}>
              {GOALS.map((g) => (
                <GoalRow key={g.value} label={g.label} sub={g.sub} selected={draft.goal === g.value} onPress={() => set({ goal: g.value })} />
              ))}
            </View>
          </StepShell>
        )}

        {step === 4 && (
          <StepShell title="Target weight" icon="target" subtitle="Optional — a direction, not a deadline.">
            <Input
              label="Target weight"
              value={targetInput}
              onChangeText={setTargetInput}
              keyboardType="decimal-pad"
              suffix={units === 'imperial' ? 'lb' : 'kg'}
              placeholder={weightInput || (units === 'imperial' ? '165' : '75')}
              error={targetIssue ?? undefined}
            />
          </StepShell>
        )}

        {step === 5 && (
          <StepShell title="How active are you?" icon="steps" subtitle="Outside of training.">
            <View style={{ gap: spacing.sm }}>
              {ACTIVITY.map((a) => (
                <GoalRow key={a.value} label={a.label} selected={draft.activityLevel === a.value} onPress={() => set({ activityLevel: a.value })} />
              ))}
            </View>
          </StepShell>
        )}

        {step === 6 && (
          <StepShell title="Training experience" icon="dumbbell">
            <View style={{ gap: spacing.sm }}>
              {(['beginner', 'intermediate', 'advanced'] as Experience[]).map((e) => (
                <GoalRow key={e} label={cap(e)} selected={draft.experience === e} onPress={() => set({ experience: e })} />
              ))}
            </View>
          </StepShell>
        )}

        {step === 7 && (
          <StepShell title="Weekly commitment" icon="clock">
            <Text variant="label" color={colors.textDim}>Training days per week: {draft.trainingDaysPerWeek}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {[2, 3, 4, 5, 6].map((n) => (
                <Chip key={n} label={`${n} days`} selected={draft.trainingDaysPerWeek === n} onPress={() => set({ trainingDaysPerWeek: n })} />
              ))}
            </View>
            <Text variant="label" color={colors.textDim} style={{ marginTop: spacing.md }}>Preferred session length</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {[30, 45, 60, 75, 90].map((n) => (
                <Chip key={n} label={`${n} min`} selected={draft.preferredWorkoutMinutes === n} onPress={() => set({ preferredWorkoutMinutes: n })} />
              ))}
            </View>
          </StepShell>
        )}

        {step === 8 && (
          <StepShell title="What can you train with?" icon="dumbbell" subtitle="Select all that apply.">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {EQUIPMENT.map((e) => (
                <Chip key={e.value} label={e.label} selected={draft.equipment.includes(e.value)} onPress={() => toggleEquipment(e.value)} />
              ))}
            </View>
          </StepShell>
        )}

        {step === 9 && (
          <StepShell title="Any dietary preferences?" icon="nutrition" subtitle="Optional. Select all that apply.">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {DIETS.map((d) => (
                <Chip key={d.value} label={d.label} selected={draft.dietaryPreferences.includes(d.value)} onPress={() => toggleDiet(d.value)} />
              ))}
            </View>
          </StepShell>
        )}

        {step === 10 && (
          <StepShell title="Your starting targets" icon="trophy" subtitle="Estimates you can fine-tune any time. Not medical advice.">
            <TargetRow label="Daily calories" value={groupThousands(previewTargets.calories)} unit="kcal" />
            <TargetRow label="Protein" value={`${previewTargets.proteinG}`} unit="g" />
            <TargetRow label="Carbs" value={`${previewTargets.carbsG}`} unit="g" />
            <TargetRow label="Fat" value={`${previewTargets.fatG}`} unit="g" />
            <TargetRow label="Water" value={`${previewTargets.waterOz}`} unit="oz" />
            <TargetRow label="Steps" value={`${groupThousands(previewTargets.steps)}`} unit="" />
            <TargetRow label="Sleep" value={`${Math.round(previewTargets.sleepMinutes / 60)}`} unit="hrs" />
          </StepShell>
        )}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: spacing.md, padding: spacing.xl, paddingBottom: insets.bottom + spacing.md }}>
        {step > 0 && <Button title="Back" variant="ghost" fullWidth={false} onPress={() => setStep((s) => s - 1)} style={{ flex: 1 }} />}
        <Button title={step === TOTAL_STEPS - 1 ? "Start training" : 'Continue'} onPress={next} disabled={!canNext()} style={{ flex: 2 }} />
      </View>
    </View>
  );
}

function StepShell({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: IconName;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={styles.medallion}>
        <Icon name={icon} size={28} color={colors.primary} strokeWidth={1.8} />
      </View>
      <View style={{ gap: spacing.xs }}>
        <Text variant="h2">{title}</Text>
        {subtitle && (
          <Text variant="body" color={colors.textDim}>
            {subtitle}
          </Text>
        )}
      </View>
      <View style={{ gap: spacing.md }}>{children}</View>
    </View>
  );
}

function GoalRow({ label, sub, selected, onPress }: { label: string; sub?: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={{
        padding: spacing.lg,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? 'rgba(255,90,31,0.10)' : colors.surface,
        gap: 2,
      }}
    >
      <Text variant="bodyStrong" color={selected ? colors.primary : colors.text}>
        {label}
      </Text>
      {sub && (
        <Text variant="caption" color={colors.textDim}>
          {sub}
        </Text>
      )}
    </Pressable>
  );
}

function TargetRow({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: spacing.sm, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
      <Text variant="body" color={colors.textDim}>
        {label}
      </Text>
      <Text variant="metric">
        {value}
        <Text variant="caption" color={colors.textDim}>
          {' '}
          {unit}
        </Text>
      </Text>
    </View>
  );
}

const isOptional = (step: number) => [1, 4, 9].includes(step);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const sexLabel = (s: Sex) => ({ male: 'Male', female: 'Female', other: 'Other', prefer_not_say: 'Prefer not to say' })[s];

const styles = StyleSheet.create({
  medallion: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,90,31,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,122,61,0.30)',
  },
});

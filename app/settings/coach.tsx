import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Card, Chip, Pill, Screen, SectionHeader, Text, Toggle } from '../../src/components/ui';
import { Icon } from '../../src/components/Icon';
import { router } from 'expo-router';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, spacing } from '../../src/theme';
import type { CoachPersonality } from '../../src/domain/types';
import { isProPersonality } from '../../src/domain/coach';
import { selectCoachMessage } from '../../src/domain/coach';
import { useProfileStore } from '../../src/stores/useProfileStore';

const PERSONAS: { value: CoachPersonality; label: string; blurb: string }[] = [
  { value: 'friendly', label: 'Friendly', blurb: 'Supportive and encouraging.' },
  { value: 'motivational', label: 'Motivational', blurb: 'Fires you up to show up.' },
  { value: 'savage', label: 'Savage', blurb: 'Blunt. Calls out excuses.' },
  { value: 'no_mercy', label: 'No Mercy', blurb: 'Relentless accountability.' },
];

const AGGRESSION = [
  { label: 'Low', value: 25 },
  { label: 'Medium', value: 50 },
  { label: 'High', value: 75 },
  { label: 'Max', value: 100 },
];

/** Snap a stored 0-100 value to the nearest preset band so one always reads as chosen. */
function nearestBand(value: number): number {
  return AGGRESSION.reduce((best, a) => (Math.abs(a.value - value) < Math.abs(best - value) ? a.value : best), AGGRESSION[0]!.value);
}

export default function CoachSettings() {
  const coach = useProfileStore((s) => s.coach);
  const effective = useProfileStore((s) => s.effectiveCoach());
  const isPro = useProfileStore((s) => s.isPro());
  const setCoach = useProfileStore((s) => s.setCoach);
  const [preview, setPreview] = useState('');

  useEffect(() => {
    const msg = selectCoachMessage(
      { disciplineScore: 60, dailyStreak: 3, workoutPlanned: true, workoutCompleted: false, proteinRemainingG: 40, waterRemainingOz: 30, stepsRemaining: 3000, missedWorkoutsThisWeek: 1, timeOfDay: 'evening' },
      coach,
    );
    setPreview(msg.text);
  }, [coach]);

  return (
    <Screen gradient>
      <ScreenHeader title="AI Coach" />

      <Card tone="alt" style={{ marginBottom: spacing.lg }}>
        <Text variant="overline" color={colors.primary}>
          PREVIEW
        </Text>
        <Text variant="h3" style={{ marginTop: 4, lineHeight: 26 }}>
          {coach.enabled ? preview : 'Coach is currently off.'}
        </Text>
      </Card>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">Enable coach</Text>
          <Text variant="caption" color={colors.textDim}>
            Daily messages and accountability nudges.
          </Text>
        </View>
        <Toggle value={coach.enabled} onValueChange={(enabled) => setCoach({ enabled })} />
      </View>

      <SectionHeader title="Personality" />
      <View style={{ gap: spacing.sm }}>
        {PERSONAS.map((p) => {
          const locked = isProPersonality(p.value) && !isPro;
          const selected = effective.personality === p.value;
          return (
            <Card
              key={p.value}
              onPress={() => (locked ? router.push('/paywall') : setCoach({ personality: p.value }))}
              style={{
                borderColor: selected && !locked ? colors.primary : colors.border,
                borderWidth: selected && !locked ? 1 : 0.5,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Text variant="bodyStrong" color={locked ? colors.textDim : selected ? colors.primary : colors.text}>
                      {p.label}
                    </Text>
                    {locked && <Pill label="PRO" color={colors.amber} />}
                  </View>
                  <Text variant="caption" color={colors.textDim}>
                    {p.blurb}
                  </Text>
                </View>
                {/* A locked persona shows the lock, never a selected dot: marking
                    one as both chosen and unavailable reads as a bug. */}
                {locked ? (
                  <Icon name="lock" size={18} color={colors.textFaint} />
                ) : selected ? (
                  <Icon name="check" size={18} color={colors.primary} />
                ) : null}
              </View>
            </Card>
          );
        })}
      </View>

      <SectionHeader title="Aggression" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {AGGRESSION.map((a) => (
          <Chip
            key={a.value}
            label={a.label}
            selected={nearestBand(coach.aggression) === a.value}
            onPress={() => setCoach({ aggression: a.value })}
          />
        ))}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.lg, marginTop: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">Allow aggressive language</Text>
          <Text variant="caption" color={colors.textDim}>
            Off keeps every message supportive, even on Savage/No Mercy. Never any hate, threats, or abuse.
          </Text>
        </View>
        <Toggle value={coach.allowAggressiveLanguage} onValueChange={(v) => setCoach({ allowAggressiveLanguage: v })} />
      </View>
    </Screen>
  );
}

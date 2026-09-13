import React, { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { Card, Chip, Screen, SectionHeader, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, spacing } from '../../src/theme';
import type { CoachPersonality } from '../../src/domain/types';
import { selectCoachMessage } from '../../src/domain/coach';
import { useProfileStore } from '../../src/stores/useProfileStore';

const PERSONAS: { value: CoachPersonality; label: string; blurb: string; pro?: boolean }[] = [
  { value: 'friendly', label: 'Friendly', blurb: 'Supportive and encouraging.' },
  { value: 'motivational', label: 'Motivational', blurb: 'Fires you up to show up.' },
  { value: 'savage', label: 'Savage', blurb: 'Blunt. Calls out excuses.', pro: true },
  { value: 'no_mercy', label: 'No Mercy', blurb: 'Relentless accountability.', pro: true },
];

const AGGRESSION = [
  { label: 'Low', value: 25 },
  { label: 'Medium', value: 50 },
  { label: 'High', value: 75 },
  { label: 'Max', value: 100 },
];

export default function CoachSettings() {
  const coach = useProfileStore((s) => s.coach);
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
        <Switch value={coach.enabled} onValueChange={(enabled) => setCoach({ enabled })} trackColor={{ true: colors.primary, false: colors.surfaceHigh }} thumbColor={colors.text} />
      </View>

      <SectionHeader title="Personality" />
      <View style={{ gap: spacing.sm }}>
        {PERSONAS.map((p) => {
          const locked = p.pro && !isPro;
          const selected = coach.personality === p.value;
          return (
            <Card
              key={p.value}
              onPress={() => !locked && setCoach({ personality: p.value })}
              style={{ borderColor: selected ? colors.primary : colors.border, borderWidth: selected ? 1 : 0.5, opacity: locked ? 0.55 : 1 }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" color={selected ? colors.primary : colors.text}>
                    {p.label} {locked ? '· PRO' : ''}
                  </Text>
                  <Text variant="caption" color={colors.textDim}>
                    {p.blurb}
                  </Text>
                </View>
                {selected && <Text color={colors.primary}>●</Text>}
              </View>
            </Card>
          );
        })}
      </View>

      <SectionHeader title="Aggression" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {AGGRESSION.map((a) => (
          <Chip key={a.value} label={a.label} selected={coach.aggression === a.value} onPress={() => setCoach({ aggression: a.value })} />
        ))}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.lg, marginTop: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">Allow aggressive language</Text>
          <Text variant="caption" color={colors.textDim}>
            Off keeps every message supportive, even on Savage/No Mercy. Never any hate, threats, or abuse.
          </Text>
        </View>
        <Switch value={coach.allowAggressiveLanguage} onValueChange={(v) => setCoach({ allowAggressiveLanguage: v })} trackColor={{ true: colors.primary, false: colors.surfaceHigh }} thumbColor={colors.text} />
      </View>
    </Screen>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Card, Chip, Pill, Screen, Text } from '../src/components/ui';
import { Icon } from '../src/components/Icon';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { colors, spacing } from '../src/theme';
import { useProfileStore } from '../src/stores/useProfileStore';
import { buildCoachContext, useDailySummary } from '../src/stores/useDailySummary';
import { ai } from '../src/services/ai';
import type { CoachSettings } from '../src/domain/types';

interface Turn {
  role: 'coach' | 'you';
  text: string;
}

const PERSONALITY_LABEL: Record<CoachSettings['personality'], string> = {
  friendly: 'Friendly',
  motivational: 'Motivational',
  savage: 'Savage',
  no_mercy: 'No Mercy',
};

const PROMPTS = ['Where am I slacking?', 'Push me right now', "What's my next win?", 'Am I on track?'];

export default function CoachScreen() {
  const settings = useProfileStore((s) => s.effectiveCoach());
  const summary = useDailySummary();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    (async () => {
      const msg = await ai.coachMessage({ context: buildCoachContext(summary), settings });
      setTurns([{ role: 'coach', text: msg.text }]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ask = async (prompt: string) => {
    setBusy(true);
    setTurns((t) => [...t, { role: 'you', text: prompt }]);
    const ctx = buildCoachContext(summary);
    // Bias the context so different prompts steer the deterministic engine.
    const steered =
      prompt.includes('slack')
        ? { ...ctx, proteinRemainingG: Math.max(ctx.proteinRemainingG, 30) }
        : prompt.includes('Push')
          ? { ...ctx, hoursIdleSinceWake: 8 }
          : ctx;
    const msg = await ai.coachMessage({ context: steered, settings });
    setTurns((t) => [...t, { role: 'coach', text: msg.text }]);
    setBusy(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  return (
    <Screen
      scroll={false}
      padded={false}
      footer={
        <View style={{ gap: spacing.md }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.xl }}
          >
            {PROMPTS.map((p) => (
              <Chip key={p} label={p} onPress={() => ask(p)} />
            ))}
          </ScrollView>
          <View style={{ paddingHorizontal: spacing.xl }}>
            <Button title="Get a fresh push" onPress={() => ask('Push me right now')} disabled={busy} />
          </View>
        </View>
      }
    >
      <View style={{ paddingHorizontal: spacing.xl }}>
        <ScreenHeader title="AI Coach" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
          <Pill label={PERSONALITY_LABEL[settings.personality]} color={colors.primary} />
          <Text variant="caption" color={colors.textFaint}>
            Aggression {settings.aggression}%
          </Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'flex-end',
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.xl,
          gap: spacing.md,
        }}
      >
        {turns.map((t, i) => (
          <View key={i} style={{ alignItems: t.role === 'you' ? 'flex-end' : 'flex-start' }}>
            <Card
              tone={t.role === 'you' ? 'high' : 'default'}
              style={{ maxWidth: '86%' }}
            >
              {t.role === 'coach' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Icon name="flame" size={14} color={colors.primary} />
                  <Text variant="overline" color={colors.primary}>
                    COACH
                  </Text>
                </View>
              )}
              <Text variant={t.role === 'coach' ? 'h3' : 'body'} style={t.role === 'coach' ? { lineHeight: 26 } : undefined}>
                {t.text}
              </Text>
            </Card>
          </View>
        ))}
        {busy && (
          <Text variant="caption" color={colors.textFaint}>
            Coach is thinking…
          </Text>
        )}
      </ScrollView>
    </Screen>
  );
}

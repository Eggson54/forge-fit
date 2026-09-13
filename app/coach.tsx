import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Card, Chip, Screen, Text } from '../src/components/ui';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { colors, spacing } from '../src/theme';
import { useProfileStore } from '../src/stores/useProfileStore';
import { buildCoachContext, useDailySummary } from '../src/stores/useDailySummary';
import { ai } from '../src/services/ai';

interface Turn {
  role: 'coach' | 'you';
  text: string;
}

const PROMPTS = ['Where am I slacking?', 'Push me right now', "What's my next win?", 'Am I on track?'];

export default function CoachScreen() {
  const settings = useProfileStore((s) => s.coach);
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
    <Screen scroll={false}>
      <View style={{ paddingHorizontal: spacing.xl }}>
        <ScreenHeader title="AI Coach" />
      </View>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.xl, gap: spacing.md }}>
        {turns.map((t, i) => (
          <View key={i} style={{ alignItems: t.role === 'you' ? 'flex-end' : 'flex-start' }}>
            <Card
              tone={t.role === 'you' ? 'high' : 'default'}
              style={{ maxWidth: '85%', backgroundColor: t.role === 'coach' ? 'rgba(255,90,31,0.10)' : colors.surfaceHigh }}
            >
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

      <View style={{ padding: spacing.xl, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {PROMPTS.map((p) => (
            <Chip key={p} label={p} onPress={() => ask(p)} />
          ))}
        </View>
        <Button title="Get a fresh push" onPress={() => ask('Push me right now')} disabled={busy} />
      </View>
    </Screen>
  );
}

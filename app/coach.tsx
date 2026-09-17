import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Chip, Pill, Screen, Text } from '../src/components/ui';
import { Icon } from '../src/components/Icon';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { colors, radius, spacing } from '../src/theme';
import { formatDateWithWeekday, todayISO } from '../src/domain/date';
import { useProfileStore } from '../src/stores/useProfileStore';
import { useCoachStore, type CoachTurn } from '../src/stores/useCoachStore';
import { buildCoachContext, useDailySummary } from '../src/stores/useDailySummary';
import { ai } from '../src/services/ai';
import type { CoachSettings } from '../src/domain/types';
import { openGaps, type CoachIntent } from '../src/domain/coach';

const PERSONALITY_LABEL: Record<CoachSettings['personality'], string> = {
  friendly: 'Friendly',
  motivational: 'Motivational',
  savage: 'Savage',
  no_mercy: 'No Mercy',
};

const PROMPTS: { label: string; intent: CoachIntent }[] = [
  { label: 'Where am I slacking?', intent: 'weakest' },
  { label: 'Push me right now', intent: 'push' },
  { label: "What's my next win?", intent: 'next_win' },
  { label: 'Am I on track?', intent: 'on_track' },
];

export default function CoachScreen() {
  const settings = useProfileStore((s) => s.effectiveCoach());
  const summary = useDailySummary();
  const turns = useCoachStore((s) => s.turns);
  const append = useCoachStore((s) => s.append);
  const markGreeted = useCoachStore((s) => s.markGreeted);
  const clear = useCoachStore((s) => s.clear);

  // The same gaps the coach reasons from, shown plainly so the thread is not
  // the only evidence it is paying attention.
  const gaps = useMemo(() => openGaps(buildCoachContext(summary)), [summary]);

  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    // One opening message per day. Generating a fresh one on every mount buried
    // yesterday's thread under near-identical duplicates.
    if (!useCoachStore.getState().needsGreeting()) return;
    let cancelled = false;
    (async () => {
      const msg = await ai.coachMessage({ context: buildCoachContext(summary), settings });
      if (cancelled) return;
      append({ role: 'coach', text: msg.text, tone: msg.tone });
      markGreeted();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ask = async (label: string, intent: CoachIntent) => {
    setBusy(true);
    append({ role: 'you', text: label });
    // The question goes to the engine as an intent. It used to be faked by
    // inflating the numbers in the context — telling the coach the athlete had
    // 30g more protein left than they did, purely to steer which branch fired.
    const msg = await ai.coachMessage({ context: buildCoachContext(summary), settings, intent });
    append({ role: 'coach', text: msg.text, tone: msg.tone });
    setBusy(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const confirmClear = () => {
    Alert.alert('Clear this conversation?', 'Your logs and progress are not affected.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clear },
    ]);
  };

  // Group by day so a thread spanning weeks reads as a history rather than one
  // long run-on of messages.
  const days = useMemo(() => groupByDay(turns), [turns]);

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
              <Chip key={p.intent} label={p.label} onPress={() => ask(p.label, p.intent)} />
            ))}
          </ScrollView>
          <View style={{ paddingHorizontal: spacing.xl }}>
            <Button title="Get a fresh push" onPress={() => ask('Push me right now', 'push')} disabled={busy} />
          </View>
        </View>
      }
    >
      <View style={{ paddingHorizontal: spacing.xl }}>
        <ScreenHeader title="AI Coach" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
          <Pill label={PERSONALITY_LABEL[settings.personality]} color={colors.primary} />
          <Text variant="caption" color={colors.textFaint} style={{ flex: 1, minWidth: 0 }}>
            Aggression {settings.aggression}%
          </Text>
          {turns.length > 0 && (
            <Pressable onPress={confirmClear} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear conversation">
              <Text variant="caption" color={colors.textDim}>
                Clear
              </Text>
            </Pressable>
          )}
        </View>

        {/* What the coach is reading. Stating it makes the nudge checkable
            rather than something the app appears to have simply decided. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -spacing.xl, marginBottom: spacing.md }}
          contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.xl }}
        >
          <Fact label="Discipline" value={`${summary.discipline.score}`} />
          <Fact label="Protein left" value={`${Math.max(0, summary.proteinTarget - summary.proteinG)}g`} />
          <Fact label="Calories left" value={`${Math.max(0, summary.caloriesTarget - summary.calories)}`} />
          <Fact label="Trained today" value={summary.workoutCompleted ? 'yes' : 'not yet'} />
        </ScrollView>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          // Bottom-anchoring is right once a thread is long enough to scroll.
          // With one message it left most of a phone screen empty, which reads
          // as a failed load rather than a new conversation.
          justifyContent: turns.length > 4 ? 'flex-end' : 'flex-start',
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.xl,
          gap: spacing.md,
        }}
      >
        {turns.length <= 4 && (
          <View style={styles.watching}>
            <Text variant="overline" color={colors.textFaint}>WHAT I AM WATCHING TODAY</Text>
            {gaps.length === 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Icon name="check" size={15} color={colors.success} strokeWidth={2.2} />
                <Text variant="body" color={colors.textDim} style={{ flex: 1, minWidth: 0 }}>
                  Everything you set for today is done.
                </Text>
              </View>
            ) : (
              gaps.map((g) => (
                <View key={g.key} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={[styles.gapDot, { backgroundColor: GAP_TINT[g.key] }]} />
                  <Text variant="body" style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
                    {g.label}
                  </Text>
                  <Text variant="caption" color={colors.textDim}>{g.text}</Text>
                </View>
              ))
            )}
            <Text variant="caption" color={colors.textFaint}>
              Ask anything below, or tap a prompt to get straight to it.
            </Text>
          </View>
        )}

        {days.map((day) => (
          <View key={day.date} style={{ gap: spacing.md }}>
            <Text variant="caption" color={colors.textFaint} center>
              {day.date === todayISO() ? 'Today' : formatDateWithWeekday(day.date)}
            </Text>
            {day.turns.map((t) => (
              <Bubble key={t.id} turn={t} />
            ))}
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

function Bubble({ turn }: { turn: CoachTurn }) {
  const mine = turn.role === 'you';
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <Card tone={mine ? 'high' : 'default'} style={{ maxWidth: '86%' }}>
        {!mine && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Icon name="flame" size={14} color={colors.primary} />
            <Text variant="overline" color={colors.primary}>
              COACH
            </Text>
          </View>
        )}
        <Text variant={mine ? 'body' : 'h3'} style={mine ? undefined : { lineHeight: 26 }}>
          {turn.text}
        </Text>
      </Card>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text variant="caption" color={colors.textFaint}>
        {label}
      </Text>
      <Text variant="label">{value}</Text>
    </View>
  );
}

/** Consecutive turns bucketed by the day they were sent, oldest first. */
function groupByDay(turns: CoachTurn[]): { date: string; turns: CoachTurn[] }[] {
  const out: { date: string; turns: CoachTurn[] }[] = [];
  for (const turn of turns) {
    const last = out[out.length - 1];
    if (last && last.date === turn.date) last.turns.push(turn);
    else out.push({ date: turn.date, turns: [turn] });
  }
  return out;
}

const GAP_TINT: Record<string, string> = {
  workout: colors.primary,
  protein: colors.protein,
  water: colors.water,
  steps: colors.steps,
};

const styles = StyleSheet.create({
  watching: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  gapDot: { width: 7, height: 7, borderRadius: 4 },
  fact: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceHigh,
  },
});

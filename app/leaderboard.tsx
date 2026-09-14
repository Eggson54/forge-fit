import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Card, Screen, SegmentedControl, Text } from '../src/components/ui';
import { FadeIn } from '../src/components/anim';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { colors, radius, spacing } from '../src/theme';
import { computeRank, RANK_TIERS } from '../src/domain/rank';
import { DEMO_RIVALS } from '../src/data/rivals';
import { useProfileStore } from '../src/stores/useProfileStore';
import { useWorkoutStore } from '../src/stores/useWorkoutStore';
import { useGamificationStore } from '../src/stores/useGamificationStore';

const BIG3 = ['barbell_bench_press', 'barbell_squat', 'deadlift'];

export default function Leaderboard() {
  const profile = useProfileStore((s) => s.profile);
  const prs = useWorkoutStore((s) => s.prs);
  const completed = useWorkoutStore((s) => s.completedWorkouts().length);
  const g = useGamificationStore();
  const [scope, setScope] = React.useState<'friends' | 'global'>('friends');

  const myRank = computeRank({
    completedWorkouts: completed,
    longestDailyStreak: g.streaks.longestDaily,
    bestBig3E1RMKg: BIG3.reduce((sum, id) => sum + (prs[id] ?? 0), 0),
    bodyweightKg: profile.weightKg,
    bestDisciplineScore: g.bestDisciplineScore,
  });

  const rows = useMemo(() => {
    const rivals = scope === 'global' ? DEMO_RIVALS : DEMO_RIVALS.slice(2, 9);
    const me = { id: 'me', handle: profile.name ? `${profile.name} (you)` : 'You', score: myRank.score, weeklyDelta: 0, isMe: true };
    return [...rivals.map((r) => ({ ...r, isMe: false })), me].sort((a, b) => b.score - a.score);
  }, [scope, myRank.score, profile.name]);

  const myPosition = rows.findIndex((r) => r.isMe) + 1;

  return (
    <Screen gradient>
      <ScreenHeader title="Leaderboard" />

      <FadeIn>
        <Card style={{ alignItems: 'center', gap: 4, marginBottom: spacing.md }}>
          <Text variant="overline" color={colors.textDim}>YOUR POSITION</Text>
          <Text variant="display" color={colors.primary}>#{myPosition}</Text>
          <Text variant="caption" color={colors.textDim}>of {rows.length} · {myRank.tier.name} · {myRank.score} forge score</Text>
        </Card>
      </FadeIn>

      <SegmentedControl
        options={[
          { label: 'Friends', value: 'friends' },
          { label: 'Global', value: 'global' },
        ]}
        value={scope}
        onChange={(v) => setScope(v as 'friends' | 'global')}
      />

      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        {rows.map((r, i) => {
          const tier = tierFor(r.score);
          return (
            <FadeIn key={r.id} delay={i * 30}>
              <Card
                padded
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  borderColor: r.isMe ? colors.primary : colors.border,
                  borderWidth: r.isMe ? 1 : 0.5,
                  backgroundColor: r.isMe ? 'rgba(255,90,31,0.08)' : colors.card,
                }}
              >
                <View style={{ width: 30, alignItems: 'center' }}>
                  <Text variant="bodyStrong" color={i < 3 ? colors.amber : colors.textDim}>{medal(i)}</Text>
                </View>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tier.color }} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" color={r.isMe ? colors.primary : colors.text}>{r.handle}</Text>
                  <Text variant="caption" color={colors.textDim}>{tier.name}</Text>
                </View>
                {r.weeklyDelta !== 0 && (
                  <Text variant="caption" color={r.weeklyDelta > 0 ? colors.success : colors.danger}>
                    {r.weeklyDelta > 0 ? '▲' : '▼'} {Math.abs(r.weeklyDelta)}
                  </Text>
                )}
                <Text variant="metric" style={{ minWidth: 54, textAlign: 'right' }}>{r.score}</Text>
              </Card>
            </FadeIn>
          );
        })}
      </View>

      <View style={{ marginTop: spacing.lg, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surface }}>
        <Text variant="caption" color={colors.textFaint}>
          Rivals shown are demo competitors. Connect an account to climb a live leaderboard with your friends and the
          global ForgeFit community.
        </Text>
      </View>
    </Screen>
  );
}

function tierFor(score: number) {
  let t = RANK_TIERS[0];
  for (const tier of RANK_TIERS) if (score >= tier.min) t = tier;
  return t;
}
const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1));

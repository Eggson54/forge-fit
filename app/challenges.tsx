import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Input,
  LinearProgress,
  Pill,
  Screen,
  SectionHeader,
  Text,
} from '../src/components/ui';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { colors, spacing } from '../src/theme';
import { formatDistance, formatElevation } from '../src/domain/geo';
import { formatDuration } from '../src/domain/track';
import { formatDayMonth, todayISO } from '../src/domain/date';
import {
  CHALLENGE_SCOPE_NOTE,
  challengeProblem,
  daysLeft,
  monthWindow,
  perDayNeeded,
  progressOf,
  standingOf,
  statusOf,
  type Challenge,
  type ChallengeEntry,
  type ChallengeMetric,
} from '../src/domain/challenges';
import { useActivityStore } from '../src/stores/useActivityStore';
import { useChallengeStore } from '../src/stores/useChallengeStore';
import { useProfileStore } from '../src/stores/useProfileStore';

const METRICS: ChallengeMetric[] = ['distance', 'elevation', 'time', 'activities'];

const METRIC_LABEL: Record<ChallengeMetric, string> = {
  distance: 'Distance',
  elevation: 'Climbing',
  time: 'Moving time',
  activities: 'Activities',
};

/**
 * What a target is typed in, as against what it is stored in.
 *
 * Stored in metres and seconds always; typed in whatever the athlete reads
 * the result in. Asking an imperial athlete for metres of climbing and then
 * reporting the answer in feet is how a target of two thousand becomes a
 * target of six and a half.
 */
const METRES_PER_FOOT = 0.3048;
const METRES_PER_MILE = 1609.344;

function targetUnit(
  metric: ChallengeMetric,
  units: 'imperial' | 'metric',
): { label: string; toBase: (n: number) => number } {
  switch (metric) {
    case 'distance':
      return units === 'imperial'
        ? { label: 'miles', toBase: (n) => n * METRES_PER_MILE }
        : { label: 'km', toBase: (n) => n * 1000 };
    case 'elevation':
      return units === 'imperial'
        ? { label: 'ft', toBase: (n) => n * METRES_PER_FOOT }
        : { label: 'm', toBase: (n) => n };
    case 'time':
      return { label: 'hours', toBase: (n) => n * 3600 };
    case 'activities':
      return { label: 'activities', toBase: (n) => n };
  }
}

const STANDING_COLOR: Record<string, string> = {
  done: colors.success,
  ahead: colors.success,
  on_track: colors.primary,
  behind: colors.warning,
  missed: colors.textFaint,
  not_started: colors.textFaint,
};

/**
 * Challenges: a target, a window, and whether you are going to make it.
 *
 * The screen leans on `standingOf` rather than on a progress bar alone,
 * because a bar at 40% on the 10th and a bar at 40% on the 28th are the same
 * picture and opposite situations.
 */
export default function Challenges() {
  const activities = useActivityStore((s) => s.activities);
  const challenges = useChallengeStore((s) => s.challenges);
  const create = useChallengeStore((s) => s.create);
  const remove = useChallengeStore((s) => s.remove);
  const units = useProfileStore((s) => s.profile.units);

  const today = todayISO();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [metric, setMetric] = useState<ChallengeMetric>('distance');
  const [target, setTarget] = useState('100');

  const entries = useMemo<ChallengeEntry[]>(
    () =>
      activities.map((a) => ({
        date: a.date,
        distanceM: a.distanceM,
        elevationGainM: a.ascentM,
        movingSeconds: a.movingS > 0 ? a.movingS : a.elapsedS,
      })),
    [activities],
  );

  const month = monthWindow(today);
  const draft = {
    name,
    metric,
    target: targetUnit(metric, units).toBase(Number(target)),
    from: month.from,
    to: month.to,
  };
  const problem = challengeProblem(draft);

  const amount = (value: number, m: ChallengeMetric): string => {
    if (m === 'activities') return `${Math.round(value)}`;
    if (m === 'time') return formatDuration(value);
    // Climb has its own formatter: formatDistance would call two thousand
    // metres of ascent "2.0 km".
    if (m === 'elevation') return formatElevation(value, units);
    return formatDistance(value, units);
  };

  const sorted = useMemo(() => {
    // Live ones first, then what is coming, then what is over. Within the
    // live ones, the unfinished go above the finished: a challenge already
    // met needs nothing from anybody today. Then soonest deadline first.
    const rank = { active: 0, upcoming: 1, ended: 2 } as const;
    return [...challenges].sort((a, b) => {
      const byStatus = rank[statusOf(a, today)] - rank[statusOf(b, today)];
      if (byStatus !== 0) return byStatus;
      const doneA = progressOf(a, entries).complete ? 1 : 0;
      const doneB = progressOf(b, entries).complete ? 1 : 0;
      if (doneA !== doneB) return doneA - doneB;
      return a.to < b.to ? -1 : a.to > b.to ? 1 : 0;
    });
  }, [challenges, today, entries]);

  return (
    <Screen gradient>
      <ScreenHeader
        title="Challenges"
        subtitle="A target and a deadline"
        right={
          !adding ? (
            <Button title="New" size="sm" fullWidth={false} onPress={() => setAdding(true)} />
          ) : undefined
        }
      />

      {adding && (
        <Card style={{ gap: spacing.md }}>
          <SectionHeader title={`This month · ${formatDayMonth(month.from)} to ${formatDayMonth(month.to)}`} />
          <Input label="Name" value={name} onChangeText={setName} placeholder="September 100k" />

          <View style={{ gap: spacing.xs }}>
            <Text variant="label" color={colors.textDim}>
              Counting
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {METRICS.map((m) => (
                <Chip key={m} label={METRIC_LABEL[m]} selected={metric === m} onPress={() => setMetric(m)} />
              ))}
            </View>
          </View>

          <Input
            label={`Target (${targetUnit(metric, units).label})`}
            value={target}
            onChangeText={setTarget}
            keyboardType="numeric"
          />

          {problem && (
            <Text variant="caption" color={colors.warning}>
              {problem}
            </Text>
          )}

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              title="Set it"
              disabled={!!problem}
              onPress={() => {
                if (create(draft)) {
                  setAdding(false);
                  setName('');
                }
              }}
            />
            <Button title="Cancel" variant="ghost" onPress={() => setAdding(false)} />
          </View>
        </Card>
      )}

      {sorted.length === 0 && !adding && (
        <EmptyState
          icon="target"
          tint={colors.primary}
          title="No challenge running"
          subtitle="Pick something to chase this month. It counts from the activities you already record — nothing extra to log."
          action="Set one"
          onAction={() => setAdding(true)}
        />
      )}

      {sorted.map((c: Challenge) => {
        const progress = progressOf(c, entries);
        const standing = standingOf(c, progress, today);
        const left = daysLeft(c, today);
        const perDay = perDayNeeded(c, progress, today);
        const tint = STANDING_COLOR[standing.standing] ?? colors.primary;

        return (
          <Card key={c.id} style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {c.name}
              </Text>
              <Pill label={METRIC_LABEL[c.metric]} color={colors.textDim} />
            </View>

            <LinearProgress progress={progress.fraction} color={tint} />

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text variant="bodyStrong" color={tint}>
                {amount(progress.value, c.metric)}
              </Text>
              <Text variant="caption" color={colors.textFaint} style={{ flex: 1 }}>
                of {amount(c.target, c.metric)} · {progress.entries}{' '}
                {progress.entries === 1 ? 'activity' : 'activities'}
              </Text>
              <Text variant="caption" color={colors.textFaint}>
                {/* Days left is time still to do it in. Once it is done
                    there is nothing to do in them, and the countdown reads
                    as though there were — so it goes, and the line below
                    says "done" once rather than twice. */}
                {progress.complete
                  ? ''
                  : statusOf(c, today) === 'ended'
                    ? 'Finished'
                    : `${left} ${left === 1 ? 'day' : 'days'} left`}
              </Text>
            </View>

            <Text variant="caption" color={tint}>
              {standing.read}
              {perDay != null && left > 0
                ? ` ${amount(perDay, c.metric)} a day gets you there.`
                : ''}
            </Text>

            <Text variant="caption" color={colors.textFaint}>
              {formatDayMonth(c.from)} to {formatDayMonth(c.to)}
            </Text>

            <Button title="Remove" size="sm" variant="ghost" fullWidth={false} onPress={() => remove(c.id)} />
          </Card>
        );
      })}

      <Card tone="alt">
        <Text variant="caption" color={colors.textDim}>
          {CHALLENGE_SCOPE_NOTE}
        </Text>
      </Card>
    </Screen>
  );
}

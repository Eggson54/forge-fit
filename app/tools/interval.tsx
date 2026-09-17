import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Button, Card, ProgressRing, Screen, SectionHeader, Text, Well } from '../../src/components/ui';
import { FadeIn } from '../../src/components/anim';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { colors, radius, spacing } from '../../src/theme';
import {
  DEFAULT_PLAN,
  INTERVAL_PRESETS,
  buildSchedule,
  describePlan,
  formatClock,
  normalisePlan,
  positionAt,
  totalSeconds,
  type IntervalPlan,
  type PhaseKind,
} from '../../src/domain/interval';

const PHASE_TINT: Record<PhaseKind, string> = {
  prepare: colors.amber,
  work: colors.primary,
  rest: colors.water,
  round_rest: colors.sleep,
  done: colors.success,
};

interface Field {
  key: keyof IntervalPlan;
  label: string;
  step: number;
  suffix: string;
}

const FIELDS: Field[] = [
  { key: 'rounds', label: 'Rounds', step: 1, suffix: '' },
  { key: 'workSeconds', label: 'Work', step: 5, suffix: 's' },
  { key: 'restSeconds', label: 'Rest', step: 5, suffix: 's' },
  { key: 'stations', label: 'Stations', step: 1, suffix: '' },
  { key: 'roundRestSeconds', label: 'Round rest', step: 15, suffix: 's' },
  { key: 'prepareSeconds', label: 'Countdown', step: 5, suffix: 's' },
];

export default function IntervalTimer() {
  const { width } = useWindowDimensions();
  const [plan, setPlan] = useState<IntervalPlan>(DEFAULT_PLAN);
  const [presetKey, setPresetKey] = useState<string | null>(null);

  const schedule = useMemo(() => buildSchedule(plan), [plan]);
  const total = useMemo(() => totalSeconds(plan), [plan]);

  // Wall clock, not accumulated ticks. An interval timer whose screen sleeps
  // mid-set is the normal case, not the edge case — the same mistake the rest
  // timer made before it was fixed.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const lastPhaseRef = useRef<number>(-1);

  const running = startedAt != null && pausedAt == null;

  useEffect(() => {
    if (!running) return;
    const tick = () => setElapsed((Date.now() - startedAt!) / 1000);
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [running, startedAt]);

  const at = positionAt(schedule, elapsed);

  // A buzz on every phase change, including the one that ends the session.
  useEffect(() => {
    if (startedAt == null) return;
    if (at.index === lastPhaseRef.current) return;
    lastPhaseRef.current = at.index;
    const style =
      at.phase.kind === 'work'
        ? Haptics.NotificationFeedbackType.Warning
        : at.finished
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Success;
    Haptics.notificationAsync(style).catch(() => {});
  }, [at.index, at.phase.kind, at.finished, startedAt]);

  const start = () => {
    lastPhaseRef.current = -1;
    setStartedAt(Date.now());
    setPausedAt(null);
    setElapsed(0);
  };
  const pause = () => setPausedAt(Date.now());
  const resume = () => {
    if (startedAt == null || pausedAt == null) return;
    // Shift the origin forward by however long we sat paused, so the clock
    // resumes where it stopped rather than jumping.
    setStartedAt(startedAt + (Date.now() - pausedAt));
    setPausedAt(null);
  };
  const reset = useCallback(() => {
    setStartedAt(null);
    setPausedAt(null);
    setElapsed(0);
    lastPhaseRef.current = -1;
  }, []);

  const adjust = (key: keyof IntervalPlan, delta: number) => {
    setPlan((p) => normalisePlan({ ...p, [key]: (p[key] as number) + delta }));
    setPresetKey(null);
    reset();
  };

  const tint = PHASE_TINT[at.phase.kind];
  const ringSize = Math.min(268, width - spacing.xl * 2 - 24);
  const idle = startedAt == null;

  return (
    <Screen gradient>
      <ScreenHeader title="Interval Timer" />

      <FadeIn>
        <Card elevation="floating" accent={tint} style={{ alignItems: 'center', gap: spacing.lg }}>
          <Text variant="overline" color={tint}>
            {idle ? describePlan(plan).toUpperCase() : at.finished ? 'FINISHED' : at.phase.label.toUpperCase()}
          </Text>

          <ProgressRing
            size={ringSize}
            stroke={16}
            // Counts down, so the ring empties as the phase runs out.
            progress={idle ? 1 : 1 - at.phaseProgress}
            color={tint}
            trackColor="rgba(255,255,255,0.06)"
          >
            <View style={{ alignItems: 'center', gap: 2 }}>
              <Text variant="display" style={{ fontSize: 56, lineHeight: 60 }}>
                {formatClock(idle ? total : at.remaining)}
              </Text>
              <Text variant="caption" color={colors.textDim}>
                {idle
                  ? 'total'
                  : at.finished
                    ? 'well done'
                    : at.phase.kind === 'prepare'
                      ? // The countdown belongs to no round; "Round 0 of 8" is a
                        // number that does not exist.
                        `${plan.rounds} rounds coming up`
                      : plan.stations > 1
                        ? `Round ${at.phase.round}/${plan.rounds} · station ${at.phase.station}/${plan.stations}`
                        : `Round ${at.phase.round} of ${plan.rounds}`}
              </Text>
            </View>
          </ProgressRing>

          {/* The next phase, before it arrives — the one thing a timer can tell
              you that a stopwatch cannot. */}
          <View style={{ height: 20, justifyContent: 'center' }}>
            {!idle && at.next && !at.finished && (
              <Text variant="caption" color={colors.textFaint}>
                Next: {at.next.label} · {formatClock(at.next.seconds)}
              </Text>
            )}
          </View>

          <View style={styles.sessionTrack}>
            <View
              style={{
                width: `${Math.round((idle ? 0 : at.sessionProgress) * 100)}%`,
                height: '100%',
                backgroundColor: tint,
                borderRadius: 2,
              }}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.md, width: '100%' }}>
            {idle ? (
              <Button title="Start" onPress={start} size="lg" style={{ flex: 1 }} />
            ) : at.finished ? (
              // Nothing left to pause. The only thing anyone wants here is to
              // go again.
              <Button title="Go again" onPress={start} size="lg" style={{ flex: 1 }} />
            ) : (
              <>
                <Button
                  title={running ? 'Pause' : 'Resume'}
                  variant={running ? 'secondary' : 'primary'}
                  onPress={running ? pause : resume}
                  style={{ flex: 1 }}
                />
                <Button title="Reset" variant="ghost" onPress={reset} style={{ flex: 1 }} />
              </>
            )}
          </View>
        </Card>
      </FadeIn>

      <SectionHeader title="Presets" accent={colors.primary} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {INTERVAL_PRESETS.map((p) => {
          const on = presetKey === p.key;
          return (
            <Card
              key={p.key}
              onPress={() => {
                setPlan(p.plan);
                setPresetKey(p.key);
                reset();
              }}
              style={{
                flexBasis: '47%',
                flexGrow: 1,
                gap: 2,
                ...(on ? { borderColor: colors.primary, borderWidth: 1 } : null),
              }}
            >
              <Text variant="bodyStrong" color={on ? colors.primary : colors.text}>{p.name}</Text>
              <Text variant="caption" color={colors.textDim}>{p.blurb}</Text>
              <Text variant="caption" color={colors.textFaint}>{formatClock(totalSeconds(p.plan))} total</Text>
            </Card>
          );
        })}
      </View>

      <SectionHeader title="Build your own" accent={colors.primary} />
      <Well style={{ gap: spacing.xs }}>
        {FIELDS.map((f, i) => (
          <View key={f.key} style={[styles.row, i < FIELDS.length - 1 && styles.rowDivider]}>
            <Text variant="body" style={{ flex: 1, minWidth: 0 }}>{f.label}</Text>
            <Stepper
              value={plan[f.key] as number}
              suffix={f.suffix}
              label={f.label}
              onChange={(d) => adjust(f.key, d * f.step)}
            />
          </View>
        ))}
      </Well>

      <Card tone="alt" style={{ marginTop: spacing.md, gap: spacing.xs }}>
        <Text variant="bodyStrong">{describePlan(plan)}</Text>
        <Text variant="caption" color={colors.textDim}>
          {formatClock(total)} in total, including the countdown.
        </Text>
        <Text variant="caption" color={colors.textFaint}>
          These are timing structures, not training advice. Pick work and rest lengths that suit what you are
          actually doing.
        </Text>
      </Card>
    </Screen>
  );
}

function Stepper({
  value,
  suffix,
  label,
  onChange,
}: {
  value: number;
  suffix: string;
  label: string;
  onChange: (direction: -1 | 1) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Pressable
        onPress={() => onChange(-1)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${label}`}
        style={styles.stepBtn}
      >
        <Icon name="minus" size={14} color={colors.textDim} strokeWidth={2.4} />
      </Pressable>
      <Text variant="label" style={{ minWidth: 48, textAlign: 'center' }}>
        {value}
        {suffix}
      </Text>
      <Pressable
        onPress={() => onChange(1)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Increase ${label}`}
        style={styles.stepBtn}
      >
        <Icon name="plus" size={14} color={colors.textDim} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

const styles = {
  sessionTrack: {
    height: 4,
    width: '100%' as const,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden' as const,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 46,
  },
  rowDivider: { borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.05)' },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.07)',
  },
};

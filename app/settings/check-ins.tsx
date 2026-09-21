import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Chip, Screen, SectionHeader, SegmentedControl, Text, Toggle } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { colors, spacing } from '../../src/theme';
import { addDaysISO, todayISO } from '../../src/domain/date';
import {
  CADENCE_LABEL,
  CHECK_IN_NOTE,
  GHOST_SUPPRESSES,
  THINKING_LABEL,
  THINKING_NOTE,
  describeCheckIn,
  describeGhost,
  formatTime,
  type CheckInCadence,
  type ThinkingMode,
} from '../../src/domain/checkIns';
import { useCheckInStore } from '../../src/stores/useCheckInStore';
import { useReminderStore } from '../../src/stores/useReminderStore';

const CADENCES: CheckInCadence[] = ['daily', 'weekdays', 'weekly', 'fortnightly', 'monthly', 'off'];

/** Half-hour steps, wrapping at midnight, so the time control needs no keyboard. */
const STEP = 30;

export default function CheckIns() {
  const checkIns = useCheckInStore((s) => s.checkIns);
  const ghost = useCheckInStore((s) => s.ghost);
  const thinking = useCheckInStore((s) => s.thinking);
  const setCadence = useCheckInStore((s) => s.setCadence);
  const setTime = useCheckInStore((s) => s.setTime);
  const toggle = useCheckInStore((s) => s.toggle);
  const setGhostRaw = useCheckInStore((s) => s.setGhost);
  const rescheduleAll = useReminderStore((s) => s.rescheduleAll);

  // Flipping the switch has to reach the OS, or the mode is a label on a
  // boolean: notifications already queued with the system keep arriving
  // whatever this app thinks its state is.
  const setGhost = (next: Parameters<typeof setGhostRaw>[0]) => {
    setGhostRaw(next);
    void rescheduleAll();
  };
  const setThinking = useCheckInStore((s) => s.setThinking);

  const quiet = useCheckInStore((s) => s.quiet)();

  const nudge = (id: string, current: number, delta: number) =>
    setTime(id, (((current + delta) % 1440) + 1440) % 1440);

  return (
    <Screen gradient>
      <ScreenHeader title="Check-ins" subtitle="When the app speaks first" />

      {quiet && (
        <Card style={{ gap: 4, borderColor: colors.primary, borderWidth: StyleSheet.hairlineWidth }}>
          <Text variant="bodyStrong">Ghost Mode is on</Text>
          <Text variant="caption" color={colors.textDim}>
            Nothing below will fire until you turn it off.
          </Text>
        </Card>
      )}

      <SectionHeader title="Scheduled" />
      {checkIns.map((c) => (
        <Card key={c.id} style={{ gap: spacing.sm, marginBottom: spacing.md }}>
          <View style={styles.head}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="bodyStrong">{c.label}</Text>
              <Text variant="caption" color={colors.textDim}>
                {describeCheckIn(c)}
              </Text>
            </View>
            <Toggle value={c.enabled} onValueChange={() => toggle(c.id)} accessibilityLabel={c.label} />
          </View>

          {c.enabled && (
            <>
              {/* Chips rather than a segmented control: six cadences will not
                  fit one strip, and splitting them across two strips lit one
                  option in each — a control claiming the same check-in was
                  both weekly and never. */}
              <View style={styles.chips}>
                {CADENCES.map((v) => (
                  <Chip
                    key={v}
                    label={CADENCE_LABEL[v]}
                    selected={c.cadence === v}
                    onPress={() => setCadence(c.id, v)}
                  />
                ))}
              </View>
              <View style={styles.time}>
                <Text variant="caption" color={colors.textDim} style={{ flex: 1 }}>
                  Time
                </Text>
                <Text
                  accessibilityRole="button"
                  accessibilityLabel="Half an hour earlier"
                  onPress={() => nudge(c.id, c.timeMinutes, -STEP)}
                  style={styles.step}
                >
                  <Icon name="minus" size={15} color={colors.textDim} />
                </Text>
                <Text variant="bodyStrong" style={{ minWidth: 76, textAlign: 'center' }}>
                  {formatTime(c.timeMinutes)}
                </Text>
                <Text
                  accessibilityRole="button"
                  accessibilityLabel="Half an hour later"
                  onPress={() => nudge(c.id, c.timeMinutes, STEP)}
                  style={styles.step}
                >
                  <Icon name="plus" size={15} color={colors.textDim} />
                </Text>
              </View>
            </>
          )}
        </Card>
      ))}
      <Text variant="caption" color={colors.textFaint}>
        {CHECK_IN_NOTE}
      </Text>

      <SectionHeader title="Ghost Mode" />
      <Card style={{ gap: spacing.md }}>
        <Text variant="body" color={colors.textDim}>
          {describeGhost(ghost)}
        </Text>
        <View style={{ gap: 4 }}>
          {GHOST_SUPPRESSES.map((line) => (
            <View key={line} style={styles.bullet}>
              <Icon name="check" size={14} color={colors.textFaint} />
              <Text variant="caption" color={colors.textDim} style={{ flex: 1 }}>
                {line}
              </Text>
            </View>
          ))}
        </View>
        {ghost.on ? (
          <Button title="Turn Ghost Mode off" onPress={() => setGhost({ on: false, until: null })} />
        ) : (
          <View style={{ gap: spacing.sm }}>
            <Button
              title="Quiet for a week"
              variant="secondary"
              onPress={() => setGhost({ on: true, until: addDaysISO(todayISO(), 6) })}
            />
            <Button
              title="Quiet until I say otherwise"
              variant="ghost"
              onPress={() => setGhost({ on: true, until: null })}
            />
          </View>
        )}
      </Card>

      <SectionHeader title="How your coach thinks" />
      <Card style={{ gap: spacing.md }}>
        <SegmentedControl
          options={(['fast', 'adaptive', 'thorough'] as ThinkingMode[]).map((v) => ({
            label: THINKING_LABEL[v],
            value: v,
          }))}
          value={thinking}
          onChange={setThinking}
        />
        <Text variant="caption" color={colors.textDim}>
          {THINKING_NOTE[thinking]}
        </Text>
      </Card>

      <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.xl }}>
        Ghost Mode never deletes anything. Your workouts, meals and measurements carry on being recorded — the app just
        stops talking about them.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  time: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  step: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  bullet: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});

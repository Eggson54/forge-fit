import React, { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Card, EmptyState, Input, Screen, SectionHeader, Text, Toggle } from '../src/components/ui';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { colors, radius, spacing } from '../src/theme';
import type { Reminder, ReminderType } from '../src/domain/types';
import { REMINDER_PRESETS, useReminderStore } from '../src/stores/useReminderStore';
import { useProfileStore } from '../src/stores/useProfileStore';
import { notifications } from '../src/services/notifications';
import { FREE_TIER_LIMITS } from '../src/services/config';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const ADDABLE: ReminderType[] = ['workout', 'water', 'meal', 'protein', 'steps', 'sleep', 'weight', 'progress_photo', 'custom'];

export default function Reminders() {
  const reminders = useReminderStore((s) => s.reminders);
  const add = useReminderStore((s) => s.add);
  const isPro = useProfileStore((s) => s.isPro());
  const [permission, setPermission] = useState<boolean | null>(null);

  useEffect(() => {
    notifications.requestPermission().then(setPermission);
  }, []);

  const onAdd = (type: ReminderType) => {
    if (!isPro && reminders.length >= FREE_TIER_LIMITS.maxReminders) {
      Alert.alert('Reminder limit', `Free plan allows ${FREE_TIER_LIMITS.maxReminders} reminders. Go Pro for unlimited.`);
      return;
    }
    add(type);
  };

  return (
    <Screen gradient>
      <ScreenHeader title="Reminders" />

      {permission === false && (
        <Card tone="alt" style={{ marginBottom: spacing.md }}>
          <Text variant="caption" color={colors.warning}>
            Notifications are disabled. Enable them in system settings to receive reminders.
          </Text>
        </Card>
      )}

      {reminders.length === 0 ? (
        <EmptyState icon="bell" title="No reminders yet" subtitle="Add reminders to stay accountable — your coach nudges you at the right time." />
      ) : (
        <View style={{ gap: spacing.md }}>
          {reminders.map((r) => (
            <ReminderRow key={r.id} reminder={r} />
          ))}
        </View>
      )}

      <SectionHeader title="Add a reminder" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {ADDABLE.map((t) => (
          <Pressable key={t} onPress={() => onAdd(t)} style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 0.5, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.pill }}>
            <Text variant="label">+ {REMINDER_PRESETS[t].title}</Text>
          </Pressable>
        ))}
      </View>

      <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.xl }}>
        We keep notifications purposeful — never spammy. Adjust frequency by editing days and times below each reminder.
      </Text>
    </Screen>
  );
}

function ReminderRow({ reminder }: { reminder: Reminder }) {
  const update = useReminderStore((s) => s.update);
  const toggle = useReminderStore((s) => s.toggle);
  const remove = useReminderStore((s) => s.remove);
  const [time, setTime] = useState(reminder.time);
  const [editing, setEditing] = useState(false);

  const toggleDay = (d: number) => {
    const days = reminder.days.includes(d) ? reminder.days.filter((x) => x !== d) : [...reminder.days, d].sort();
    update(reminder.id, { days });
  };

  const commitTime = () => {
    if (/^\d{1,2}:\d{2}$/.test(time)) update(reminder.id, { time });
    setEditing(false);
  };

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">{reminder.title}</Text>
          {editing ? (
            <Input value={time} onChangeText={setTime} onBlur={commitTime} placeholder="HH:mm" keyboardType="numbers-and-punctuation" style={{ width: 90 }} />
          ) : (
            <Pressable onPress={() => setEditing(true)}>
              <Text variant="caption" color={colors.primary}>
                {reminder.time} · tap to edit
              </Text>
            </Pressable>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Toggle value={reminder.enabled} onValueChange={() => toggle(reminder.id)} />
          <Pressable onPress={() => remove(reminder.id)} hitSlop={8}>
            <Text variant="caption" color={colors.danger}>
              Delete
            </Text>
          </Pressable>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
        {DAY_LABELS.map((d, i) => {
          const on = reminder.days.includes(i);
          return (
            <Pressable
              key={i}
              onPress={() => toggleDay(i)}
              style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.primary : colors.surfaceHigh }}
            >
              <Text variant="caption" color={on ? colors.onPrimary : colors.textDim}>
                {d}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

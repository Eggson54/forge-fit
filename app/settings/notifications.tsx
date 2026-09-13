import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Screen, SectionHeader, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, spacing } from '../../src/theme';
import { notifications } from '../../src/services/notifications';
import { useReminderStore } from '../../src/stores/useReminderStore';

export default function NotificationSettings() {
  const reminders = useReminderStore((s) => s.reminders);
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    notifications.requestPermission().then(setGranted);
  }, []);

  const active = reminders.filter((r) => r.enabled).length;

  return (
    <Screen gradient>
      <ScreenHeader title="Notifications" />

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">System permission</Text>
            <Text variant="caption" color={granted ? colors.success : colors.warning}>
              {granted == null ? 'Checking…' : granted ? 'Granted' : 'Not granted — enable in system settings'}
            </Text>
          </View>
        </View>
      </Card>

      <SectionHeader title="Reminders" />
      <Card>
        <Text variant="body">
          {active} active reminder{active === 1 ? '' : 's'}.
        </Text>
        <Text variant="caption" color={colors.textDim} style={{ marginTop: 4 }}>
          ForgeFit keeps notifications purposeful and never spams you. Configure each reminder's days and time individually.
        </Text>
        <View style={{ marginTop: spacing.md }}>
          <Button title="Manage Reminders" onPress={() => router.push('/reminders')} />
        </View>
      </Card>

      <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.xl }}>
        Reminder content stays on your device. We schedule local notifications only — nothing about your reminders is sent to a server.
      </Text>
    </Screen>
  );
}

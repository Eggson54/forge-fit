import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Reminder } from '../domain/types';

/**
 * Local notification scheduling for reminders. Uses Expo Notifications. All
 * scheduling is local (on-device); no reminder content leaves the device.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const notifications = {
  async requestPermission(): Promise<boolean> {
    try {
      const settings = await Notifications.getPermissionsAsync();
      let granted = settings.granted;
      if (!granted) {
        const req = await Notifications.requestPermissionsAsync();
        granted = req.granted;
      }
      if (granted && Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('reminders', {
          name: 'Reminders',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }
      return granted;
    } catch {
      return false;
    }
  },

  /** (Re)schedule all weekly occurrences for a reminder. Returns the ids. */
  async schedule(reminder: Reminder): Promise<string[]> {
    await this.cancel(reminder.notificationIds ?? []);
    if (!reminder.enabled) return [];
    const [hour, minute] = reminder.time.split(':').map((n) => parseInt(n, 10));
    const ids: string[] = [];
    try {
      for (const day of reminder.days) {
        const id = await Notifications.scheduleNotificationAsync({
          content: { title: reminder.title, body: reminder.body ?? '', data: { reminderId: reminder.id, type: reminder.type } },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: day + 1, // expo uses 1=Sunday
            hour: hour ?? 9,
            minute: minute ?? 0,
          },
        });
        ids.push(id);
      }
    } catch {
      /* scheduling unavailable (e.g. web) — reminders still stored */
    }
    return ids;
  },

  async cancel(ids: string[]): Promise<void> {
    await Promise.all(
      ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)),
    );
  },

  async cancelAll(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch {
      /* noop */
    }
  },
};

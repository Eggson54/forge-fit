import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Reminder, ReminderType } from '../domain/types';
import { uid } from '../lib/uid';
import { notifications } from '../services/notifications';
import { jsonStorage, STORE_KEYS } from './persist';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export const REMINDER_PRESETS: Record<ReminderType, { title: string; body: string; time: string }> = {
  workout: { title: 'Time to train', body: 'Your workout is waiting. Get moving.', time: '18:00' },
  water: { title: 'Hydrate', body: 'Grab a glass of water.', time: '11:00' },
  meal: { title: 'Log your meal', body: "Don't forget to track what you ate.", time: '13:00' },
  protein: { title: 'Protein check', body: 'How is your protein looking today?', time: '20:00' },
  steps: { title: 'Get your steps', body: 'A short walk moves you toward your goal.', time: '16:00' },
  sleep: { title: 'Wind down', body: 'Aim for your sleep target tonight.', time: '22:30' },
  progress_photo: { title: 'Progress photo', body: 'Snap your weekly progress photo.', time: '09:00' },
  weight: { title: 'Weigh in', body: 'Log your morning weight.', time: '07:30' },
  protocol: { title: 'Protocol reminder', body: 'Time to log your protocol.', time: '09:00' },
  custom: { title: 'Reminder', body: '', time: '12:00' },
};

interface ReminderState {
  reminders: Reminder[];
  add: (type: ReminderType, overrides?: Partial<Reminder>) => Promise<Reminder>;
  update: (id: string, patch: Partial<Reminder>) => Promise<void>;
  toggle: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  rescheduleAll: () => Promise<void>;
  reset: () => void;
}

export const useReminderStore = create<ReminderState>()(
  persist(
    (set, get) => ({
      reminders: [],

      add: async (type, overrides) => {
        const preset = REMINDER_PRESETS[type];
        const base: Reminder = {
          id: uid('r_'),
          type,
          title: preset.title,
          body: preset.body,
          time: preset.time,
          days: ALL_DAYS,
          enabled: true,
          ...overrides,
        };
        const notificationIds = await notifications.schedule(base);
        const reminder = { ...base, notificationIds };
        set((s) => ({ reminders: [reminder, ...s.reminders] }));
        return reminder;
      },

      update: async (id, patch) => {
        const existing = get().reminders.find((r) => r.id === id);
        if (!existing) return;
        const merged = { ...existing, ...patch };
        const notificationIds = await notifications.schedule(merged);
        set((s) => ({ reminders: s.reminders.map((r) => (r.id === id ? { ...merged, notificationIds } : r)) }));
      },

      toggle: async (id) => {
        const existing = get().reminders.find((r) => r.id === id);
        if (!existing) return;
        await get().update(id, { enabled: !existing.enabled });
      },

      remove: async (id) => {
        const existing = get().reminders.find((r) => r.id === id);
        if (existing?.notificationIds) await notifications.cancel(existing.notificationIds);
        set((s) => ({ reminders: s.reminders.filter((r) => r.id !== id) }));
      },

      rescheduleAll: async () => {
        for (const r of get().reminders) {
          const notificationIds = await notifications.schedule(r);
          set((s) => ({ reminders: s.reminders.map((x) => (x.id === r.id ? { ...x, notificationIds } : x)) }));
        }
      },

      reset: () => set({ reminders: [] }),
    }),
    { name: STORE_KEYS.reminders, storage: jsonStorage() },
  ),
);

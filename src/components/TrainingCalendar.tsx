import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Text } from './ui/Text';
import { Icon } from './Icon';
import { colors, radius, spacing } from '../theme';
import { formatDurationShort, longestRunOfDays, todayISO } from '../domain/date';
import { workoutStats } from '../domain/strength';
import { displayVolume } from '../domain/units';
import type { ISODate, Units, Workout } from '../domain/types';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface DayCell {
  date: ISODate;
  day: number;
  inMonth: boolean;
}

/** Calendar cells for `month`, padded to whole weeks starting on Sunday. */
function monthGrid(year: number, month: number): DayCell[] {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { date: todayISO(d), day: d.getDate(), inMonth: d.getMonth() === month };
  });
  // Six weeks covers every possible month, but most need five — drop a trailing
  // week that belongs entirely to the next month rather than leaving a dead row.
  const weeks = cells.slice(35).some((c) => c.inMonth) ? 6 : 5;
  return cells.slice(0, weeks * 7);
}

interface Props {
  workouts: Workout[];
  units: Units;
}

/**
 * Month view of training history. Each trained day is filled in proportion to
 * its volume, so a glance shows both *how often* and *how hard* — a plain
 * checkmark grid hides a month of half-sessions.
 */
export function TrainingCalendar({ workouts, units }: Props) {
  const today = todayISO();
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selected, setSelected] = useState<ISODate | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<ISODate, { workouts: Workout[]; volumeKg: number; seconds: number }>();
    for (const w of workouts) {
      const entry = map.get(w.date) ?? { workouts: [], volumeKg: 0, seconds: 0 };
      entry.workouts.push(w);
      entry.volumeKg += workoutStats(w).totalVolumeKg;
      entry.seconds += w.durationSeconds ?? 0;
      map.set(w.date, entry);
    }
    return map;
  }, [workouts]);

  const cells = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);

  const month = useMemo(() => {
    const days = cells.filter((c) => c.inMonth && byDate.has(c.date));
    const sessions = days.reduce((a, c) => a + byDate.get(c.date)!.workouts.length, 0);
    const volumeKg = days.reduce((a, c) => a + byDate.get(c.date)!.volumeKg, 0);
    // Scale intensity within the month so a deload month still reads.
    const peak = days.reduce((a, c) => Math.max(a, byDate.get(c.date)!.volumeKg), 0);
    return { sessions, volumeKg, peak, streak: longestRunOfDays(new Set(days.map((c) => c.date))) };
  }, [cells, byDate]);

  const atCurrentMonth = cursor.year === now.getFullYear() && cursor.month === now.getMonth();
  const step = (delta: number) => {
    const d = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
    setSelected(null);
  };

  const selectedEntry = selected ? byDate.get(selected) : undefined;
  const vol = displayVolume(month.volumeKg, units);

  return (
    <View>
      <View style={styles.header}>
        <Pressable onPress={() => step(-1)} hitSlop={10} style={styles.arrow}>
          <Icon name="chevron_left" size={18} color={colors.textDim} strokeWidth={2.2} />
        </Pressable>
        <Text variant="title">
          {MONTHS[cursor.month]} {cursor.year !== now.getFullYear() ? cursor.year : ''}
        </Text>
        <Pressable
          onPress={() => step(1)}
          hitSlop={10}
          disabled={atCurrentMonth}
          style={[styles.arrow, atCurrentMonth && styles.arrowOff]}
        >
          <Icon name="chevron_right" size={18} color={colors.textDim} strokeWidth={2.2} />
        </Pressable>
      </View>

      <View style={styles.row}>
        {WEEKDAYS.map((d, i) => (
          <View key={i} style={styles.weekday}>
            <Text variant="caption" color={colors.textFaint} center>
              {d}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((c) => {
          const entry = c.inMonth ? byDate.get(c.date) : undefined;
          const intensity = entry && month.peak > 0 ? Math.min(1, entry.volumeKg / month.peak) : 0;
          // Floor the alpha so a light day is still clearly a trained day.
          const fill = entry ? `rgba(255,90,31,${(0.32 + intensity * 0.68).toFixed(2)})` : undefined;
          const isToday = c.date === today;
          const isSelected = c.date === selected;
          return (
            <Pressable
              key={c.date}
              style={styles.cell}
              disabled={!c.inMonth}
              onPress={() => setSelected(isSelected ? null : c.date)}
            >
              <View
                style={[
                  styles.day,
                  entry ? { backgroundColor: fill } : c.inMonth && styles.dayEmpty,
                  isToday && styles.today,
                  isSelected && styles.selected,
                ]}
              >
                <Text
                  variant="caption"
                  color={!c.inMonth ? colors.surfaceHigh : entry && intensity > 0.45 ? colors.onPrimary : colors.textDim}
                >
                  {c.day}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {selectedEntry ? (
        <Pressable
          style={styles.detail}
          onPress={() => router.push(`/workout/${selectedEntry.workouts[0]!.id}`)}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {selectedEntry.workouts.map((w) => w.name).join(' · ')}
            </Text>
            <Text variant="caption" color={colors.textDim}>
              {displayVolume(selectedEntry.volumeKg, units).value} {vol.unit} moved
              {selectedEntry.seconds > 0 ? ` · ${formatDurationShort(selectedEntry.seconds)}` : ''}
            </Text>
          </View>
          <Icon name="chevron_right" size={16} color={colors.textFaint} />
        </Pressable>
      ) : selected ? (
        <View style={styles.detail}>
          <Text variant="caption" color={colors.textFaint}>
            Rest day — nothing logged on {selected.slice(5)}.
          </Text>
        </View>
      ) : null}

      <View style={styles.summary}>
        <Text variant="caption" color={colors.textDim}>
          {month.sessions} {month.sessions === 1 ? 'session' : 'sessions'}
          {month.streak > 1 ? ` · ${month.streak}-day run` : ''}
        </Text>
        <Text variant="caption" color={colors.textDim}>
          {vol.value} {vol.unit} moved
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  arrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
  },
  arrowOff: { opacity: 0.35 },
  row: { flexDirection: 'row' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, paddingBottom: spacing.xs },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2.5 },
  day: {
    flex: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayEmpty: { backgroundColor: colors.surfaceHigh },
  today: { borderWidth: 1.5, borderColor: colors.lime },
  selected: { borderWidth: 1.5, borderColor: colors.text },
  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
  },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
});

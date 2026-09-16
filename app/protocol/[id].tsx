import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Screen, SectionHeader, StatTile, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { colors, radius, spacing } from '../../src/theme';
import { addDaysISO, formatDateWithWeekday, formatDayMonth, todayISO } from '../../src/domain/date';
import { FREQUENCY_LABEL } from '../../src/domain/protocol';
import { useProtocolStore } from '../../src/stores/useProtocolStore';

const WINDOW_OPTIONS = [30, 90] as const;

export default function ProtocolDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const protocol = useProtocolStore((s) => s.protocols.find((p) => p.id === id));
  const logs = useProtocolStore((s) => s.logsForProtocol(id ?? ''));
  const logDose = useProtocolStore((s) => s.logDose);
  const archive = useProtocolStore((s) => s.archiveProtocol);
  const remove = useProtocolStore((s) => s.removeProtocol);

  const [windowDays, setWindowDays] = useState<number>(30);
  const adherence = useProtocolStore((s) => s.adherence(id ?? '', windowDays));

  const today = todayISO();
  const byDate = useMemo(() => new Map(logs.map((l) => [l.date, l])), [logs]);
  const days = useMemo(
    () => Array.from({ length: windowDays }, (_, i) => addDaysISO(today, -(windowDays - 1 - i))),
    [windowDays, today],
  );

  if (!protocol) {
    return (
      <Screen gradient>
        <ScreenHeader title="Protocol" />
        <Text variant="body" color={colors.textDim}>
          This item is no longer in your tracker.
        </Text>
      </Screen>
    );
  }

  /** Plain text, because a personal record should be readable anywhere. */
  const exportLog = () => {
    const header = [
      protocol.name,
      `${protocol.dose ? `${protocol.dose} ${protocol.unit}` : protocol.unit} · ${FREQUENCY_LABEL[protocol.frequency]}`,
      `Started ${protocol.startedAt}`,
      '',
      'date,taken,dose,unit,time,notes',
    ].join('\n');
    const rows = logs.map((l) => [l.date, l.taken ? 'taken' : 'skipped', l.dose ?? '', l.unit, l.time, (l.notes ?? '').replace(/,/g, ';')].join(','));
    Share.share({ message: `${header}\n${rows.join('\n')}` }).catch(() => {});
  };

  const confirmDelete = () => {
    Alert.alert('Delete this record?', `${protocol.name} and its ${logs.length} log entries will be removed permanently.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          remove(protocol.id);
          router.back();
        },
      },
    ]);
  };

  const takenCount = logs.filter((l) => l.taken).length;
  const skippedCount = logs.filter((l) => !l.taken).length;

  return (
    <Screen gradient>
      <ScreenHeader title={protocol.name} />

      <Card tone="alt" style={{ marginBottom: spacing.md }}>
        <Text variant="caption" color={colors.textDim}>
          Your own records, shown back to you. Nothing here is a recommendation, and the app does not judge what you
          entered.
        </Text>
      </Card>

      <Card style={{ marginBottom: spacing.md }}>
        <Text variant="bodyStrong">
          {protocol.dose ? `${protocol.dose} ${protocol.unit}` : protocol.unit} · {FREQUENCY_LABEL[protocol.frequency]}
          {protocol.timeOfDay ? ` · ${protocol.timeOfDay}` : ''}
        </Text>
        <Text variant="caption" color={colors.textDim}>
          Started {formatDateWithWeekday(protocol.startedAt)}
          {protocol.active ? '' : ' · archived'}
        </Text>
        {protocol.notes ? (
          <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
            {protocol.notes}
          </Text>
        ) : null}
      </Card>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
        {WINDOW_OPTIONS.map((w) => (
          <Pressable key={w} onPress={() => setWindowDays(w)} style={[styles.window, windowDays === w && styles.windowOn]}>
            <Text variant="label" color={windowDays === w ? colors.onPrimary : colors.textDim}>
              {w} days
            </Text>
          </Pressable>
        ))}
      </View>

      <Card style={{ flexDirection: 'row', marginBottom: spacing.md }}>
        <StatTile
          value={adherence.ratio != null ? `${Math.round(adherence.ratio * 100)}%` : '—'}
          label={adherence.expected != null ? `of ${adherence.expected} due` : 'custom schedule'}
          accent={colors.primary}
        />
        <StatTile value={`${takenCount}`} label="Logged taken" accent={colors.success} />
        <StatTile value={`${skippedCount}`} label="Logged skipped" accent={colors.textDim} />
      </Card>

      <SectionHeader title={`Last ${windowDays} days`} />
      <Card>
        <View style={styles.grid}>
          {days.map((date) => {
            const log = byDate.get(date);
            const beforeStart = date < protocol.startedAt;
            return (
              <View
                key={date}
                style={[
                  styles.day,
                  beforeStart && styles.dayBefore,
                  log?.taken && styles.dayTaken,
                  log && !log.taken && styles.daySkipped,
                  date === today && styles.dayToday,
                ]}
              />
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm }}>
          <Text variant="caption" color={colors.textFaint}>
            {formatDayMonth(days[0]!)}
          </Text>
          <Text variant="caption" color={colors.textFaint}>
            {formatDayMonth(today)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md, flexWrap: 'wrap' }}>
          <Legend color={colors.success} label="Taken" />
          <Legend color={colors.warning} label="Skipped" />
          <Legend color={colors.surfaceHigh} label="Not logged" />
        </View>
      </Card>

      {protocol.active && (
        <>
          <SectionHeader title="Log a past day" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -spacing.xl }}
            contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.xl }}
          >
            {Array.from({ length: 7 }, (_, i) => addDaysISO(today, -i)).map((date) => {
              const log = byDate.get(date);
              return (
                <Pressable
                  key={date}
                  onPress={() => logDose(protocol.id, !log?.taken, date)}
                  style={[styles.quickDay, log?.taken && styles.quickDayOn]}
                >
                  <Text variant="caption" color={log?.taken ? colors.onPrimary : colors.textDim}>
                    {formatDayMonth(date)}
                  </Text>
                  <Icon
                    name={log?.taken ? 'check' : 'plus'}
                    size={13}
                    color={log?.taken ? colors.onPrimary : colors.textFaint}
                    strokeWidth={2.4}
                  />
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      )}

      <SectionHeader title={`History · ${logs.length} entries`} />
      {logs.length === 0 ? (
        <Text variant="caption" color={colors.textFaint}>
          Nothing logged yet.
        </Text>
      ) : (
        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          {logs.slice(0, 30).map((l, i) => (
            <View
              key={l.id}
              style={[styles.row, i < Math.min(logs.length, 30) - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
            >
              <Icon
                name={l.taken ? 'check' : 'clock'}
                size={15}
                color={l.taken ? colors.success : colors.textFaint}
                strokeWidth={2}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="label">{formatDateWithWeekday(l.date)}</Text>
                {l.notes ? (
                  <Text variant="caption" color={colors.textFaint}>
                    {l.notes}
                  </Text>
                ) : null}
              </View>
              <Text variant="caption" color={colors.textDim}>
                {l.taken ? (l.dose ? `${l.dose} ${l.unit}` : 'taken') : 'skipped'} · {l.time}
              </Text>
            </View>
          ))}
        </Card>
      )}

      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        <Button
          title="Export this record"
          variant="secondary"
          icon={<Icon name="download" size={16} color={colors.text} />}
          onPress={exportLog}
        />
        {protocol.active && (
          <Button title="Archive" variant="ghost" onPress={() => { archive(protocol.id); router.back(); }} />
        )}
        <Pressable onPress={confirmDelete} style={styles.delete} accessibilityRole="button">
          <Icon name="trash" size={15} color={colors.danger} strokeWidth={1.9} />
          <Text variant="label" color={colors.danger}>
            Delete this record
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text variant="caption" color={colors.textFaint}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  window: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
  },
  windowOn: { backgroundColor: colors.primary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  day: { width: 14, height: 14, borderRadius: 3, backgroundColor: colors.surfaceHigh },
  // Days before the start date are not misses; they are outside the record.
  dayBefore: { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  dayTaken: { backgroundColor: colors.success },
  daySkipped: { backgroundColor: colors.warning },
  dayToday: { borderWidth: 1.5, borderColor: colors.text },
  quickDay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
  },
  quickDayOn: { backgroundColor: colors.success },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  delete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
});

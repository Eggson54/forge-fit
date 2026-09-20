import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, EmptyState, Screen, SectionHeader, StatTile, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { FadeIn } from '../../src/components/anim';
import { Icon, type IconName } from '../../src/components/Icon';
import { colors, domainAccent, noOutline, radius, spacing } from '../../src/theme';
import { formatDateWithWeekday, lastNDays, todayISO } from '../../src/domain/date';
import { groupThousands, toKm } from '../../src/domain/units';
import {
  CARDIO_KINDS,
  cardioInWeek,
  cardioKind,
  displayDistance,
  formatCadence,
  readCardioWeek,
  totalCardio,
  type CardioSession,
  type CardioType,
} from '../../src/domain/cardio';
import { useLogStore } from '../../src/stores/useLogStore';
import { useProfileStore } from '../../src/stores/useProfileStore';

/**
 * Conditioning, logged by hand.
 *
 * Deliberately not part of the workout model: a run has no sets, and putting
 * it through the strength machinery would have meant null columns in the PR
 * check and the volume landmarks. It lives next to weight and sleep, which is
 * what it is — a thing you did today that is not lifting.
 */
export default function Cardio() {
  const units = useProfileStore((s) => s.profile.units);
  const sessions = useLogStore((s) => s.cardio);
  const logCardio = useLogStore((s) => s.logCardio);
  const removeCardio = useLogStore((s) => s.removeCardio);

  const [type, setType] = useState<CardioType>('run');
  const [minutes, setMinutes] = useState('');
  const [distance, setDistance] = useState('');

  const distanceUnit = units === 'imperial' ? 'mi' : 'km';
  const week = useMemo(() => lastNDays(7), []);
  const thisWeek = useMemo(() => cardioInWeek(sessions, week), [sessions, week]);
  const totals = useMemo(() => totalCardio(thisWeek), [thisWeek]);
  const reading = readCardioWeek(totals.minutes, totals.sessions);
  const weekDistance = displayDistance(totals.distanceKm, units);

  const mins = parseInt(minutes, 10);
  const dist = parseFloat(distance);
  const canSave = Number.isFinite(mins) && mins > 0;

  const save = () => {
    if (!canSave) return;
    logCardio({
      type,
      minutes: mins,
      distanceKm: Number.isFinite(dist) && dist > 0 ? toKm(dist, units) : undefined,
    });
    setMinutes('');
    setDistance('');
  };

  const confirmRemove = (session: CardioSession) => {
    Alert.alert('Delete this session?', `${cardioKind(session.type).label}, ${session.minutes} min.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeCardio(session.id) },
    ]);
  };

  return (
    <Screen gradient>
      <ScreenHeader title="Conditioning" subtitle="Everything that is not lifting" />

      <Card style={{ gap: spacing.lg, marginBottom: spacing.md }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {CARDIO_KINDS.map((k) => {
            const on = k.type === type;
            return (
              <Pressable
                key={k.type}
                onPress={() => setType(k.type)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={k.label}
                style={[styles.kind, on && styles.kindOn]}
              >
                <Icon name={k.icon as IconName} size={14} color={on ? colors.onPrimary : colors.textDim} />
                <Text variant="label" color={on ? colors.onPrimary : colors.textDim}>
                  {k.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Only where a distance is the normal thing to record — a distance
            box on an elliptical session is a field nobody can fill — and when
            it is absent, minutes takes the whole row rather than sitting at
            half width next to a gap. */}
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Field label="Minutes" value={minutes} onChange={setMinutes} placeholder="30" unit="min" />
          {cardioKind(type).distanceUsual && (
            <Field label="Distance" value={distance} onChange={setDistance} placeholder="5" unit={distanceUnit} />
          )}
        </View>

        <Button title="Log it" onPress={save} disabled={!canSave} />
      </Card>

      <SectionHeader title="This week" accent={domainAccent.progress} />
      <FadeIn>
        <Card style={{ gap: spacing.md, marginBottom: spacing.md }}>
          <View style={{ flexDirection: 'row' }}>
            <StatTile value={`${Math.round(totals.minutes)}`} label="Minutes" accent={colors.primary} />
            <StatTile value={`${totals.sessions}`} label="Sessions" accent={colors.steps} />
            <StatTile
              value={weekDistance ? `${weekDistance.value}` : '—'}
              label={weekDistance ? weekDistance.unit : 'no distance'}
              accent={colors.water}
            />
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: 'hidden' }}>
            <View style={{ width: `${reading.ratio * 100}%`, height: '100%', backgroundColor: colors.primary, borderRadius: 3 }} />
          </View>
          <Text variant="caption" color={colors.textDim}>
            {reading.detail}
          </Text>
          {totals.sessionsWithCalories > 0 && (
            <Text variant="caption" color={colors.textFaint}>
              {/* The hedge only belongs here when there is something to hedge
                  about — "3 of 3 sessions, the rest did not report one" was
                  apologising for a gap that did not exist. */}
              {groupThousands(totals.calories)} kcal
              {totals.sessionsWithCalories < totals.sessions
                ? `, from ${totals.sessionsWithCalories} of ${totals.sessions} sessions. The others did not report one, and the app will not guess.`
                : ', as the sessions themselves reported it. The app never estimates one.'}
            </Text>
          )}
        </Card>
      </FadeIn>

      <SectionHeader title={sessions.length ? `History · ${sessions.length}` : 'History'} accent={domainAccent.progress} />
      {sessions.length === 0 ? (
        <EmptyState
          icon="steps"
          title="Nothing logged yet"
          subtitle="Runs, rides, swims, rows and walks land here. Lifting stays on the Train tab."
        />
      ) : (
        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          {sessions.slice(0, 40).map((s, i) => (
            <Row
              key={s.id}
              session={s}
              units={units}
              last={i === Math.min(sessions.length, 40) - 1}
              onLongPress={() => confirmRemove(s)}
            />
          ))}
        </Card>
      )}

      <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
        Long-press a session to delete it. Connect Strava under Profile → Integrations to pull runs
        and rides in automatically instead.
      </Text>
      <Button
        title="Integrations"
        variant="ghost"
        onPress={() => router.push('/settings/integrations')}
        style={{ marginTop: spacing.md }}
      />
    </Screen>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  unit,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  placeholder: string;
  unit: string;
}) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
      <Text variant="caption" color={colors.textDim}>
        {label}
      </Text>
      <View style={styles.field}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          keyboardType="decimal-pad"
          accessibilityLabel={`${label} in ${unit}`}
          style={[styles.input, noOutline]}
          selectionColor={colors.primary}
        />
        <Text variant="caption" color={colors.textFaint}>
          {unit}
        </Text>
      </View>
    </View>
  );
}

function Row({
  session,
  units,
  last,
  onLongPress,
}: {
  session: CardioSession;
  units: 'imperial' | 'metric';
  last: boolean;
  onLongPress: () => void;
}) {
  const kind = cardioKind(session.type);
  const distance = displayDistance(session.distanceKm, units);
  const cadence = formatCadence(session, units);

  return (
    <Pressable
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${kind.label}, ${session.minutes} minutes on ${session.date}`}
      accessibilityHint="Long press to delete"
      style={[styles.row, !last && styles.divider]}
    >
      <Icon name={kind.icon as IconName} size={16} color={colors.textDim} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="label" numberOfLines={1}>
          {kind.label}
          {distance ? ` · ${distance.value} ${distance.unit}` : ''}
        </Text>
        <Text variant="caption" color={colors.textFaint} numberOfLines={1}>
          {session.date === todayISO() ? 'Today' : formatDateWithWeekday(session.date)}
          {session.source !== 'manual' ? ` · ${session.source}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text variant="bodyStrong" color={colors.primary}>
          {session.minutes}m
        </Text>
        {cadence && (
          <Text variant="caption" color={colors.textFaint}>
            {cadence}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  kind: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  kindOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  input: { flex: 1, minWidth: 0, color: colors.text, fontSize: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  divider: { borderBottomWidth: 0.5, borderBottomColor: colors.border },
});

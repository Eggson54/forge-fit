import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button, Card, EmptyState, LinearProgress, Pill, Screen, SectionHeader, Text } from '../src/components/ui';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { colors, spacing } from '../src/theme';
import {
  BAND_LABEL,
  SLEEP_MEDICAL_NOTE,
  SLEEP_SCORE_NOTE,
  SLEEP_STAGE_CAVEAT,
  formatHm,
  sleepScore,
  sleepTrend,
  type SleepNight,
} from '../src/domain/sleepScore';
import { health } from '../src/services/health';
import { addDaysISO, formatDayMonth, todayISO } from '../src/domain/date';
import { useLogStore } from '../src/stores/useLogStore';
import { useProfileStore } from '../src/stores/useProfileStore';

const WINDOW_DAYS = 14;

/**
 * The sleep score.
 *
 * Built to be argued with rather than believed: the weighting is printed on
 * the screen, every component shows what it was computed from, and anything
 * the device did not report is named rather than quietly counted as nought.
 * A score somebody cannot interrogate is a horoscope.
 */
export default function Sleep() {
  const target = useProfileStore((s) => s.targets?.sleepMinutes ?? 480);
  const logged = useLogStore((s) => s.sleep);

  const [nights, setNights] = useState<SleepNight[] | null>(null);
  const [source, setSource] = useState<'health' | 'logged' | 'none'>('none');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const today = todayISO();
    const dates = Array.from({ length: WINDOW_DAYS }, (_, i) => addDaysISO(today, -i));

    if (health.hasNativeModule) {
      const read = await Promise.all(dates.map((d) => health.readSleep(d)));
      const found = read.filter((n): n is NonNullable<typeof n> => n !== null);
      if (found.length > 0) {
        setNights(found);
        setSource('health');
        setLoading(false);
        return;
      }
    }

    // Fall back to what was typed in. Hours logged by hand carry no stages,
    // so the score runs on duration and consistency alone — and says so,
    // rather than pretending the rest were zero.
    const manual = logged
      .filter((s) => dates.includes(s.date) && s.minutes > 0)
      .map<SleepNight>((s) => ({ date: s.date, asleepMinutes: s.minutes }));

    setNights(manual);
    setSource(manual.length > 0 ? 'logged' : 'none');
    setLoading(false);
  }, [logged]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(
    () => [...(nights ?? [])].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [nights],
  );
  const latest = sorted[0] ?? null;
  const score = useMemo(
    () => (latest ? sleepScore(latest, { targetMinutes: target, recent: sorted }) : null),
    [latest, sorted, target],
  );
  const trend = useMemo(() => sleepTrend(sorted, { targetMinutes: target }), [sorted, target]);

  return (
    <Screen gradient>
      <ScreenHeader title="Sleep" subtitle="Last night, scored" />

      {loading && (
        <Text variant="caption" color={colors.textFaint}>
          Reading…
        </Text>
      )}

      {!loading && (!score || score.score == null) && (
        <EmptyState
          icon="moon"
          tint={colors.sleep}
          title="Nothing to score yet"
          subtitle={
            health.hasNativeModule
              ? 'No sleep in Apple Health for the last fortnight. A Watch, a Garmin, an Oura ring or anything else that writes sleep to Health will land here.'
              : 'Reading sleep needs a development build. Until then, hours you log by hand are scored on duration and consistency.'
          }
        />
      )}

      {!loading && score && score.score != null && (
        <View style={{ gap: spacing.md }}>
          <Card style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md }}>
              <Text variant="display" color={colors.sleep}>
                {score.score}
              </Text>
              <View style={{ flex: 1, paddingBottom: 6 }}>
                <Text variant="bodyStrong">{BAND_LABEL[score.band]}</Text>
                <Text variant="caption" color={colors.textFaint}>
                  {latest ? formatDayMonth(latest.date) : ''}
                  {source === 'logged' ? ' · from hours you logged' : ''}
                </Text>
              </View>
            </View>
            <Text variant="body" color={colors.textDim}>
              {score.read}
            </Text>
          </Card>

          <Card style={{ gap: spacing.md }}>
            <SectionHeader title="What made it up" />
            {score.components.map((c) => (
              <View key={c.key} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text variant="label" style={{ flex: 1 }}>
                    {c.label}
                  </Text>
                  <Text variant="caption" color={colors.textFaint}>
                    weight {c.weight}
                  </Text>
                  <Text variant="bodyStrong" color={c.score >= 70 ? colors.sleep : colors.warning}>
                    {c.score}
                  </Text>
                </View>
                <LinearProgress progress={c.score / 100} color={c.score >= 70 ? colors.sleep : colors.warning} />
                <Text variant="caption" color={colors.textFaint}>
                  {c.detail}
                </Text>
              </View>
            ))}

            {/* Named rather than hidden: a component that silently vanished
                would make the score look more complete than it is. */}
            {score.missing.length > 0 && (
              <Text variant="caption" color={colors.textDim}>
                Not scored, because this device did not report it:{' '}
                {score.missing.join(', ')}. The remaining weights were shared out to cover the gap.
              </Text>
            )}
          </Card>

          {trend.scored > 1 && (
            <Card style={{ gap: spacing.sm }}>
              <SectionHeader title={`Last ${trend.nights.length} nights`} />
              <View style={{ flexDirection: 'row', gap: spacing.lg }}>
                <View>
                  <Text variant="caption" color={colors.textFaint}>
                    Average score
                  </Text>
                  <Text variant="h3">{trend.average ?? '—'}</Text>
                </View>
                <View>
                  <Text variant="caption" color={colors.textFaint}>
                    Average asleep
                  </Text>
                  <Text variant="h3">
                    {trend.averageAsleepMinutes != null ? formatHm(trend.averageAsleepMinutes) : '—'}
                  </Text>
                </View>
                <View>
                  <Text variant="caption" color={colors.textFaint}>
                    Nights scored
                  </Text>
                  <Text variant="h3">{trend.scored}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                {trend.nights.map((n) => (
                  <Pill
                    key={n.date}
                    label={n.score == null ? '—' : String(n.score)}
                    color={n.score == null ? colors.textFaint : n.score >= 70 ? colors.sleep : colors.warning}
                  />
                ))}
              </View>
              <Text variant="caption" color={colors.textFaint}>
                A dash is a night with nothing recorded. It is left as a gap rather than averaged in as a bad night.
              </Text>
            </Card>
          )}

          <Card tone="alt" style={{ gap: spacing.sm }}>
            <Text variant="caption" color={colors.textDim}>
              {SLEEP_SCORE_NOTE}
            </Text>
            <Text variant="caption" color={colors.textDim}>
              {SLEEP_STAGE_CAVEAT}
            </Text>
            <Text variant="caption" color={colors.warning}>
              {SLEEP_MEDICAL_NOTE}
            </Text>
          </Card>

          <Button title="Refresh" variant="secondary" onPress={() => void load()} />
        </View>
      )}
    </Screen>
  );
}

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Chip, Input, Screen, SectionHeader, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { colors, spacing } from '../../src/theme';
import { formatDistance } from '../../src/domain/geo';
import { GPX_NOTE, isDuplicate, type ImportCandidate } from '../../src/domain/gpx';
import { gpxFiles } from '../../src/services/gpxFiles';
import { useActivityStore } from '../../src/stores/useActivityStore';
import { useGearStore } from '../../src/stores/useGearStore';
import { useProfileStore } from '../../src/stores/useProfileStore';

/**
 * Bringing a history in from somewhere else.
 *
 * The screen shows what it found *before* it saves anything, marks the ones
 * already here, and lets each be unticked. Importing a year of files and then
 * discovering forty duplicates is a far worse afternoon than reading a list.
 */
export default function ImportGpx() {
  const activities = useActivityStore((s) => s.activities);
  const save = useActivityStore((s) => s.save);
  const suggestGearFor = useGearStore((s) => s.suggestGearFor);
  const logUse = useGearStore((s) => s.logUse);
  const units = useProfileStore((s) => s.profile.units);

  const [found, setFound] = useState<ImportCandidate[] | null>(null);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [pasted, setPasted] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const accept = (candidates: ImportCandidate[], source: string) => {
    if (candidates.length === 0) {
      setMessage(`Nothing importable in ${source}. A GPX file with no track points, or one that only holds a planned route, has nothing to bring in.`);
      setFound(null);
      return;
    }
    setMessage(null);
    // Clear the last result, or a fresh list sits under a card announcing a
    // previous import and reads as if it had already happened.
    setImported(null);
    setFound(candidates);
    // Duplicates start unticked rather than hidden: somebody re-importing on
    // purpose should be able to see and override the decision.
    setSkip(new Set(candidates.map((c, i) => (isDuplicate(c, activities) ? i : -1)).filter((i) => i >= 0)));
  };

  const onPick = async () => {
    setBusy(true);
    try {
      const outcome = await gpxFiles.pick();
      if (outcome.kind === 'cancelled') return;
      if (outcome.kind !== 'ok') {
        setMessage(outcome.reason);
        return;
      }
      accept(gpxFiles.read(outcome.text), outcome.name);
    } finally {
      setBusy(false);
    }
  };

  const onImport = () => {
    if (!found) return;
    let count = 0;
    for (const [i, c] of found.entries()) {
      if (skip.has(i)) continue;
      const gear = suggestGearFor(c.type);
      const saved = save({
        type: c.type,
        points: c.points,
        name: c.name,
        date: c.date,
        gearId: gear?.id ?? null,
      });
      if (saved) {
        if (gear) logUse(gear.id, saved.id, saved.date, saved.distanceM);
        count += 1;
      }
    }
    setImported(count);
    setFound(null);
    setPasted('');
  };

  const keeping = found ? found.length - skip.size : 0;

  return (
    <Screen gradient>
      <ScreenHeader title="Import a route" subtitle="From a .gpx file" />

      {imported != null && (
        <Card style={{ gap: spacing.sm, borderColor: colors.success, borderWidth: StyleSheet.hairlineWidth }}>
          <Text variant="bodyStrong" color={colors.success}>
            {imported} {imported === 1 ? 'activity' : 'activities'} imported
          </Text>
          <Text variant="caption" color={colors.textDim}>
            Splits, best efforts and any segments they pass through were worked out on the way in.
          </Text>
          <Button title="See them" onPress={() => router.replace('/map')} />
        </Card>
      )}

      {!found && (
        <>
          <Card style={{ gap: spacing.md }}>
            <Text variant="body" color={colors.textDim}>
              Garmin, Strava, Wahoo, COROS, Polar and Suunto will all hand you a .gpx file for any activity, and a bulk
              export for all of them. No account here needs to talk to any of theirs.
            </Text>
            <Button title={busy ? 'Opening…' : 'Choose a .gpx file'} onPress={() => void onPick()} disabled={busy} />
          </Card>

          {message && (
            <Card style={{ marginTop: spacing.md, borderColor: colors.warning, borderWidth: StyleSheet.hairlineWidth }}>
              <Text variant="caption" color={colors.warning}>{message}</Text>
            </Card>
          )}

          <SectionHeader title="Or paste one" />
          <Card style={{ gap: spacing.md }}>
            <Input
              value={pasted}
              onChangeText={setPasted}
              placeholder="Paste the contents of a .gpx file"
              multiline
              numberOfLines={5}
            />
            <Button
              title="Read it"
              variant="secondary"
              disabled={pasted.trim().length === 0}
              onPress={() => accept(gpxFiles.read(pasted), 'that text')}
            />
            <Text variant="caption" color={colors.textFaint}>
              Useful in Expo Go, where choosing a file needs a development build.
            </Text>
          </Card>
        </>
      )}

      {found && (
        <>
          <Card style={{ gap: spacing.sm }}>
            <Text variant="bodyStrong">
              {found.length} {found.length === 1 ? 'activity' : 'activities'} found
            </Text>
            <Text variant="caption" color={colors.textDim}>
              {skip.size > 0
                ? skip.size === 1
                  ? 'One looks like something you already have, so it is unticked. Tap it to import anyway.'
                  : `${skip.size} look like ones you already have, so they are unticked. Tap any to import anyway.`
                : 'None of these match anything already here.'}
            </Text>
          </Card>

          <SectionHeader title="What was found" />
          {found.map((c, i) => {
            const on = !skip.has(i);
            return (
              <Card
                key={i}
                style={{ gap: 4, marginBottom: spacing.sm, opacity: on ? 1 : 0.55 }}
                onPress={() =>
                  setSkip((s) => {
                    const next = new Set(s);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    return next;
                  })
                }
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Icon name={on ? 'check' : 'close'} size={15} color={on ? colors.success : colors.textFaint} />
                  <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{c.name}</Text>
                  <Chip label={c.type} />
                </View>
                <Text variant="caption" color={colors.textDim}>
                  {c.date} · {formatDistance(c.distanceM, units)} · {c.minutes} min · {c.points.length} points
                </Text>
                {c.syntheticTime && (
                  <Text variant="caption" color={colors.amber}>
                    This file carried no timestamps, so its date is today and its pace is not real. Usually a planned
                    route rather than a recording.
                  </Text>
                )}
              </Card>
            );
          })}

          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            <Button title={`Import ${keeping}`} disabled={keeping === 0} onPress={onImport} />
            <Button title="Start over" variant="ghost" onPress={() => { setFound(null); setPasted(''); }} />
          </View>
        </>
      )}

      <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.xl }}>
        {GPX_NOTE}
      </Text>
    </Screen>
  );
}

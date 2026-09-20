import React, { useEffect, useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { Button, Card, Screen, SectionHeader, Text, Toggle } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, radius, spacing } from '../../src/theme';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { analytics } from '../../src/services/analytics';
import { health, type HealthMetric } from '../../src/services/health';
import { isCloudEnabled } from '../../src/services/supabase';
import { exportUserCsv, exportUserData } from '../../src/services/dataExport';
import { readImportFile, restoreFromExport } from '../../src/services/dataImport';
import { NOT_RESTORED } from '../../src/domain/restoreMap';
import type { ImportReport } from '../../src/domain/importShape';
import { formatDateWithWeekday } from '../../src/domain/date';

const HEALTH_METRICS: { key: HealthMetric; label: string }[] = [
  { key: 'steps', label: 'Steps' },
  { key: 'weight', label: 'Weight' },
  { key: 'sleep', label: 'Sleep' },
  { key: 'workouts', label: 'Workouts' },
  { key: 'heartRate', label: 'Heart rate' },
];

export default function Privacy() {
  const protocolEnabled = useProfileStore((s) => s.protocolFeatureEnabled);
  const [busy, setBusy] = useState<'json' | 'csv' | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [pendingDoc, setPendingDoc] = useState<unknown>(null);

  const doExport = async (format: 'json' | 'csv') => {
    setBusy(format);
    const ok = format === 'csv' ? await exportUserCsv() : await exportUserData();
    setBusy(null);
    if (!ok) Alert.alert('Export failed', 'Nothing was written. Try again in a moment.');
  };

  /**
   * Web only for now: a native file picker needs expo-document-picker, and
   * shipping a button that silently does nothing on a phone is worse than one
   * that says where it works.
   */
  const pickFile = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      Alert.alert(
        'Not available here yet',
        'Restoring from a file currently works in the web app. Your export is portable — open it there.',
      );
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const { report: r, doc } = readImportFile(String(reader.result ?? ''));
        setReport(r);
        setPendingDoc(r.ok ? doc : null);
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const confirmRestore = () => {
    if (!pendingDoc) return;
    Alert.alert(
      'Replace everything on this device?',
      'Your current workouts, food, weight and settings will be overwritten by the file. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          style: 'destructive',
          onPress: async () => {
            const result = await restoreFromExport(pendingDoc);
            setReport(null);
            setPendingDoc(null);
            Alert.alert(result.ok ? 'Restored' : 'Could not restore', result.message);
          },
        },
      ],
    );
  };
  const setProtocolEnabled = useProfileStore((s) => s.setProtocolFeatureEnabled);
  const [analyticsOn, setAnalyticsOn] = useState(true);
  const [healthAvailable, setHealthAvailable] = useState(false);

  useEffect(() => {
    health.isAvailable().then(setHealthAvailable);
  }, []);

  const requestHealth = async (metric: HealthMetric) => {
    const res = await health.requestPermissions([metric]);
    if (!res[metric]) {
      Alert.alert('Apple Health', healthAvailable ? 'Permission was not granted.' : 'Apple Health integration requires a native build. The app works fully without it.');
    }
  };

  return (
    <Screen gradient>
      <ScreenHeader title="Privacy & Data" />

      <Card tone="alt">
        <Text variant="bodyStrong" style={{ marginBottom: spacing.sm }}>
          How your data is handled
        </Text>
        <Bullet text={`Health & fitness data is treated as sensitive. ${isCloudEnabled() ? 'It syncs to your private, row-level-secured account.' : 'It stays on this device (offline mode).'}`} />
        <Bullet text="Stored locally: reminders, progress photos, drafts, and a cache of your logs." />
        <Bullet text="We never sell your health information and never use it to target ads." />
        <Bullet text="Analytics capture only coarse product events — never your weights, macros, doses, or photos." />
      </Card>

      <SectionHeader title="Product analytics" />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Share anonymous usage</Text>
            <Text variant="caption" color={colors.textDim}>
              Helps improve the app. No health data, ever.
            </Text>
          </View>
          <Toggle value={analyticsOn} onValueChange={(v) => { setAnalyticsOn(v); analytics.setEnabled(v); }} />
        </View>
      </Card>

      <SectionHeader title="Protocol tracker" />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Enable protocol tracking</Text>
            <Text variant="caption" color={colors.textDim}>
              Optional personal record-keeping. Hidden by default. Not medical advice.
            </Text>
          </View>
          <Toggle value={protocolEnabled} onValueChange={setProtocolEnabled} />
        </View>
      </Card>

      <SectionHeader title="Your data, out and back" />
      <Card style={{ gap: spacing.md }}>
        <View style={{ gap: 2 }}>
          <Text variant="bodyStrong">Export</Text>
          <Text variant="caption" color={colors.textDim}>
            JSON keeps everything and is the only format that can be restored. CSV opens in a spreadsheet and
            covers the tables you would actually chart.
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button
            title={busy === 'json' ? 'Working…' : 'JSON'}
            variant="secondary"
            onPress={() => doExport('json')}
            style={{ flex: 1 }}
          />
          <Button
            title={busy === 'csv' ? 'Working…' : 'CSV'}
            variant="secondary"
            onPress={() => doExport('csv')}
            style={{ flex: 1 }}
          />
        </View>

        <View style={{ height: 0.5, backgroundColor: colors.border }} />

        <View style={{ gap: 2 }}>
          <Text variant="bodyStrong">Restore</Text>
          <Text variant="caption" color={colors.textDim}>
            Reads a JSON export and replaces what is on this device. You will see exactly what the file contains
            before anything changes.
          </Text>
        </View>

        {report && (
          <View style={styles.reportBox}>
            {report.ok ? (
              <>
                <Text variant="bodyStrong">
                  {report.exportedAt ? `Exported ${formatDateWithWeekday(report.exportedAt)}` : 'Valid export'}
                </Text>
                {report.counts.map((c) => (
                  <View key={c.key} style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <Text variant="caption" color={colors.textDim} style={{ flex: 1, minWidth: 0 }}>
                      {c.label}
                    </Text>
                    <Text variant="caption" color={colors.text}>{c.records}</Text>
                  </View>
                ))}
                {NOT_RESTORED.map((row) => (
                  <Text key={row.what} variant="caption" color={colors.textFaint}>
                    {row.what} is not restored. {row.why}
                  </Text>
                ))}
                <Button title="Replace my data" onPress={confirmRestore} />
              </>
            ) : (
              <Text variant="caption" color={colors.warning}>{report.problems[0]}</Text>
            )}
          </View>
        )}

        <Button
          title={report ? 'Choose a different file' : 'Choose a file'}
          variant="ghost"
          onPress={pickFile}
        />
        <Text variant="caption" color={colors.textFaint}>
          Restoring never changes who is signed in, and never grants a subscription — a file is editable, so
          entitlement always comes from the app store.
        </Text>
      </Card>

      <SectionHeader title="Apple Health" />
      <Card>
        <Text variant="caption" color={colors.textDim} style={{ marginBottom: spacing.md }}>
          Grant access per metric — we never request more than a feature needs. The app works fully without Health.
        </Text>
        <View style={{ gap: spacing.sm }}>
          {HEALTH_METRICS.map((m) => (
            <View key={m.key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="body">{m.label}</Text>
              <Button title="Connect" size="sm" variant="ghost" fullWidth={false} onPress={() => requestHealth(m.key)} />
            </View>
          ))}
        </View>
      </Card>
    </Screen>
  );
}

const styles = {
  reportBox: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 0.5,
    borderColor: colors.border,
  },
};

function Bullet({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
      <Text color={colors.primary}>•</Text>
      <Text variant="caption" color={colors.textDim} style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

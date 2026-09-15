import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, EmptyState, Screen, SectionHeader, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, spacing } from '../../src/theme';
import { todayISO } from '../../src/domain/date';
import type { Protocol } from '../../src/domain/types';
import { useProtocolStore } from '../../src/stores/useProtocolStore';

export default function ProtocolHome() {
  const protocols = useProtocolStore((s) => s.protocols.filter((p) => p.active));

  return (
    <Screen gradient footer={<Button title="Add Protocol Entry" onPress={() => router.push('/protocol/add')} size="lg" />}>
      <ScreenHeader title="Protocol Tracker" />

      <Card tone="alt" style={{ marginBottom: spacing.lg }}>
        <Text variant="caption" color={colors.textDim}>
          This is a personal record-keeping tool only. ForgeFit does not provide medical advice and does not recommend
          doses, cycles, or protocols. Values here are entered by you. Consult a qualified healthcare professional for any
          medical decisions.
        </Text>
      </Card>

      {protocols.length === 0 ? (
        <EmptyState icon="bolt" title="Nothing tracked" subtitle="Add an item you want to keep a personal log and reminders for." />
      ) : (
        <View style={{ gap: spacing.md }}>
          {protocols.map((p) => (
            <ProtocolCard key={p.id} protocol={p} />
          ))}
        </View>
      )}

      {/* The history hint describes tapping an item, so it only belongs on screen
          once there is an item to tap. */}
      {protocols.length > 0 && (
        <>
          <SectionHeader title="History" />
          <Text variant="caption" color={colors.textFaint}>
            Tap any item to view its calendar history, adherence, and export your personal records.
          </Text>
        </>
      )}
    </Screen>
  );
}

function ProtocolCard({ protocol }: { protocol: Protocol }) {
  const logDose = useProtocolStore((s) => s.logDose);
  const adherence = useProtocolStore((s) => s.adherence(protocol.id));
  const logs = useProtocolStore((s) => s.logsForProtocol(protocol.id));
  const today = logs.find((l) => l.date === todayISO());

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">{protocol.name}</Text>
          <Text variant="caption" color={colors.textDim}>
            {protocol.dose ? `${protocol.dose} ${protocol.unit}` : protocol.unit} · {freqLabel(protocol.frequency)}
            {protocol.timeOfDay ? ` · ${protocol.timeOfDay}` : ''}
          </Text>
          {protocol.notes ? (
            <Text variant="caption" color={colors.textFaint} style={{ marginTop: 2 }}>
              {protocol.notes}
            </Text>
          ) : null}
        </View>
        <Text variant="metric" color={adherence >= 0.8 ? colors.success : colors.textDim}>
          {Math.round(adherence * 100)}%
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
        <Button
          title={today?.taken ? 'Logged ✓' : "Log today"}
          size="sm"
          variant={today?.taken ? 'ghost' : 'primary'}
          onPress={() => logDose(protocol.id, true)}
          style={{ flex: 1 }}
        />
        <Button title="Skip" size="sm" variant="ghost" onPress={() => logDose(protocol.id, false)} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

const freqLabel = (f: Protocol['frequency']) =>
  ({ daily: 'Daily', eod: 'Every other day', weekly: 'Weekly', '2x_week': '2×/week', '3x_week': '3×/week', custom: 'Custom' })[f];

import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Screen, SectionHeader, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon, type IconName } from '../../src/components/Icon';
import { colors, spacing } from '../../src/theme';
import { todayISO } from '../../src/domain/date';
import { FREQUENCY_LABEL } from '../../src/domain/protocol';
import type { Protocol } from '../../src/domain/types';
import { useProtocolStore } from '../../src/stores/useProtocolStore';

export default function ProtocolHome() {
  const protocols = useProtocolStore((s) => s.protocols.filter((p) => p.active));
  const archived = useProtocolStore((s) => s.protocols.filter((p) => !p.active));

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
        <>
          {/* A blank slate on a screen this sensitive is worse than useless: it
              leaves the user guessing at what the tool is for, and the honest
              answer is short enough to just say. */}
          <Card>
            <Text variant="h3" style={{ marginBottom: spacing.md }}>
              Nothing tracked yet
            </Text>
            <Capability icon="check" title="Keeps your own log" body="What you took, how much, and when — exactly as you enter it." />
            <Capability icon="bell" title="Reminds you" body="An optional nudge at the time of day you set." />
            <Capability icon="chart" title="Shows your history" body="A calendar of logged days and how it compares to the schedule you set." />
            <Capability icon="download" title="Exports on request" body="Your records, in plain text, whenever you want them." />
          </Card>

          <Card tone="alt" style={{ marginTop: spacing.md }}>
            <Text variant="overline" color={colors.textDim} style={{ marginBottom: spacing.sm }}>
              What it will never do
            </Text>
            <Text variant="caption" color={colors.textDim}>
              Suggest a compound, a dose, a cycle or a combination. Tell you to start, stop, raise or lower anything.
              Interpret how you feel. Those are decisions for you and a qualified healthcare professional.
            </Text>
          </Card>
        </>
      ) : (
        <View style={{ gap: spacing.md }}>
          {protocols.map((p) => (
            <ProtocolCard key={p.id} protocol={p} />
          ))}
        </View>
      )}

      {protocols.length > 0 && (
        <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.md }}>
          Tap any item for its full history, adherence against the schedule you set, and export.
        </Text>
      )}

      {archived.length > 0 && (
        <>
          <SectionHeader title="Archived" />
          <View style={{ gap: spacing.md }}>
            {archived.map((p) => (
              <ProtocolCard key={p.id} protocol={p} />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

function Capability({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
      <Icon name={icon} size={16} color={colors.primary} strokeWidth={1.9} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" color={colors.textDim}>
          {body}
        </Text>
      </View>
    </View>
  );
}

function ProtocolCard({ protocol }: { protocol: Protocol }) {
  const logDose = useProtocolStore((s) => s.logDose);
  const adherence = useProtocolStore((s) => s.adherence(protocol.id));
  const logs = useProtocolStore((s) => s.logsForProtocol(protocol.id));
  const today = logs.find((l) => l.date === todayISO());

  return (
    <Card onPress={() => router.push(`/protocol/${protocol.id}`)}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong">{protocol.name}</Text>
          <Text variant="caption" color={colors.textDim}>
            {protocol.dose ? `${protocol.dose} ${protocol.unit}` : protocol.unit} · {FREQUENCY_LABEL[protocol.frequency]}
            {protocol.timeOfDay ? ` · ${protocol.timeOfDay}` : ''}
          </Text>
          {protocol.notes ? (
            <Text variant="caption" color={colors.textFaint} style={{ marginTop: 2 }}>
              {protocol.notes}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {/* A 'custom' schedule has no implied number of doses, so there is
              nothing honest to take a percentage of — show the count instead. */}
          <Text variant="metric" color={adherence.ratio != null && adherence.ratio >= 0.8 ? colors.success : colors.textDim}>
            {adherence.ratio != null ? `${Math.round(adherence.ratio * 100)}%` : adherence.taken}
          </Text>
          <Text variant="caption" color={colors.textFaint}>
            {adherence.expected != null ? `of ${adherence.expected} · 30d` : 'logged · 30d'}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
        <Button
          title={today?.taken ? 'Logged ✓' : 'Log today'}
          size="sm"
          variant={today?.taken ? 'ghost' : 'primary'}
          onPress={() => logDose(protocol.id, true)}
          style={{ flex: 1 }}
        />
        <Button
          title={today && !today.taken ? 'Skipped' : 'Skip'}
          size="sm"
          variant="ghost"
          onPress={() => logDose(protocol.id, false)}
          style={{ flex: 1 }}
        />
      </View>
    </Card>
  );
}

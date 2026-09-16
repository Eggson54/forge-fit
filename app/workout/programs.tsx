import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Pill, Screen, Text } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { MuscleThumb } from '../../src/components/body/MuscleThumb';
import { Icon } from '../../src/components/Icon';
import { colors, radius, spacing } from '../../src/theme';
import { PROGRAMS } from '../../src/data/programs';
import type { Program } from '../../src/domain/program';
import { useProgramStore } from '../../src/stores/useProgramStore';

export default function Programs() {
  const enrolment = useProgramStore((s) => s.enrolment);
  const enrol = useProgramStore((s) => s.enrol);

  const choose = (program: Program) => {
    if (enrolment && enrolment.programId !== program.id) {
      Alert.alert(
        'Switch plans?',
        `You're partway through another plan. Starting ${program.name} begins from week one and your current progress is lost.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Switch',
            style: 'destructive',
            onPress: () => {
              enrol(program.id);
              router.replace('/workout/program');
            },
          },
        ],
      );
      return;
    }
    enrol(program.id);
    router.replace('/workout/program');
  };

  return (
    <Screen gradient>
      <ScreenHeader title="Training Plans" />

      <Card tone="alt" style={{ marginBottom: spacing.md }}>
        <Text variant="caption" color={colors.textDim}>
          Starting templates, not prescriptions. Swap exercises, skip days and change the weights — the plan adapts to
          you, not the other way round. Talk to a coach or a clinician before training around an injury.
        </Text>
      </Card>

      <View style={{ gap: spacing.md }}>
        {PROGRAMS.map((program) => {
          const current = enrolment?.programId === program.id;
          return (
            <Card key={program.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
                <Text variant="h3" style={{ flex: 1, minWidth: 0 }}>
                  {program.name}
                </Text>
                {current && <Pill label="Current" color={colors.success} />}
              </View>
              <Text variant="caption" color={colors.textDim}>
                {program.summary}
              </Text>

              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' }}>
                <Tag icon="calendar" label={`${program.weeks} weeks`} />
                <Tag icon="dumbbell" label={`${program.daysPerWeek}×/week`} />
                <Tag icon="target" label={program.experience} />
              </View>

              <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                {program.days.map((day) => (
                  <View key={day.index} style={styles.dayRow}>
                    <MuscleThumb muscle={day.focus[0] ?? 'full_body'} size={22} />
                    <Text variant="label" style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
                      {day.name}
                    </Text>
                    <Text variant="caption" color={colors.textFaint}>
                      {day.exercises.length} exercises
                    </Text>
                  </View>
                ))}
              </View>

              <Button
                title={current ? 'Open plan' : 'Start this plan'}
                variant={current ? 'secondary' : 'primary'}
                style={{ marginTop: spacing.md }}
                onPress={() => (current ? router.replace('/workout/program') : choose(program))}
              />
            </Card>
          );
        })}
      </View>

      <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
        Weekly progression is a suggested percentage on your own working weights. It never sets a weight for you — the
        logger fills those from what you actually lifted.
      </Text>
    </Screen>
  );
}

function Tag({ icon, label }: { icon: 'calendar' | 'dumbbell' | 'target'; label: string }) {
  return (
    <View style={styles.tag}>
      <Icon name={icon} size={12} color={colors.textDim} strokeWidth={1.9} />
      <Text variant="caption" color={colors.textDim} style={{ textTransform: 'capitalize' }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
  },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});

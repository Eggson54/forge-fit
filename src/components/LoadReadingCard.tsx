import React from 'react';
import { View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { Card, Text } from './ui';
import { Icon, type IconName } from './Icon';
import type { LoadReading, LoadVerdict, VolumeWeek } from '../domain/volumeTrend';

const TONE: Record<LoadVerdict, { color: string; icon: IconName; tag: string }> = {
  building: { color: colors.success, icon: 'chart', tag: 'BUILDING' },
  holding: { color: colors.textDim, icon: 'target', tag: 'STEADY' },
  backing_off: { color: colors.water, icon: 'chart', tag: 'LIGHTER' },
  deload_due: { color: colors.amber, icon: 'shield', tag: 'DELOAD DUE' },
  ramping_fast: { color: colors.amber, icon: 'bolt', tag: 'STEEP JUMP' },
  idle: { color: colors.textFaint, icon: 'clock', tag: 'NO DATA' },
};

/**
 * Eight weeks of working sets as bars, with a plain-language reading under it.
 *
 * Bars rather than a line because weekly volume is a count, not a continuous
 * quantity — and the current week is drawn hollow, since comparing a Tuesday
 * against finished weeks is exactly the mistake the reading is built to avoid.
 */
export function LoadReadingCard({
  series,
  reading,
  width,
}: {
  series: VolumeWeek[];
  reading: LoadReading;
  width: number;
}) {
  const tone = TONE[reading.verdict];
  const peak = Math.max(1, ...series.map((w) => w.sets));
  const gap = 6;
  const barW = Math.max(6, Math.floor((width - gap * (series.length - 1)) / series.length));

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap, height: 96 }}>
        {series.map((w, i) => {
          const current = i === series.length - 1;
          const h = Math.max(w.sets > 0 ? 4 : 2, Math.round((w.sets / peak) * 88));
          return (
            <View key={w.weekStart} style={{ width: barW, alignItems: 'center', gap: 4 }}>
              <Text variant="caption" color={colors.textFaint} style={{ fontSize: 10 }}>
                {w.sets > 0 ? w.sets : ''}
              </Text>
              <View
                style={{
                  width: barW,
                  height: h,
                  borderRadius: radius.sm,
                  backgroundColor: current ? 'transparent' : w.sets > 0 ? tone.color : colors.surface,
                  borderWidth: current ? 1.2 : 0,
                  borderColor: tone.color,
                  opacity: w.sets > 0 ? 1 : 0.45,
                }}
              />
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="caption" color={colors.textFaint}>8 weeks ago</Text>
        <Text variant="caption" color={colors.textFaint}>
          {reading.partialWeek ? 'this week (in progress)' : 'this week'}
        </Text>
      </View>

      <View style={{ height: 0.5, backgroundColor: colors.border }} />

      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: `${tone.color}22`,
          }}
        >
          <Icon name={tone.icon} size={15} color={tone.color} strokeWidth={1.8} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text variant="overline" color={tone.color}>{tone.tag}</Text>
          <Text variant="bodyStrong">{reading.headline}</Text>
          <Text variant="caption" color={colors.textDim}>{reading.detail}</Text>
        </View>
      </View>

      <Text variant="caption" color={colors.textFaint}>
        Working sets only — warm-ups and unfinished sets are not counted. General training guidance, not medical advice.
      </Text>
    </Card>
  );
}

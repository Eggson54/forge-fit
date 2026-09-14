import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import { colors, palette } from '../theme';
import type { MuscleGroup } from '../domain/types';
import { VOLUME_LANDMARKS, type MuscleVolume } from '../domain/volume';
import { Text } from './ui/Text';
import { FadeIn } from './anim';

/**
 * Original muscle "body map": stylized front + back figures whose muscle blocks
 * are tinted by weekly training volume (sets/muscle). Untrained muscles read
 * cool/grey; well-trained muscles glow ember. Not anyone else's art.
 */

const UNTRAINED = '#23242F';

function hexLerp(a: string, b: string, t: number): string {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const c = pa.map((x, i) => Math.round(x + (pb[i]! - x) * Math.max(0, Math.min(1, t))));
  return `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

function fillFor(muscle: MuscleGroup, volume: MuscleVolume): string {
  const sets = volume[muscle] ?? 0;
  if (sets <= 0) return UNTRAINED;
  const lm = VOLUME_LANDMARKS[muscle];
  const max = lm?.max ?? 20;
  const intensity = Math.min(1, sets / max);
  // Over the max tints toward amber to flag junk volume.
  if (lm && sets > lm.max) return palette.amber;
  return hexLerp(UNTRAINED, palette.ember, 0.25 + intensity * 0.75);
}

// Front-view muscle shapes (viewBox 0 0 100 210).
function FrontFigure({ volume }: { volume: MuscleVolume }) {
  const f = (m: MuscleGroup) => fillFor(m, volume);
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 210">
      {/* head + neck (neutral) */}
      <Circle cx={50} cy={16} r={9} fill={UNTRAINED} />
      <Rect x={46} y={23} width={8} height={6} fill={UNTRAINED} />
      {/* shoulders */}
      <Ellipse cx={31} cy={36} rx={9} ry={7} fill={f('shoulders')} />
      <Ellipse cx={69} cy={36} rx={9} ry={7} fill={f('shoulders')} />
      {/* chest */}
      <Path d="M39 34 Q50 32 50 32 L50 50 Q42 52 37 46 Q36 38 39 34 Z" fill={f('chest')} />
      <Path d="M61 34 Q50 32 50 32 L50 50 Q58 52 63 46 Q64 38 61 34 Z" fill={f('chest')} />
      {/* biceps */}
      <Ellipse cx={26} cy={52} rx={5.5} ry={11} fill={f('biceps')} />
      <Ellipse cx={74} cy={52} rx={5.5} ry={11} fill={f('biceps')} />
      {/* forearms */}
      <Ellipse cx={22} cy={72} rx={4.5} ry={10} fill={f('forearms')} />
      <Ellipse cx={78} cy={72} rx={4.5} ry={10} fill={f('forearms')} />
      {/* core */}
      <Rect x={42} y={52} width={16} height={26} rx={5} fill={f('core')} />
      {/* quads */}
      <Rect x={39} y={92} width={9} height={40} rx={5} fill={f('quads')} />
      <Rect x={52} y={92} width={9} height={40} rx={5} fill={f('quads')} />
      {/* calves */}
      <Ellipse cx={43} cy={158} rx={5} ry={14} fill={f('calves')} />
      <Ellipse cx={57} cy={158} rx={5} ry={14} fill={f('calves')} />
    </Svg>
  );
}

// Back-view muscle shapes.
function BackFigure({ volume }: { volume: MuscleVolume }) {
  const f = (m: MuscleGroup) => fillFor(m, volume);
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 210">
      <Circle cx={50} cy={16} r={9} fill={UNTRAINED} />
      <Rect x={46} y={23} width={8} height={6} fill={UNTRAINED} />
      {/* rear delts */}
      <Ellipse cx={31} cy={36} rx={9} ry={7} fill={f('shoulders')} />
      <Ellipse cx={69} cy={36} rx={9} ry={7} fill={f('shoulders')} />
      {/* back (traps/lats) */}
      <Path d="M40 34 L60 34 Q66 46 60 62 L50 68 L40 62 Q34 46 40 34 Z" fill={f('back')} />
      {/* triceps */}
      <Ellipse cx={26} cy={52} rx={5.5} ry={11} fill={f('triceps')} />
      <Ellipse cx={74} cy={52} rx={5.5} ry={11} fill={f('triceps')} />
      {/* forearms */}
      <Ellipse cx={22} cy={72} rx={4.5} ry={10} fill={f('forearms')} />
      <Ellipse cx={78} cy={72} rx={4.5} ry={10} fill={f('forearms')} />
      {/* glutes */}
      <Ellipse cx={44} cy={92} rx={7} ry={8} fill={f('glutes')} />
      <Ellipse cx={56} cy={92} rx={7} ry={8} fill={f('glutes')} />
      {/* hamstrings */}
      <Rect x={39} y={104} width={9} height={32} rx={5} fill={f('hamstrings')} />
      <Rect x={52} y={104} width={9} height={32} rx={5} fill={f('hamstrings')} />
      {/* calves */}
      <Ellipse cx={43} cy={158} rx={5} ry={14} fill={f('calves')} />
      <Ellipse cx={57} cy={158} rx={5} ry={14} fill={f('calves')} />
    </Svg>
  );
}

export function BodyMap({ volume }: { volume: MuscleVolume }) {
  return (
    <FadeIn from="none">
      <View>
        <View style={{ flexDirection: 'row', height: 220 }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <FrontFigure volume={volume} />
            <Text variant="caption" color={colors.textDim}>Front</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <BackFigure volume={volume} />
            <Text variant="caption" color={colors.textDim}>Back</Text>
          </View>
        </View>
        {/* legend */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8 }}>
          <LegendDot color={UNTRAINED} label="Untrained" />
          <LegendDot color={palette.ember} label="Trained" />
          <LegendDot color={palette.amber} label="High" />
        </View>
      </View>
    </FadeIn>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text variant="caption" color={colors.textDim}>{label}</Text>
    </View>
  );
}

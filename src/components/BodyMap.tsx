import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import { colors, palette } from '../theme';
import type { MuscleGroup } from '../domain/types';
import { VOLUME_LANDMARKS, type MuscleVolume } from '../domain/volume';
import { Text } from './ui/Text';
import { FadeIn } from './anim';

/**
 * Original anatomical muscle "body map": front + back figures whose muscle
 * groups are tinted by weekly training volume. Untrained reads cool graphite,
 * trained glows ember, over-target tints amber. Hand-built SVG — nobody's art.
 */

const UNTRAINED = '#262838';
const GROOVE = '#12131b';
const BASE = '#1d1f2b';

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
  if (lm && sets > lm.max) return palette.amber;
  return hexLerp(UNTRAINED, palette.ember, 0.35 + Math.min(1, sets / max) * 0.65);
}

// One-sided (x<75) muscle shapes, keyed by MuscleGroup; mirrored to the right.
const FRONT_LEFT: Partial<Record<MuscleGroup, string>> = {
  shoulders: 'M52,62 C40,62 32,74 33,88 C34,96 44,96 52,90 C56,82 58,68 52,62 Z',
  chest: 'M73,66 L73,98 C60,99 51,92 50,80 C49,70 58,63 73,66 Z',
  biceps: 'M44,92 C38,98 37,116 42,130 C48,133 55,127 55,113 L54,95 C52,91 47,90 44,92 Z',
  forearms: 'M42,132 C37,144 37,161 43,173 C48,176 54,172 55,161 L53,135 C50,130 45,130 42,132 Z',
  core: 'M72,104 C63,106 58,116 58,130 L66,146 L72,144 Z',
  quads: 'M74,180 C60,182 52,204 55,234 C58,254 67,260 74,256 L74,180 Z',
  calves: 'M72,266 C63,268 59,286 62,304 C65,314 71,314 74,310 L74,266 Z',
};
const BACK_LEFT: Partial<Record<MuscleGroup, string>> = {
  shoulders: 'M52,62 C40,62 32,74 33,88 C34,96 44,96 52,90 C56,82 58,68 52,62 Z',
  triceps: 'M44,92 C38,98 37,116 42,130 C48,133 55,127 55,113 L54,95 C52,91 47,90 44,92 Z',
  forearms: 'M42,132 C37,144 37,161 43,173 C48,176 54,172 55,161 L53,135 C50,130 45,130 42,132 Z',
  back: 'M73,74 L73,132 C60,130 52,116 52,96 C52,84 60,74 73,74 Z',
  glutes: 'M74,176 C62,176 55,188 56,202 C58,214 68,216 74,210 Z',
  hamstrings: 'M74,212 C62,212 55,232 57,256 C59,272 68,276 74,272 L74,212 Z',
  calves: 'M72,278 C63,280 59,296 62,312 C65,320 71,320 74,316 L74,278 Z',
};

const BASE_PATHS = [
  'M67,45 C68,55 82,55 83,45 L83,60 C80,62 70,62 67,60 Z', // neck
  'M44,62 C38,64 34,150 43,174 L56,174 C59,120 61,70 56,62 Z', // left arm
  'M106,62 C112,64 116,150 107,174 L94,174 C91,120 89,70 94,62 Z', // right arm
  'M48,60 C46,60 48,150 55,178 L95,178 C102,150 104,60 102,60 C90,54 60,54 48,60 Z', // torso
  'M53,176 C49,220 55,280 58,322 L72,322 C74,250 74,200 75,178 Z', // left leg
  'M97,176 C101,220 95,280 92,322 L78,322 C76,250 76,200 75,178 Z', // right leg
];

function Figure({ left, volume, front }: { left: Partial<Record<MuscleGroup, string>>; volume: MuscleVolume; front: boolean }) {
  const muscles = Object.entries(left) as [MuscleGroup, string][];
  const paint = (mirror: boolean) =>
    muscles.map(([m, d]) => (
      <Path key={m + (mirror ? 'r' : 'l')} d={d} fill={fillFor(m, volume)} stroke={GROOVE} strokeWidth={1.1} transform={mirror ? 'translate(150,0) scale(-1,1)' : undefined} />
    ));

  return (
    <Svg width="100%" height="100%" viewBox="0 0 150 340">
      {/* base silhouette */}
      <G fill={BASE}>
        <Circle cx={75} cy={30} r={20} />
        {BASE_PATHS.map((d, i) => (
          <Path key={i} d={d} />
        ))}
      </G>
      {/* muscles */}
      {paint(false)}
      {paint(true)}
      {/* centered muscles */}
      {front ? (
        <>
          <Path d="M62,50 C66,46 84,46 88,50 L86,58 C80,54 70,54 64,58 Z" fill={fillFor('shoulders', volume)} stroke={GROOVE} strokeWidth={1.1} />
          <Path d="M66,100 C66,96 84,96 84,100 L84,150 C84,156 66,156 66,150 Z" fill={fillFor('core', volume)} stroke={GROOVE} strokeWidth={1.1} />
          <G stroke={GROOVE} strokeWidth={1.1}>
            <Line x1={75} y1={100} x2={75} y2={150} />
            <Line x1={66} y1={117} x2={84} y2={117} />
            <Line x1={67} y1={133} x2={83} y2={133} />
          </G>
        </>
      ) : (
        <>
          <Path d="M60,48 C66,42 84,42 90,48 L84,72 C80,64 70,64 66,72 Z" fill={fillFor('back', volume)} stroke={GROOVE} strokeWidth={1.1} />
          <Path d="M66,134 C66,130 84,130 84,134 L82,168 C80,158 70,158 68,168 Z" fill={fillFor('back', volume)} stroke={GROOVE} strokeWidth={1.1} />
        </>
      )}
    </Svg>
  );
}

export function BodyMap({ volume }: { volume: MuscleVolume }) {
  return (
    <FadeIn from="none">
      <View>
        <View style={{ flexDirection: 'row', height: 240 }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Figure left={FRONT_LEFT} volume={volume} front />
            <Text variant="caption" color={colors.textDim}>Front</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Figure left={BACK_LEFT} volume={volume} front={false} />
            <Text variant="caption" color={colors.textDim}>Back</Text>
          </View>
        </View>
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

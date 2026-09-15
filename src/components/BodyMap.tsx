import React from 'react';
import { View } from 'react-native';
import Svg, { ClipPath, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { colors, palette } from '../theme';
import type { MuscleGroup } from '../domain/types';
import { VOLUME_LANDMARKS, type MuscleVolume } from '../domain/volume';
import { Text } from './ui/Text';
import { FadeIn, useCountUp } from './anim';

/**
 * Original anatomical muscle "body map": front + back figures whose muscle
 * groups are tinted by weekly training volume. Untrained reads cool graphite,
 * trained glows ember, over-target tints amber. Hand-built SVG — nobody's art.
 */

const UNTRAINED = '#2f3244';
const GROOVE = '#12131c';
const BASE = '#272a3a';

function hexLerp(a: string, b: string, t: number): string {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const c = pa.map((x, i) => Math.round(x + (pb[i]! - x) * Math.max(0, Math.min(1, t))));
  return `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

// Heat ramp: deep ember -> ember -> hot amber. Never mixes through grey, which
// would read as muddy brown at mid intensities.
const HEAT_LOW = '#5C2612';
const HEAT_MID = '#E7430C';
const HEAT_HIGH = '#FF9A3D';

function fillFor(muscle: MuscleGroup, volume: MuscleVolume, charge = 1): string {
  const sets = (volume[muscle] ?? 0) * charge;
  if (sets <= 0) return UNTRAINED;
  const lm = VOLUME_LANDMARKS[muscle];
  const max = lm?.max ?? 20;
  if (lm && sets > lm.max) return palette.amber;
  // Give even a single set a visible floor, then ramp to the weekly max.
  const t = Math.min(1, 0.22 + (sets / max) * 0.78);
  return t < 0.5 ? hexLerp(HEAT_LOW, HEAT_MID, t / 0.5) : hexLerp(HEAT_MID, HEAT_HIGH, (t - 0.5) / 0.5);
}

const HEAD = 'M75,12 m-17,18 a17,18 0 1,0 34,0 a17,18 0 1,0 -34,0';
const BASE_PATHS = [
  'M68,46 C69,55 81,55 82,46 L82,62 C79,65 71,65 68,62 Z',
  'M48,62 C40,70 36,100 35,128 C34,156 33,176 35,194 L50,194 C50,174 51,152 52,128 C53,100 55,74 57,64 Z',
  'M102,62 C110,70 114,100 115,128 C116,156 117,176 115,194 L100,194 C100,174 99,152 98,128 C97,100 95,74 93,64 Z',
  'M48,62 C44,86 57,112 59,140 C60,158 57,172 57,186 L93,186 C93,172 90,158 91,140 C93,112 106,86 102,62 C88,55 62,55 48,62 Z',
  'M57,184 C53,212 56,240 59,264 C57,288 61,308 63,330 L73,330 C74,302 74,282 74,264 C75,232 75,206 75,186 Z',
  'M93,184 C97,212 94,240 91,264 C93,288 89,308 87,330 L77,330 C76,302 76,282 76,264 C75,232 75,206 75,186 Z',
];

const ARM = {
  upper: 'M52,100 C41,100 34,116 35,136 C37,148 47,150 53,142 L55,104 Z',
  fore: 'M35,140 C31,152 31,170 34,188 C40,193 48,190 49,180 L52,144 Z',
  delt: 'M56,62 C44,60 35,72 34,90 C34,100 44,104 52,99 C58,90 60,68 56,62 Z',
  calf: 'M75,266 C61,268 55,288 58,308 C61,324 70,327 75,320 Z',
};

const FRONT_LEFT: Partial<Record<MuscleGroup, string>> = {
  shoulders: ARM.delt,
  chest: 'M74,62 L74,102 C62,104 51,96 50,82 C49,69 59,58 74,62 Z',
  biceps: ARM.upper,
  forearms: ARM.fore,
  core: 'M73,103 C62,106 56,120 57,138 C58,150 64,158 71,156 L73,150 Z',
  quads: 'M75,186 C60,186 54,208 56,238 C58,258 68,264 75,259 Z',
  calves: ARM.calf,
};
const FRONT_CENTER: Partial<Record<MuscleGroup, string>> = {
  shoulders: 'M60,52 C67,44 83,44 90,52 L86,63 C80,56 70,56 64,63 Z',
  core: 'M64,99 C64,95 86,95 86,99 L84,156 C82,163 68,163 66,156 Z',
};
const BACK_LEFT: Partial<Record<MuscleGroup, string>> = {
  shoulders: ARM.delt,
  triceps: ARM.upper,
  forearms: ARM.fore,
  back: 'M74,70 L74,138 C59,135 50,118 50,96 C50,80 60,68 74,70 Z',
  glutes: 'M75,182 C61,182 54,194 55,210 C57,224 68,227 75,218 Z',
  hamstrings: 'M75,220 C61,220 54,240 56,262 C58,278 68,282 75,276 Z',
  calves: ARM.calf,
};
// Back centre pieces are both "back" (traps + erectors) so they share a tint.
const BACK_CENTER = [
  'M58,50 C67,42 83,42 92,50 L85,80 C79,67 71,67 65,80 Z',
  'M67,140 C67,136 83,136 83,140 L81,172 C78,162 72,162 69,172 Z',
];

function Figure({ volume, front, charge }: { volume: MuscleVolume; front: boolean; charge: number }) {
  const id = front ? 'f' : 'b';
  const left = front ? FRONT_LEFT : BACK_LEFT;
  const muscles = Object.entries(left) as [MuscleGroup, string][];
  const paint = (mirror: boolean) =>
    muscles.map(([m, d]) => (
      <Path
        key={m + (mirror ? 'r' : 'l')}
        d={d}
        fill={fillFor(m, volume, charge)}
        stroke={GROOVE}
        strokeWidth={1.1}
        strokeLinejoin="round"
        transform={mirror ? 'translate(150,0) scale(-1,1)' : undefined}
      />
    ));

  return (
    <Svg width="100%" height="100%" viewBox="0 0 150 345">
      <Defs>
        <LinearGradient id={`sh${id}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#000" stopOpacity="0.30" />
          <Stop offset="0.14" stopColor="#000" stopOpacity="0" />
          <Stop offset="0.86" stopColor="#000" stopOpacity="0" />
          <Stop offset="1" stopColor="#000" stopOpacity="0.30" />
        </LinearGradient>
        <LinearGradient id={`hi${id}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#fff" stopOpacity="0.13" />
          <Stop offset="0.4" stopColor="#fff" stopOpacity="0" />
        </LinearGradient>
        <ClipPath id={`cl${id}`}>
          <Path d={HEAD} />
          {BASE_PATHS.map((d, i) => (
            <Path key={i} d={d} />
          ))}
        </ClipPath>
      </Defs>

      {/* body base */}
      <G fill={BASE}>
        <Path d={HEAD} />
        {BASE_PATHS.map((d, i) => (
          <Path key={i} d={d} />
        ))}
      </G>

      {/* muscles, mirrored for the right side */}
      {paint(false)}
      {paint(true)}

      {front ? (
        <>
          {(Object.entries(FRONT_CENTER) as [MuscleGroup, string][]).map(([m, d]) => (
            <Path key={m} d={d} fill={fillFor(m, volume, charge)} stroke={GROOVE} strokeWidth={1.1} strokeLinejoin="round" />
          ))}
          <G stroke={GROOVE} strokeWidth={1.1} strokeLinecap="round" opacity={0.85}>
            <Line x1={75} y1={102} x2={75} y2={152} />
            <Line x1={65} y1={118} x2={85} y2={118} />
            <Line x1={66} y1={135} x2={84} y2={135} />
          </G>
        </>
      ) : (
        BACK_CENTER.map((d, i) => (
          <Path key={i} d={d} fill={fillFor('back', volume, charge)} stroke={GROOVE} strokeWidth={1.1} strokeLinejoin="round" />
        ))
      )}

      {/* roundness: edge falloff + top light, clipped to the body */}
      <G clipPath={`url(#cl${id})`}>
        <Rect width="150" height="345" fill={`url(#sh${id})`} />
        <Rect width="150" height="345" fill={`url(#hi${id})`} />
      </G>
    </Svg>
  );
}

export function BodyMap({ volume }: { volume: MuscleVolume }) {
  // Muscles "charge up" from cold to their trained heat when the map appears.
  const charge = useCountUp(1, 1100);
  return (
    <FadeIn from="none">
      <View>
        <View style={{ flexDirection: 'row', height: 250 }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Figure volume={volume} front charge={charge} />
            <Text variant="caption" color={colors.textDim}>Front</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Figure volume={volume} front={false} charge={charge} />
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

import React from 'react';
import { View } from 'react-native';
import Svg, { ClipPath, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { colors, palette } from '../theme';
import type { MuscleGroup } from '../domain/types';
import { VOLUME_LANDMARKS, type MuscleVolume } from '../domain/volume';
import {
  BACK_CENTRE,
  BACK_SIDE,
  BASE,
  FRONT_CENTRE,
  FRONT_SIDE,
  GROOVE,
  SIL_CENTRE,
  SIL_MIRROR,
  UNTRAINED,
} from './body/geometry';
import { Text } from './ui/Text';
import { FadeIn, useCountUp } from './anim';

/**
 * Anatomical muscle "body map": front + back figures whose muscle groups are
 * tinted by weekly training volume. Untrained reads cool graphite, trained glows
 * ember, over-target tints amber. The figure geometry lives in body/geometry.ts
 * and is shared with the per-exercise thumbnails.
 */

// Heat ramp: deep ember -> ember -> hot amber. Never mixes through grey, which
// would read as muddy brown at mid intensities.
const HEAT_LOW = '#5C2612';
const HEAT_MID = '#E7430C';
const HEAT_HIGH = '#FF9A3D';

function hexLerp(a: string, b: string, t: number): string {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const c = pa.map((x, i) => Math.round(x + (pb[i]! - x) * Math.max(0, Math.min(1, t))));
  return `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

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

function Figure({ volume, front, charge }: { volume: MuscleVolume; front: boolean; charge: number }) {
  const id = front ? 'f' : 'b';
  const side = front ? FRONT_SIDE : BACK_SIDE;
  const centre = front ? FRONT_CENTRE : BACK_CENTRE;

  const muscle = (m: MuscleGroup, d: string, key: string, mirror: boolean) => (
    <Path
      key={key}
      d={d}
      fill={fillFor(m, volume, charge)}
      stroke={GROOVE}
      strokeWidth={0.9}
      strokeLinejoin="round"
      transform={mirror ? 'translate(150,0) scale(-1,1)' : undefined}
    />
  );

  return (
    <Svg width="100%" height="100%" viewBox="0 0 150 330">
      <Defs>
        <LinearGradient id={`sh${id}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#000" stopOpacity="0.34" />
          <Stop offset="0.2" stopColor="#000" stopOpacity="0" />
          <Stop offset="0.8" stopColor="#000" stopOpacity="0" />
          <Stop offset="1" stopColor="#000" stopOpacity="0.34" />
        </LinearGradient>
        <LinearGradient id={`hi${id}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#fff" stopOpacity="0.12" />
          <Stop offset="0.45" stopColor="#fff" stopOpacity="0" />
        </LinearGradient>
        <ClipPath id={`cl${id}`}>
          {SIL_CENTRE.map((d, i) => (
            <Path key={`c${i}`} d={d} />
          ))}
          {SIL_MIRROR.map((d, i) => (
            <Path key={`m${i}`} d={d} />
          ))}
          {SIL_MIRROR.map((d, i) => (
            <Path key={`r${i}`} d={d} transform="translate(150,0) scale(-1,1)" />
          ))}
        </ClipPath>
      </Defs>

      {/* Silhouette. A dark hairline keeps the arm readable against the ribcage. */}
      <G fill={BASE} stroke={GROOVE} strokeWidth={0.9} strokeLinejoin="round">
        {SIL_CENTRE.map((d, i) => (
          <Path key={`c${i}`} d={d} />
        ))}
        {SIL_MIRROR.map((d, i) => (
          <Path key={`m${i}`} d={d} />
        ))}
        {SIL_MIRROR.map((d, i) => (
          <Path key={`r${i}`} d={d} transform="translate(150,0) scale(-1,1)" />
        ))}
      </G>

      {/* Muscles: centre pieces first, then both mirrored halves over them. */}
      {centre.map(([m, d], i) => muscle(m, d, `k${i}`, false))}
      {side.map(([m, d], i) => muscle(m, d, `l${i}`, false))}
      {side.map(([m, d], i) => muscle(m, d, `r${i}`, true))}

      {/* Abdominal separations, drawn only on the front. */}
      {front && (
        <G stroke={GROOVE} strokeWidth={0.9} strokeLinecap="round" opacity={0.8}>
          <Line x1={75} y1={102} x2={75} y2={138} />
          <Line x1={66} y1={113} x2={84} y2={113} />
          <Line x1={66.6} y1={125} x2={83.4} y2={125} />
        </G>
      )}

      {/* Roundness: edge falloff + top light, clipped to the body. */}
      <G clipPath={`url(#cl${id})`} pointerEvents="none">
        <Rect width="150" height="330" fill={`url(#sh${id})`} />
        <Rect width="150" height="330" fill={`url(#hi${id})`} />
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
        <View style={{ flexDirection: 'row', height: 260 }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Figure volume={volume} front charge={charge} />
            <Text variant="caption" color={colors.textDim}>
              Front
            </Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Figure volume={volume} front={false} charge={charge} />
            <Text variant="caption" color={colors.textDim}>
              Back
            </Text>
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
      <Text variant="caption" color={colors.textDim}>
        {label}
      </Text>
    </View>
  );
}

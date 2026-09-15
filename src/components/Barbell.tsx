import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../theme';
import type { PlatePlan } from '../domain/plates';
import { Text } from './ui/Text';

/**
 * A loaded barbell, drawn from the plan: knurled shaft, inner collars, then the
 * plates stacked outward along each sleeve exactly as they go on in the rack.
 * Plate height scales with denomination so the stack is recognisable without
 * reading six numbers, and the colours follow the usual competition coding.
 */
const PLATE_COLORS: Record<string, string> = {
  '45': '#E23B2E',
  '35': '#2F7FE0',
  '25': '#3DA35D',
  '20': '#E23B2E',
  '15': '#E0A020',
  '10': '#E0A020',
  '7': '#8E93A6',
  '5': '#C9CEDC',
  '2.5': '#8E93A6',
  '1.25': '#6E7386',
};

const H = 120;
const SHAFT_HALF = 44; // half-length of the knurled centre section
const COLLAR_W = 7;
const MAX_PLATE_H = 92;

export function Barbell({ plan, width = 330 }: { plan: PlatePlan; width?: number }) {
  const cy = H / 2;
  const cx = width / 2;
  const maxPlate = Math.max(...plan.perSide.map((p) => p.weight), 1);
  const flat = plan.perSide.flatMap((p) => Array.from({ length: p.count }, () => p.weight));

  // The sleeve is whatever is left after the shaft and a little end margin, so
  // a heavily loaded bar packs its plates thinner rather than running off-canvas.
  const sleeve = Math.max(24, cx - SHAFT_HALF - COLLAR_W - 14);
  const slot = flat.length ? Math.min(15, sleeve / flat.length) : 0;
  const thickness = Math.max(4, slot - 1.5);
  const stackEnd = SHAFT_HALF + COLLAR_W + flat.length * slot;

  const plate = (w: number, i: number, mirror: boolean) => {
    const h = 30 + (w / maxPlate) * (MAX_PLATE_H - 30);
    const offset = SHAFT_HALF + COLLAR_W + i * slot;
    const x = mirror ? cx + offset : cx - offset - thickness;
    return (
      <Rect
        key={`${mirror ? 'r' : 'l'}${i}`}
        x={x}
        y={cy - h / 2}
        width={thickness}
        height={h}
        rx={2.5}
        fill={PLATE_COLORS[String(w)] ?? colors.textDim}
        stroke="#0D0E14"
        strokeWidth={1}
      />
    );
  };

  const collar = (mirror: boolean) => (
    <Rect
      key={mirror ? 'cr' : 'cl'}
      x={mirror ? cx + SHAFT_HALF : cx - SHAFT_HALF - COLLAR_W}
      y={cy - 11}
      width={COLLAR_W}
      height={22}
      rx={2}
      fill="#6F7488"
    />
  );

  return (
    <View style={{ width, height: H }}>
      <Svg width={width} height={H}>
        <Defs>
          <LinearGradient id="barsteel" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#9AA0B4" />
            <Stop offset="0.45" stopColor="#D7DBE6" />
            <Stop offset="1" stopColor="#7E8498" />
          </LinearGradient>
        </Defs>

        {/* Shaft, running the full width so the sleeves show past the plates. */}
        <Rect x={8} y={cy - 4} width={width - 16} height={8} rx={4} fill="url(#barsteel)" />
        {/* Knurled centre reads slightly darker than the sleeves. */}
        <Rect x={cx - SHAFT_HALF} y={cy - 5} width={SHAFT_HALF * 2} height={10} rx={5} fill="#8A90A6" />

        {collar(false)}
        {collar(true)}

        {flat.map((w, i) => plate(w, i, false))}
        {flat.map((w, i) => plate(w, i, true))}

        {/* End caps, pushed just past the outermost plate. */}
        <Rect x={Math.max(4, cx - stackEnd - 9)} y={cy - 7} width={6} height={14} rx={2} fill="#6F7488" />
        <Rect x={Math.min(width - 10, cx + stackEnd + 3)} y={cy - 7} width={6} height={14} rx={2} fill="#6F7488" />
      </Svg>

      {plan.perSide.length === 0 && (
        <Text variant="caption" color={colors.textFaint} center style={{ marginTop: -H / 2 + 30 }}>
          Just the bar
        </Text>
      )}
    </View>
  );
}

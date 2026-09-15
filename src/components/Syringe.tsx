import React, { useRef, useState } from 'react';
import { PanResponder, Pressable, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, G, Line, LinearGradient as SvgGrad, Path, Rect, Stop } from 'react-native-svg';
import { colors, palette, spacing } from '../theme';
import { Text } from './ui/Text';

/**
 * Interactive syringe dose helper. This is a VISUAL INPUT AID only — it does not
 * suggest, recommend, or validate any dose. The user drags the plunger (or uses
 * the steppers) to record the amount they are logging. All safety disclaimers in
 * the protocol tracker still apply.
 *
 * The needle points left so that dragging right raises the dose and the liquid
 * column grows in the same direction: a needle-right syringe would have to draw
 * the plunger leftwards as the dose goes up, which fights the gesture.
 */
interface Props {
  value: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

const H = 92; // canvas height
const CY = 44; // barrel centre line
const BH = 34; // barrel height
const NEEDLE_X = 6; // tip
const HUB_X = 34;
const BX0 = 48; // barrel start
const ROD = 30; // plunger rod length
const PAD_W = 9; // thumb pad width

export function Syringe({ value, max = 100, step = 0.5, unit = 'units', onChange }: Props) {
  const [w, setW] = useState(320);
  const bx1 = Math.max(BX0 + 60, w - (ROD + PAD_W + 10));
  const travel0 = BX0 + 8;
  const travel1 = bx1 - 8;
  const usable = Math.max(1, travel1 - travel0);
  const fraction = Math.max(0, Math.min(1, value / max));
  const plungerX = travel0 + fraction * usable;
  const padX = Math.max(plungerX + 22, bx1 + 8);

  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  const setFromX = (x: number) => {
    const frac = Math.max(0, Math.min(1, (x - travel0) / usable));
    const snapped = Math.round((frac * max) / step) * step;
    onChange(Math.max(0, Math.min(max, Math.round(snapped * 100) / 100)));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setFromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => setFromX(e.nativeEvent.locationX),
    }),
  ).current;

  const gid = React.useId();
  const top = CY - BH / 2;
  const nudge = (d: number) => onChange(Math.max(0, Math.min(max, Math.round((value + d) * 100) / 100)));

  return (
    <View style={{ gap: spacing.md }}>
      <View onLayout={onLayout} {...pan.panHandlers} style={{ height: H }} accessibilityLabel="Dose slider">
        <Svg width={w} height={H}>
          <Defs>
            <SvgGrad id={`liq${gid}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={palette.amber} />
              <Stop offset="1" stopColor={palette.ember} />
            </SvgGrad>
            <SvgGrad id={`glass${gid}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.10" />
              <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0" />
            </SvgGrad>
          </Defs>

          {/* Needle: shaft, then a cone into the barrel. */}
          <Line x1={NEEDLE_X} y1={CY} x2={HUB_X} y2={CY} stroke="#9BA2B8" strokeWidth={2} strokeLinecap="round" />
          <Path d={`M${HUB_X} ${CY - 3} L${BX0} ${CY - 9} L${BX0} ${CY + 9} L${HUB_X} ${CY + 3} Z`} fill={colors.surfaceHigh} />

          {/* Barrel */}
          <Rect x={BX0} y={top} width={bx1 - BX0} height={BH} rx={6} fill={colors.surface} stroke={colors.border} strokeWidth={1} />

          {/* Liquid, from the needle end up to the plunger stopper. */}
          {plungerX > BX0 + 5 && (
            <Rect x={BX0 + 3} y={top + 3} width={Math.max(0, plungerX - 5 - (BX0 + 3))} height={BH - 6} rx={4} fill={`url(#liq${gid})`} />
          )}

          {/* Graduations along the top inside edge. */}
          <G>
            {Array.from({ length: 11 }, (_, i) => {
              const gx = travel0 + (i / 10) * usable;
              return (
                <Line
                  key={i}
                  x1={gx}
                  y1={top + 2}
                  x2={gx}
                  y2={top + (i % 5 === 0 ? 11 : 7)}
                  stroke={colors.textFaint}
                  strokeWidth={1}
                  opacity={0.7}
                />
              );
            })}
          </G>

          {/* Glass highlight over the whole barrel. */}
          <Rect x={BX0} y={top} width={bx1 - BX0} height={BH} rx={6} fill={`url(#glass${gid})`} />

          {/* Finger flange at the open end of the barrel. */}
          <Rect x={bx1 - 3} y={top - 7} width={6} height={BH + 14} rx={3} fill={colors.surfaceHigh} />

          {/* Plunger: stopper inside the barrel, rod through the flange, thumb pad
              outside it. The pad never sits inside the barrel — at zero dose it
              rests against the flange and travels out as the plunger draws back. */}
          <Rect x={plungerX - 5} y={top + 2} width={7} height={BH - 4} rx={2.5} fill="#E8EAF2" />
          <Rect x={plungerX + 1} y={CY - 2.5} width={Math.max(8, padX - plungerX - 1)} height={5} rx={2.5} fill="#B9BFD2" />
          <Rect x={padX} y={top - 5} width={PAD_W} height={BH + 10} rx={3} fill="#E8EAF2" />
        </Svg>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Stepper label="−" onPress={() => nudge(-step)} accessibilityLabel={`Decrease by ${step}`} />
        <View style={{ alignItems: 'center' }}>
          <Text variant="metricLg" color={colors.primary}>
            {value % 1 === 0 ? value : value.toFixed(1)}
          </Text>
          <Text variant="caption" color={colors.textDim}>
            {unit} · drag the plunger
          </Text>
        </View>
        <Stepper label="+" onPress={() => nudge(step)} accessibilityLabel={`Increase by ${step}`} />
      </View>
    </View>
  );
}

function Stepper({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text variant="h3" color={colors.primary}>
        {label}
      </Text>
    </Pressable>
  );
}

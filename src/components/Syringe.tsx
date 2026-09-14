import React, { useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, Line, LinearGradient as SvgGrad, Rect, Stop } from 'react-native-svg';
import { colors, palette, spacing } from '../theme';
import { Text } from './ui/Text';

/**
 * Interactive syringe dose helper. This is a VISUAL INPUT AID only — it does not
 * suggest, recommend, or validate any dose. The user drags the plunger (or uses
 * the steppers) to record the amount they are logging. All safety disclaimers in
 * the protocol tracker still apply.
 */
interface Props {
  value: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

export function Syringe({ value, max = 100, step = 0.5, unit = 'units', onChange }: Props) {
  const [w, setW] = useState(320);
  const height = 96;
  const padLeft = 44; // thumb rest
  const padRight = 56; // needle
  const usable = Math.max(1, w - padLeft - padRight);
  const fraction = Math.max(0, Math.min(1, value / max));

  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  const setFromX = (x: number) => {
    const frac = Math.max(0, Math.min(1, (x - padLeft) / usable));
    const raw = frac * max;
    const snapped = Math.round(raw / step) * step;
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

  // Entrance animation for the liquid.
  const enter = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 500, useNativeDriver: false }).start();
  }, [enter]);

  const plungerX = padLeft + fraction * usable;
  const barrelTop = 30;
  const barrelH = 34;
  const gid = React.useId();

  const nudge = (d: number) => onChange(Math.max(0, Math.min(max, Math.round((value + d) * 100) / 100)));

  return (
    <View style={{ gap: spacing.md }}>
      <View onLayout={onLayout} {...pan.panHandlers} style={{ height }}>
        <Svg width={w} height={height}>
          <Defs>
            <SvgGrad id={gid} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={palette.amber} />
              <Stop offset="1" stopColor={palette.ember} />
            </SvgGrad>
          </Defs>
          {/* barrel */}
          <Rect x={padLeft} y={barrelTop} width={w - padLeft - padRight + 6} height={barrelH} rx={7} fill={colors.surface} stroke={colors.border} strokeWidth={1} />
          {/* liquid */}
          <Rect x={padLeft + 2} y={barrelTop + 3} width={Math.max(0, fraction * usable - 2)} height={barrelH - 6} rx={5} fill={`url(#${gid})`} />
          {/* graduation ticks */}
          {Array.from({ length: 11 }, (_, i) => {
            const gx = padLeft + (i / 10) * usable;
            return <Line key={i} x1={gx} y1={barrelTop} x2={gx} y2={barrelTop + (i % 5 === 0 ? 10 : 6)} stroke={colors.textFaint} strokeWidth={1} />;
          })}
          {/* needle */}
          <Rect x={w - padRight + 6} y={barrelTop + barrelH / 2 - 3} width={20} height={6} rx={3} fill={colors.surfaceHigh} />
          <Line x1={w - padRight + 26} y1={barrelTop + barrelH / 2} x2={w - 6} y2={barrelTop + barrelH / 2} stroke={colors.textDim} strokeWidth={2} />
          {/* thumb rest */}
          <Rect x={padLeft - 10} y={barrelTop - 6} width={10} height={barrelH + 12} rx={3} fill={colors.surfaceHigh} />
          {/* plunger */}
          <Rect x={plungerX - 4} y={barrelTop - 8} width={8} height={barrelH + 16} rx={3} fill={palette.white} />
        </Svg>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Stepper label="−" onPress={() => nudge(-step)} />
        <View style={{ alignItems: 'center' }}>
          <Text variant="metricLg" color={colors.primary}>
            {value % 1 === 0 ? value : value.toFixed(1)}
          </Text>
          <Text variant="caption" color={colors.textDim}>
            {unit} · drag the plunger
          </Text>
        </View>
        <Stepper label="+" onPress={() => nudge(step)} />
      </View>
    </View>
  );
}

function Stepper({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="h3" color={colors.primary}>
        {label}
      </Text>
    </Pressable>
  );
}

import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { colors } from '../../theme';

interface Props {
  size?: number;
  stroke?: number;
  progress: number; // 0-1
  color?: string;
  gradientColors?: [string, string];
  trackColor?: string;
  children?: React.ReactNode;
  rounded?: boolean;
}

/**
 * Circular progress ring. Accepts either a solid color or a two-stop gradient.
 * Progress is clamped to [0,1]. Purely presentational.
 */
export function ProgressRing({
  size = 120,
  stroke = 12,
  progress,
  color = colors.primary,
  gradientColors,
  trackColor = colors.surfaceHigh,
  children,
  rounded = true,
}: Props) {
  const clamped = Math.max(0, Math.min(1, isFinite(progress) ? progress : 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped);
  const gradId = React.useId();

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        {gradientColors && (
          <Defs>
            <SvgGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={gradientColors[0]} />
              <Stop offset="1" stopColor={gradientColors[1]} />
            </SvgGradient>
          </Defs>
        )}
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={gradientColors ? `url(#${gradId})` : color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap={rounded ? 'round' : 'butt'}
          fill="none"
        />
      </Svg>
      {children}
    </View>
  );
}

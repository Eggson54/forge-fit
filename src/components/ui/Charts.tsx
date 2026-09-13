import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';
import { colors } from '../../theme';
import { Text } from './Text';

export interface Point {
  label: string;
  value: number;
}

/** Smooth-ish line chart with an area fill. Handles empty/one-point data. */
export function LineChart({
  data,
  height = 160,
  color = colors.primary,
  width = 320,
}: {
  data: Point[];
  height?: number;
  color?: string;
  width?: number;
}) {
  const gid = React.useId();
  if (data.length < 2) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="caption" color={colors.textFaint}>
          Not enough data yet
        </Text>
      </View>
    );
  }
  const pad = 12;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (width - pad * 2) / (data.length - 1);
  const y = (v: number) => pad + (1 - (v - min) / range) * (height - pad * 2);
  const x = (i: number) => pad + i * stepX;

  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.value)}`).join(' ');
  const area = `${line} L ${x(data.length - 1)} ${height - pad} L ${x(0)} ${height - pad} Z`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.25" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </SvgGradient>
      </Defs>
      <Path d={area} fill={`url(#${gid})`} />
      <Path d={line} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <Circle key={i} cx={x(i)} cy={y(d.value)} r={i === data.length - 1 ? 4 : 2.5} fill={color} />
      ))}
    </Svg>
  );
}

/** Vertical bar chart (e.g. weekly workout volume / consistency). */
export function BarChart({
  data,
  height = 160,
  width = 320,
  color = colors.primary,
  targetLine,
}: {
  data: Point[];
  height?: number;
  width?: number;
  color?: string;
  targetLine?: number;
}) {
  if (!data.length) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="caption" color={colors.textFaint}>
          No data yet
        </Text>
      </View>
    );
  }
  const pad = 16;
  const max = Math.max(...data.map((d) => d.value), targetLine ?? 0, 1);
  const barW = (width - pad * 2) / data.length - 6;
  const chartH = height - pad * 2;

  return (
    <Svg width={width} height={height}>
      {targetLine !== undefined && (
        <Line
          x1={pad}
          x2={width - pad}
          y1={pad + (1 - targetLine / max) * chartH}
          y2={pad + (1 - targetLine / max) * chartH}
          stroke={colors.textFaint}
          strokeDasharray="4 4"
          strokeWidth={1}
        />
      )}
      {data.map((d, i) => {
        const h = (d.value / max) * chartH;
        const xPos = pad + i * ((width - pad * 2) / data.length) + 3;
        return (
          <Rect
            key={i}
            x={xPos}
            y={pad + (chartH - h)}
            width={barW}
            height={Math.max(2, h)}
            rx={4}
            fill={d.value >= (targetLine ?? 0) && targetLine ? color : d.value > 0 ? color : colors.surfaceHigh}
            opacity={d.value > 0 ? 1 : 0.5}
          />
        );
      })}
    </Svg>
  );
}

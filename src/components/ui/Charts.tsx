import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { colors } from '../../theme';
import { Text } from './Text';

export interface Point {
  label: string;
  value: number;
}

const AXIS = colors.hairline;
const INK_FAINT = colors.textFaint;

function EmptyPlot({ height, message }: { height: number; message: string }) {
  return (
    <View style={{ height, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      <Text variant="caption" color={INK_FAINT}>
        {message}
      </Text>
    </View>
  );
}

/** Nice round-ish tick values for the value axis. */
function niceBounds(values: number[]): { lo: number; hi: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const mag = Math.max(Math.abs(max), 1);

  // Headroom is a fraction of the RANGE, not of the magnitude. Series that sit
  // far from zero — bodyweight, estimated 1RM — move by a few units on a base of
  // two hundred, and padding by magnitude would flatten a real trend into a
  // hairline across the middle of an empty plot. The magnitude term survives
  // only as a floor, so a genuinely flat series still gets a band to sit in
  // rather than being pinned to an edge by a zero-height range.
  const pad = Math.max(range * 0.15, mag * 0.005, 0.5);
  return { lo: min - pad, hi: max + pad };
}

const fmt = (n: number) => (Math.abs(n) >= 1000 ? `${Math.round(n / 100) / 10}k` : `${Math.round(n * 10) / 10}`);

/**
 * Single-series trend line. One series, so no legend — the section title names
 * it. Grid and axes stay recessive; only the latest point is labelled.
 */
export function LineChart({
  data,
  height = 170,
  color = colors.primary,
  width = 320,
  unit = '',
  overlay,
  overlayColor = colors.text,
}: {
  data: Point[];
  height?: number;
  color?: string;
  width?: number;
  unit?: string;
  /**
   * A second series over the same x positions — a smoothed version of `data`,
   * drawn on top. Must be the same length; anything else is ignored rather
   * than silently misaligned against the raw points.
   */
  overlay?: Point[];
  overlayColor?: string;
}) {
  const gid = React.useId();
  if (data.length < 2) return <EmptyPlot height={height} message="Log at least two entries to see your trend" />;

  const padL = 34;
  const padR = 14;
  const padT = 14;
  const padB = 22;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const smoothed = overlay && overlay.length === data.length ? overlay : null;
  const { lo, hi } = niceBounds([...data.map((d) => d.value), ...(smoothed ?? []).map((d) => d.value)]);
  const span = hi - lo || 1;

  const x = (i: number) => padL + (i / (data.length - 1)) * plotW;
  const y = (v: number) => padT + (1 - (v - lo) / span) * plotH;

  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.value)}`).join(' ');
  const area = `${line} L ${x(data.length - 1)} ${padT + plotH} L ${padL} ${padT + plotH} Z`;
  const last = data[data.length - 1]!;
  const gridVals = [hi, lo + span / 2, lo];

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.22" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>

      {/* recessive grid + value labels */}
      {gridVals.map((v, i) => (
        <React.Fragment key={i}>
          <Line x1={padL} x2={width - padR} y1={y(v)} y2={y(v)} stroke={AXIS} strokeWidth={1} />
          <SvgText x={padL - 6} y={y(v) + 3.5} fontSize="9" fill={INK_FAINT} textAnchor="end">
            {fmt(v)}
          </SvgText>
        </React.Fragment>
      ))}

      <Path d={area} fill={`url(#${gid})`} />
      {/* With a trend line present the raw series steps back to being context:
          it is the noise the average is there to see through. */}
      <Path
        d={line}
        stroke={color}
        strokeWidth={smoothed ? 1.25 : 2}
        strokeOpacity={smoothed ? 0.45 : 1}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {smoothed && (
        <Path
          d={smoothed.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.value)}`).join(' ')}
          stroke={overlayColor}
          strokeWidth={2.4}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {/* only the latest point is marked + labelled */}
      <Circle cx={x(data.length - 1)} cy={y(last.value)} r={4.5} fill={color} stroke={colors.card} strokeWidth={2} />
      <SvgText
        x={Math.min(width - padR, x(data.length - 1))}
        y={Math.max(11, y(last.value) - 11)}
        fontSize="10"
        fontWeight="600"
        fill={colors.text}
        textAnchor="end"
      >
        {fmt(last.value)}
        {unit}
      </SvgText>

      {/* first/last x labels only */}
      <SvgText x={padL} y={height - 6} fontSize="9" fill={INK_FAINT}>
        {data[0]!.label}
      </SvgText>
      <SvgText x={width - padR} y={height - 6} fontSize="9" fill={INK_FAINT} textAnchor="end">
        {last.label}
      </SvgText>
    </Svg>
  );
}

/**
 * Single-series bars with rounded data-ends anchored to the baseline and a 2px
 * gap between bars. An optional target line is drawn as a recessive rule.
 */
export function BarChart({
  data,
  height = 170,
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
  if (!data.length) return <EmptyPlot height={height} message="No data logged yet" />;

  const padL = 26;
  const padR = 12;
  const padT = 16;
  const padB = 22;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const max = Math.max(...data.map((d) => d.value), targetLine ?? 0, 1);
  const slot = plotW / data.length;
  const barW = Math.max(6, slot - 6); // 2px+ surface gap either side
  const baseline = padT + plotH;
  const peak = Math.max(...data.map((d) => d.value));
  const peakIdx = data.map((d) => d.value).lastIndexOf(peak);

  return (
    <Svg width={width} height={height}>
      {/* baseline + max rule */}
      <Line x1={padL} x2={width - padR} y1={baseline} y2={baseline} stroke={AXIS} strokeWidth={1} />
      <SvgText x={padL - 6} y={padT + 4} fontSize="9" fill={INK_FAINT} textAnchor="end">
        {fmt(max)}
      </SvgText>

      {targetLine !== undefined && targetLine > 0 && (
        <>
          <Line
            x1={padL}
            x2={width - padR}
            y1={baseline - (targetLine / max) * plotH}
            y2={baseline - (targetLine / max) * plotH}
            stroke={INK_FAINT}
            strokeDasharray="3 4"
            strokeWidth={1}
          />
          <SvgText x={padL + 2} y={baseline - (targetLine / max) * plotH - 4} fontSize="9" fill={INK_FAINT}>
            goal
          </SvgText>
        </>
      )}

      {data.map((d, i) => {
        const h = d.value > 0 ? Math.max(3, (d.value / max) * plotH) : 0;
        const bx = padL + i * slot + (slot - barW) / 2;
        const isPeak = d.value === peak && peak > 0;
        const labelThis = i === peakIdx && peak > 0;
        return (
          <React.Fragment key={i}>
            {h > 0 ? (
              <Rect x={bx} y={baseline - h} width={barW} height={h} rx={4} fill={color} opacity={isPeak ? 1 : 0.62} />
            ) : (
              <Rect x={bx} y={baseline - 3} width={barW} height={3} rx={1.5} fill={AXIS} />
            )}
            {labelThis && (
              <SvgText x={bx + barW / 2} y={baseline - h - 5} fontSize="9" fontWeight="600" fill={colors.text} textAnchor="middle">
                {fmt(d.value)}
              </SvgText>
            )}
          </React.Fragment>
        );
      })}

      {/* first/last x labels only */}
      <SvgText x={padL} y={height - 6} fontSize="9" fill={INK_FAINT}>
        {data[0]!.label}
      </SvgText>
      <SvgText x={width - padR} y={height - 6} fontSize="9" fill={INK_FAINT} textAnchor="end">
        {data[data.length - 1]!.label}
      </SvgText>
    </Svg>
  );
}

/**
 * Binary day strip (logged / not logged). A bar chart of 0s and 1s is the wrong
 * form for a yes-no series — this reads the streak at a glance instead.
 */
export function DayStrip({ days, color = colors.primary }: { days: { label: string; on: boolean }[]; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {days.map((d, i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
          {/* A hit day is a filled pip, a missed day a hollow one. Full-height
              blocks with a tick in each read as decoration rather than data,
              and the difference between hit and missed has to survive being
              seen without colour. */}
          <View
            style={{
              width: '100%',
              height: 22,
              borderRadius: 7,
              backgroundColor: d.on ? color : 'transparent',
              borderWidth: d.on ? 0 : 1,
              borderColor: colors.border,
            }}
          />
          <Text variant="caption" color={d.on ? colors.textDim : colors.textFaint} style={{ fontSize: 9 }}>
            {d.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

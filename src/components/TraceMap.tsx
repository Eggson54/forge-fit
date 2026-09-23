import React, { useMemo } from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';
import { boundsOf, fitViewport, padBounds, type LatLon } from '../domain/geo';
import { colors, radius } from '../theme';
import { Text } from './ui/Text';

/**
 * A recorded route, drawn as a line.
 *
 * No map tiles behind it, and that is a deliberate choice rather than a
 * missing feature: every tile source wants an API key, most want a billing
 * account, and all of them want the coordinates of wherever the athlete runs
 * sent to a third party on every pan. The shape of the route, the start, the
 * finish and the highlighted stretch are what people actually read off these
 * pictures, and all four survive without a basemap.
 */
export function TraceMap({
  points,
  lines,
  height = 180,
  width,
  highlight,
  style,
  color = colors.primary,
}: {
  points?: LatLon[];
  /**
   * Several disconnected runs, as privacy trimming produces them.
   *
   * Drawn without start and finish markers, on purpose. A green dot on the
   * first surviving point would label it "where they started" — which is
   * precisely the coordinate the privacy zone removed. The gaps are left as
   * gaps for the same reason: joining the pieces would draw a straight line
   * through the hidden middle, and its two ends are the hidden addresses.
   */
  lines?: LatLon[][];
  height?: number;
  /** Defaults to filling the parent; pass a number inside a fixed-width row. */
  width?: number;
  /** An index range to pick out — a best effort, or a segment. Single-line only. */
  highlight?: { from: number; to: number } | null;
  style?: ViewStyle;
  color?: string;
}) {
  const [measured, setMeasured] = React.useState(width ?? 0);
  const w = width ?? measured;

  const trimmed = lines != null;
  // Memoised because `points ?? []` allocates a fresh array on every render
  // when the caller passes no points, which would re-run the projection below
  // every frame for a routeless card.
  const single = useMemo(() => points ?? [], [points]);

  const drawn = useMemo(() => {
    const segments = trimmed ? (lines ?? []).filter((l) => l.length > 1) : single.length > 1 ? [single] : [];
    const all = segments.flat();
    if (!w || all.length < 2) return null;
    const bounds = boundsOf(all);
    if (!bounds) return null;

    const viewport = fitViewport(padBounds(bounds, 0.08), w, height);
    const project = (p: LatLon) => viewport.project(p);
    const toPoly = (ps: LatLon[]) => ps.map((p) => { const q = project(p); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(' ');

    const slice =
      !trimmed && highlight && highlight.to > highlight.from
        ? single.slice(Math.max(0, highlight.from), Math.min(single.length, highlight.to + 1))
        : null;

    return {
      polylines: segments.map(toPoly),
      highlighted: slice && slice.length > 1 ? toPoly(slice) : null,
      // Endpoints belong to a complete trace only; see the `lines` note above.
      start: trimmed ? null : project(single[0]!),
      end: trimmed ? null : project(single[single.length - 1]!),
    };
  }, [single, lines, trimmed, w, height, highlight]);

  return (
    <View
      onLayout={(e) => { if (width == null) setMeasured(e.nativeEvent.layout.width); }}
      style={[{ height, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface }, style]}
    >
      {drawn ? (
        <Svg width={w} height={height}>
          {/* A dark casing under the line, so the route reads against the
              card whichever direction it doubles back over itself. */}
          {drawn.polylines.map((poly, i) => (
            <Polyline key={`casing-${i}`} points={poly} fill="none" stroke={colors.bg} strokeWidth={5.5} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {drawn.polylines.map((poly, i) => (
            <Polyline
              key={`line-${i}`}
              points={poly}
              fill="none"
              stroke={drawn.highlighted ? colors.textFaint : color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {drawn.highlighted && (
            <Polyline points={drawn.highlighted} fill="none" stroke={color} strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
          )}
          {drawn.start && <Circle cx={drawn.start.x} cy={drawn.start.y} r={5} fill={colors.success} stroke={colors.bg} strokeWidth={2} />}
          {drawn.end && <Circle cx={drawn.end.x} cy={drawn.end.y} r={5} fill={colors.danger} stroke={colors.bg} strokeWidth={2} />}
        </Svg>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="caption" color={colors.textFaint}>
            {(trimmed ? (lines ?? []).flat().length : single.length) < 2 ? 'No route recorded' : 'Drawing…'}
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * The elevation profile under a route, as a filled area.
 *
 * Drawn against distance rather than against sample index: samples bunch up
 * where you slow down, so an index-based profile stretches every climb and
 * flattens every descent — the exact opposite of what it is for.
 */
export function ElevationProfile({
  points,
  height = 70,
  width,
  color = colors.steps,
}: {
  points: { distanceM: number; ele: number }[];
  height?: number;
  width?: number;
  color?: string;
}) {
  const [measured, setMeasured] = React.useState(width ?? 0);
  const w = width ?? measured;

  const path = useMemo(() => {
    if (!w || points.length < 2) return null;
    const totalM = points[points.length - 1]!.distanceM;
    if (totalM <= 0) return null;
    const eles = points.map((p) => p.ele);
    const lo = Math.min(...eles);
    const hi = Math.max(...eles);
    // A flat route has no profile worth drawing; a two-metre range stretched
    // over seventy pixels looks like an alp.
    if (hi - lo < 5) return null;

    const x = (d: number) => (d / totalM) * w;
    const y = (e: number) => height - ((e - lo) / (hi - lo)) * (height - 6) - 3;

    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.distanceM).toFixed(1)},${y(p.ele).toFixed(1)}`).join('');
    return { line: d, area: `${d}L${w},${height}L0,${height}Z`, lo: Math.round(lo), hi: Math.round(hi) };
  }, [points, w, height]);

  return (
    <View onLayout={(e) => { if (width == null) setMeasured(e.nativeEvent.layout.width); }} style={{ height }}>
      {path && (
        <Svg width={w} height={height}>
          <Path d={path.area} fill={color} opacity={0.16} />
          <Path d={path.line} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
        </Svg>
      )}
    </View>
  );
}

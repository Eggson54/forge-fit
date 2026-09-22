import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Polyline, Rect } from 'react-native-svg';
import { boundsOf, padBounds, type LatLon } from '../domain/geo';
import {
  TILE_SIZE,
  fitBounds,
  fromScreen,
  panBy,
  scaleBar,
  sourceById,
  tileUrl,
  tilesFor,
  toScreen,
  zoomAbout,
  type MapView as MapViewport,
  type TileSource,
} from '../domain/tiles';
import { trimToZones, type PrivacyZone } from '../domain/privacy';
import type { HeatCell, Heatmap } from '../domain/heatmap';
import { cellCorner } from '../domain/heatmap';
import { colors, radius, spacing } from '../theme';
import { Icon } from './Icon';
import { Text } from './ui/Text';

/**
 * A real map: raster tiles, with routes drawn over them.
 *
 * Built directly on the tile grid rather than on a native map SDK, and that
 * is a deliberate trade. A native SDK brings gestures, rotation and clustering
 * for free; it also brings a key, a billing relationship, a large binary, and
 * — for the one everybody asks for — terms that forbid using the tiles
 * outside their own SDK. This draws OpenStreetMap tiles, which need neither
 * an account nor a key, and the source is one line to change.
 *
 * Panning and pinching are handled here rather than in a gesture library
 * because the arithmetic is the interesting part and it lives in `tiles.ts`,
 * under test. What is left is plumbing.
 */

export interface MapMarker {
  at: LatLon;
  color: string;
  label?: string;
}

export function MapView({
  routes,
  markers = [],
  heatmap,
  zones = [],
  height = 260,
  sourceId,
  interactive = true,
  units = 'metric',
  style,
  routeColor = colors.primary,
  onPressPoint,
}: {
  /** One or more lines. Several, because a privacy zone can cut one in two. */
  routes: LatLon[][];
  markers?: MapMarker[];
  heatmap?: Heatmap | null;
  /** Applied to `routes` before anything is drawn. */
  zones?: PrivacyZone[];
  height?: number;
  sourceId?: string;
  interactive?: boolean;
  units?: 'imperial' | 'metric';
  style?: ViewStyle;
  routeColor?: string;
  onPressPoint?: (p: LatLon) => void;
}) {
  const source: TileSource = sourceById(sourceId);
  const [width, setWidth] = useState(0);
  const [view, setView] = useState<MapViewport | null>(null);
  const [failed, setFailed] = useState(0);

  // Privacy trimming happens before anything is measured or drawn, so there
  // is no path through this component that can render a hidden point.
  const visible = useMemo(
    () => routes.flatMap((r) => trimToZones(r, zones)).filter((r) => r.length > 1),
    [routes, zones],
  );

  const all = useMemo(() => visible.flat(), [visible]);

  // Frame the content once the width is known, and again if the content
  // changes — but never while the user is panning, which would fight them.
  const framedFor = useRef('');
  useEffect(() => {
    if (!width) return;
    const points = all.length ? all : markers.map((m) => m.at);
    const bounds = points.length
      ? boundsOf(points)
      : heatmap && heatmap.cells.length
        ? boundsOf(heatmap.cells.map((c) => cellCorner(c, heatmap)))
        : null;
    if (!bounds) return;

    const signature = `${width}x${height}:${points.length}:${heatmap?.cells.length ?? 0}`;
    if (framedFor.current === signature) return;
    framedFor.current = signature;
    setView(fitBounds(padBounds(bounds, 0.12), width, height, { padding: 16 }));
  }, [width, height, all, markers, heatmap]);

  const viewRef = useRef<MapViewport | null>(null);
  viewRef.current = view;

  // Declared before the gesture that closes over them, so the reading order
  // matches the dependency order.
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const pinchRef = useRef<number | null>(null);

  const gesture = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => interactive,
        onMoveShouldSetPanResponder: (_, g) => interactive && (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2),
        onPanResponderMove: (e, g) => {
          const current = viewRef.current;
          if (!current) return;
          const touches = e.nativeEvent.touches;
          if (touches.length >= 2) {
            // Pinch. The distance ratio between frames is the zoom delta, and
            // the midpoint is the anchor so the map does not slide away from
            // under the fingers.
            const [a, b] = [touches[0]!, touches[1]!];
            const distance = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
            const last = pinchRef.current;
            pinchRef.current = distance;
            if (last && distance > 0) {
              const delta = Math.log2(distance / last);
              if (Math.abs(delta) > 0.01) {
                setView(zoomAbout(current, delta, { x: current.width / 2, y: current.height / 2 }));
              }
            }
            return;
          }
          pinchRef.current = null;
          const last = dragRef.current;
          dragRef.current = { x: g.dx, y: g.dy };
          setView(panBy(current, g.dx - (last?.x ?? 0), g.dy - (last?.y ?? 0)));
        },
        onPanResponderRelease: () => {
          dragRef.current = null;
          pinchRef.current = null;
        },
        onPanResponderTerminate: () => {
          dragRef.current = null;
          pinchRef.current = null;
        },
      }),
    [interactive],
  );

  const tiles = view ? tilesFor(view, 1) : [];
  // Below this, a scale bar and an attribution line are illegible and cover
  // more of the route than they inform about. The screen that shows a
  // thumbnail carries the attribution once, at a readable size.
  const roomForChrome = width >= 170 && height >= 130;
  const bar = view && roomForChrome ? scaleBar(view, units) : null;

  // If most tiles fail, the device is offline or the source is blocked. Say so
  // rather than showing a grey rectangle and letting people wonder.
  const tilesBroken = tiles.length > 0 && failed >= Math.max(3, tiles.length * 0.6);

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[{ height, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface }, style]}
      {...(interactive ? gesture.panHandlers : null)}
    >
      {view && width > 0 && (
        <>
          {!tilesBroken &&
            tiles.map((t) => (
              <Image
                key={t.key}
                source={{ uri: tileUrl(source, t.x, t.y, t.z) }}
                onError={() => setFailed((n) => n + 1)}
                style={{ position: 'absolute', left: t.left, top: t.top, width: TILE_SIZE, height: TILE_SIZE }}
              />
            ))}

          <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
            {heatmap?.cells.map((cell) => {
              const box = heatCellBox(cell, heatmap, view);
              if (!box) return null;
              return (
                <Rect
                  key={`${cell.x},${cell.y}`}
                  x={box.x}
                  y={box.y}
                  width={box.w}
                  height={box.h}
                  fill={colors.primary}
                  opacity={0.15 + cell.intensity * 0.65}
                />
              );
            })}

            {/* With a heatmap, the cells *are* the routes. Drawing the lines
                as well — each with a dark casing, so they read against any
                basemap — buries the very intensity the heatmap exists to
                show, and every route ends up looking equally travelled. */}
            {!heatmap && visible.map((line, i) => {
              const pts = line.map((p) => {
                const s = toScreen(p, view);
                return `${s.x.toFixed(1)},${s.y.toFixed(1)}`;
              }).join(' ');
              return (
                <React.Fragment key={i}>
                  <Polyline points={pts} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />
                  <Polyline points={pts} fill="none" stroke={routeColor} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
                </React.Fragment>
              );
            })}

            {markers.map((m, i) => {
              const s = toScreen(m.at, view);
              return <Circle key={i} cx={s.x} cy={s.y} r={6} fill={m.color} stroke="#000" strokeWidth={2} />;
            })}
          </Svg>

          {tilesBroken && roomForChrome && (
            <View style={styles.offline} pointerEvents="none">
              <Icon name="map" size={18} color={colors.textFaint} />
              <Text variant="caption" color={colors.textFaint} center>
                Map tiles could not load. The route above is drawn from your own recording and is unaffected.
              </Text>
            </View>
          )}

          {interactive && roomForChrome && (
            <View style={styles.zoomButtons}>
              <ZoomButton glyph="plus" onPress={() => setView((v) => (v ? zoomAbout(v, 1, { x: v.width / 2, y: v.height / 2 }) : v))} />
              <ZoomButton glyph="minus" onPress={() => setView((v) => (v ? zoomAbout(v, -1, { x: v.width / 2, y: v.height / 2 }) : v))} />
            </View>
          )}

          {bar && !tilesBroken && (
            <View style={styles.scale} pointerEvents="none">
              <View style={[styles.scaleLine, { width: Math.max(20, bar.pixels) }]} />
              <Text variant="caption" color={colors.text} style={styles.scaleLabel}>{bar.label}</Text>
            </View>
          )}

          {!tilesBroken && roomForChrome && (
            <Text variant="caption" color={colors.text} style={styles.attribution} numberOfLines={1}>
              {source.attribution}
            </Text>
          )}

          {onPressPoint && interactive && (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={(e) =>
                onPressPoint(fromScreen({ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }, view))
              }
            />
          )}
        </>
      )}
    </View>
  );
}

function ZoomButton({ glyph, onPress }: { glyph: 'plus' | 'minus'; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={glyph === 'plus' ? 'Zoom in' : 'Zoom out'} style={styles.zoomButton}>
      <Icon name={glyph} size={16} color={colors.text} />
    </Pressable>
  );
}

/** Where one heat cell lands on screen, or null when it is off it. */
function heatCellBox(cell: HeatCell, heatmap: Heatmap, view: MapViewport) {
  const nw = toScreen(cellCorner(cell, heatmap), view);
  const se = toScreen(cellCorner({ x: cell.x + 1, y: cell.y + 1 }, heatmap), view);
  const w = se.x - nw.x;
  const h = se.y - nw.y;
  if (nw.x > view.width || se.x < 0 || nw.y > view.height || se.y < 0) return null;
  // A cell smaller than a pixel still has to be drawn, or a zoomed-out
  // heatmap disappears entirely.
  return { x: nw.x, y: nw.y, w: Math.max(1.5, w), h: Math.max(1.5, h) };
}

const styles = StyleSheet.create({
  zoomButtons: { position: 'absolute', right: spacing.sm, top: spacing.sm, gap: 6 },
  zoomButton: {
    width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(11,12,17,0.72)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  scale: { position: 'absolute', left: spacing.sm, bottom: spacing.sm, gap: 2 },
  scaleLine: { height: 3, backgroundColor: colors.text, borderRadius: 2, opacity: 0.85 },
  scaleLabel: { textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 3, fontSize: 10 },
  attribution: {
    position: 'absolute', right: spacing.sm, bottom: spacing.xs, fontSize: 9, opacity: 0.75,
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 3,
  },
  offline: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 6, padding: spacing.lg },
});

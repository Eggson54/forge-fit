import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, Path, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import { colors, radius as themeRadius, spacing } from '../theme';
import { Text } from './ui';
import {
  boundsOf,
  fitViewport,
  formatDistance,
  offsetBy,
  padBounds,
  type LatLon,
} from '../domain/geo';
import { rarityOf, type Gym, type GymRarity } from '../domain/gyms';
import type { MapFeature } from '../services/gyms';

export const RARITY_COLOR: Record<GymRarity, string> = {
  common: '#7FB2FF',
  uncommon: '#39E6C3',
  rare: '#C6F135',
  legendary: '#FFB020',
};

const FEATURE_STYLE: Record<MapFeature['kind'], { fill?: string; stroke?: string; width: number }> = {
  water: { fill: 'rgba(46,155,224,0.16)', stroke: 'rgba(46,155,224,0.35)', width: 1 },
  park: { fill: 'rgba(126,158,21,0.14)', stroke: 'rgba(126,158,21,0.3)', width: 1 },
  road: { stroke: 'rgba(255,255,255,0.13)', width: 1.4 },
  rail: { stroke: 'rgba(255,255,255,0.09)', width: 1 },
  building: { fill: 'rgba(255,255,255,0.04)', stroke: 'rgba(255,255,255,0.07)', width: 0.5 },
};

interface Props {
  gyms: Gym[];
  claimedIds: Set<string>;
  here: LatLon | null;
  features?: MapFeature[];
  width: number;
  height: number;
  units: 'imperial' | 'metric';
  selectedId?: string | null;
  onSelect?: (gym: Gym) => void;
}

/**
 * The map is drawn from real coordinates through a real Web Mercator
 * projection, so every pin sits at its true bearing and distance from you.
 *
 * What it deliberately does not do is draw streets it does not have. When the
 * data source supplies basemap geometry it is rendered; when it does not, the
 * map falls back to distance rings and a graticule. A ring at 500 m is honest
 * about what it knows. A plausible-looking street grid would not be.
 */
export function GymMap({
  gyms,
  claimedIds,
  here,
  features = [],
  width,
  height,
  units,
  selectedId,
  onSelect,
}: Props) {
  const view = useMemo(() => {
    const points: LatLon[] = gyms.map((g) => ({ lat: g.lat, lon: g.lon }));
    if (here) points.push(here);
    const base = boundsOf(points);
    if (!base) return null;
    // Pins are drawn ~13px tall above their anchor, so the box needs headroom
    // or the northernmost marker is clipped by the canvas edge.
    return fitViewport(padBounds(base, 0.18), width, height);
  }, [gyms, here, width, height]);

  // Rings at round distances that actually fit the current view. This has to
  // sit above the early return below: a hook that only sometimes runs changes
  // the hook order between renders.
  const ringMeters = useMemo(() => {
    if (!here || !view) return [];
    const halfSpan = (Math.min(width, height) / 2) * view.metersPerPixel;
    const candidates = [100, 250, 500, 1000, 2000, 5000, 10000, 20000];
    return candidates.filter((m) => m < halfSpan * 0.98).slice(-3);
  }, [here, view, width, height]);

  if (!view) {
    return (
      <View
        style={{
          width,
          height,
          borderRadius: themeRadius.lg,
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text variant="caption" color={colors.textFaint}>No venues to plot yet.</Text>
      </View>
    );
  }

  const anchor = here ? view.project(here) : null;

  return (
    <View style={{ width, height, borderRadius: themeRadius.lg, overflow: 'hidden', backgroundColor: '#0E1018' }}>
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id="gm_glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#FF5A1F" stopOpacity={0.18} />
            <Stop offset="100%" stopColor="#FF5A1F" stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Graticule: a plain reference grid, not pretend geography. */}
        <G opacity={0.5}>
          {gridLines(width, height).map((l, i) => (
            <Line key={`g${i}`} {...l} stroke="rgba(255,255,255,0.045)" strokeWidth={1} />
          ))}
        </G>

        {/* Whatever basemap geometry the source actually gave us. */}
        {features.map((f) => {
          const st = FEATURE_STYLE[f.kind];
          return (
            <Path
              key={f.id}
              d={pathFor(f, view.project)}
              fill={st.fill ?? 'none'}
              stroke={st.stroke ?? 'none'}
              strokeWidth={st.width}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}

        {anchor && (
          <>
            <Circle cx={anchor.x} cy={anchor.y} r={Math.min(width, height) * 0.42} fill="url(#gm_glow)" />
            {ringMeters.map((m) => {
              // A circle of constant ground distance is an ellipse in Mercator,
              // so the radius is measured rather than assumed.
              const edge = view.project(offsetBy(here!, m, 90));
              const r = Math.abs(edge.x - anchor.x);
              return (
                <G key={m}>
                  <Circle
                    cx={anchor.x}
                    cy={anchor.y}
                    r={r}
                    fill="none"
                    stroke="rgba(255,255,255,0.10)"
                    strokeWidth={1}
                    strokeDasharray="3 5"
                  />
                  {/* On the ring's north edge, not its east edge: side by
                      side, the inner labels sat on top of each other. */}
                  <SvgText
                    x={anchor.x}
                    y={anchor.y - r + 11}
                    fill="rgba(255,255,255,0.34)"
                    fontSize={9}
                    textAnchor="middle"
                  >
                    {formatDistance(m, units)}
                  </SvgText>
                </G>
              );
            })}
          </>
        )}

        {/* Pins: claimed ones filled, unclaimed hollow — collected vs not is
            the single most important read on this screen. */}
        {gyms.map((g) => {
          const p = view.project({ lat: g.lat, lon: g.lon });
          const claimed = claimedIds.has(g.id);
          const tint = RARITY_COLOR[rarityOf(g)];
          const selected = selectedId === g.id;
          return (
            <G key={g.id} opacity={selected || !selectedId ? 1 : 0.55}>
              {selected && <Circle cx={p.x} cy={p.y} r={16} fill={tint} opacity={0.16} />}
              <Path
                d={pinPath(p.x, p.y)}
                fill={claimed ? tint : '#141620'}
                stroke={tint}
                strokeWidth={selected ? 2 : 1.4}
              />
              <Circle cx={p.x} cy={p.y - 8.4} r={2.6} fill={claimed ? '#0B0B0F' : tint} />
            </G>
          );
        })}

        {anchor && (
          <>
            <Circle cx={anchor.x} cy={anchor.y} r={7} fill="#FF5A1F" opacity={0.28} />
            <Circle cx={anchor.x} cy={anchor.y} r={3.6} fill="#FF5A1F" stroke="#0B0B0F" strokeWidth={1.4} />
          </>
        )}
      </Svg>

      {/* Tap targets sit above the SVG: an SVG <G> has no hit slop worth the
          name at this size, and a 12px pin is not a 44pt target. */}
      {onSelect &&
        gyms.map((g) => {
          const p = view.project({ lat: g.lat, lon: g.lon });
          return (
            <Pressable
              key={`hit_${g.id}`}
              onPress={() => onSelect(g)}
              accessibilityRole="button"
              accessibilityLabel={`${g.name}${claimedIds.has(g.id) ? ', claimed' : ''}`}
              style={{ position: 'absolute', left: p.x - 22, top: p.y - 30, width: 44, height: 44 }}
            />
          );
        })}
    </View>
  );
}

/** Classic teardrop, anchored at (x, y). */
function pinPath(x: number, y: number): string {
  return `M ${x} ${y} C ${x - 7.5} ${y - 7} ${x - 6.6} ${y - 17} ${x} ${y - 17} C ${x + 6.6} ${y - 17} ${x + 7.5} ${y - 7} ${x} ${y} Z`;
}

function pathFor(f: MapFeature, project: (p: LatLon) => { x: number; y: number }): string {
  if (f.path.length === 0) return '';
  const pts = f.path.map(project);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  return f.closed ? `${d} Z` : d;
}

function gridLines(width: number, height: number) {
  const step = 44;
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let x = step; x < width; x += step) lines.push({ x1: x, y1: 0, x2: x, y2: height });
  for (let y = step; y < height; y += step) lines.push({ x1: 0, y1: y, x2: width, y2: y });
  return lines;
}

/** Legend row used under the map. */
export function RarityLegend() {
  const rows: GymRarity[] = ['common', 'uncommon', 'rare', 'legendary'];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
      {rows.map((r) => (
        <View key={r} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: RARITY_COLOR[r] }} />
          <Text variant="caption" color={colors.textFaint}>
            {r[0].toUpperCase() + r.slice(1)}
          </Text>
        </View>
      ))}
    </View>
  );
}

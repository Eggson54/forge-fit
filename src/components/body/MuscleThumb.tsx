import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../../theme';
import type { MuscleGroup } from '../../domain/types';
import { BASE, GROOVE, SIL_CENTRE, SIL_MIRROR, VIEWBOX, shapesFor, viewForMuscle } from './geometry';

/**
 * A small figure with one muscle lit, for exercise rows and session headers.
 *
 * Every exercise in the app was text-only, which is most of what made long
 * lists feel like a spreadsheet. This reuses the body map's geometry, so each
 * exercise gets a distinctive graphic generated from the data already on it —
 * no artwork to license and nothing to keep in sync with the anatomy.
 */
export function MuscleThumb({
  muscle,
  secondary = [],
  size = 34,
  color = colors.primary,
}: {
  muscle: MuscleGroup;
  secondary?: MuscleGroup[];
  size?: number;
  color?: string;
}) {
  const front = viewForMuscle(muscle) === 'front';
  const { side, centre } = shapesFor(front);

  // Secondaries are only drawn when they are visible from the same side.
  const sameSide = new Set(secondary.filter((m) => (viewForMuscle(m) === 'front') === front));

  // Secondary muscles use fill-opacity rather than an alpha hex: over the dark
  // silhouette a 33% alpha ember reads as muddy brown, an opacity does not.
  const opacityFor = (m: MuscleGroup): number | null => (m === muscle ? 1 : sameSide.has(m) ? 0.42 : null);
  const height = Math.round(size * (VIEWBOX.height / VIEWBOX.width));

  const paint = (pairs: [MuscleGroup, string][], mirror: boolean) =>
    pairs
      .map(([m, d], i) => {
        const o = opacityFor(m);
        if (o === null) return null;
        return (
          <Path
            key={`${mirror ? 'r' : 'l'}${i}`}
            d={d}
            fill={color}
            fillOpacity={o}
            transform={mirror ? `translate(${VIEWBOX.width},0) scale(-1,1)` : undefined}
          />
        );
      })
      .filter(Boolean);

  return (
    <View style={{ width: size, height, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={height} viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}>
        <Path d={SIL_CENTRE[0]!} fill={BASE} stroke={GROOVE} strokeWidth={1} />
        {SIL_CENTRE.slice(1).map((d, i) => (
          <Path key={`c${i}`} d={d} fill={BASE} stroke={GROOVE} strokeWidth={1} />
        ))}
        {SIL_MIRROR.map((d, i) => (
          <Path key={`m${i}`} d={d} fill={BASE} stroke={GROOVE} strokeWidth={1} />
        ))}
        {SIL_MIRROR.map((d, i) => (
          <Path
            key={`r${i}`}
            d={d}
            fill={BASE}
            stroke={GROOVE}
            strokeWidth={1}
            transform={`translate(${VIEWBOX.width},0) scale(-1,1)`}
          />
        ))}

        {paint(centre, false)}
        {paint(side, false)}
        {paint(side, true)}
      </Svg>
    </View>
  );
}

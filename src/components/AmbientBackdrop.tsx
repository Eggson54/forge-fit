import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * Ambient backdrop for text-light screens (onboarding, auth): a soft ember glow
 * and two oversized forge hexagons at low opacity. It gives the dark ground
 * depth and a sense of place without adding anything the user has to read.
 */
const HEX = 'M100 6 176 50 176 138 100 182 24 138 24 50Z';

export function AmbientBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="xMidYMax slice">
        <Defs>
          <RadialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor="#FF5A1F" stopOpacity="0.18" />
            <Stop offset="0.55" stopColor="#FF5A1F" stopOpacity="0.05" />
            <Stop offset="1" stopColor="#FF5A1F" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="-140" y="500" width="700" height="600" fill="url(#glow)" />
        <G stroke="#FF7A3D" fill="none" opacity={0.085}>
          <Path d={HEX} strokeWidth={1.4} transform="translate(120 600) scale(1.7)" />
          <Path d={HEX} strokeWidth={1} transform="translate(-110 660) scale(1.15)" />
        </G>
      </Svg>
    </View>
  );
}

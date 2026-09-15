import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { Text } from './ui/Text';

/**
 * Original ForgeFit logomark: a forge hexagon enclosing an energy bolt. Built
 * ascending bars — evokes progression and the forge. Text/vector only.
 */
export function BrandMark({ size = 40 }: { size?: number }) {
  const gid = React.useId();
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <LinearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor="#E7430C" />
          <Stop offset="1" stopColor="#FFB020" />
        </LinearGradient>
      </Defs>
      {/* forge hexagon + energy bolt */}
      <Path d="M24 3 L41 13 V35 L24 45 L7 35 V13 Z" fill="none" stroke={`url(#${gid})`} strokeWidth={2.6} strokeLinejoin="round" />
      <Path d="M26 12 L17 26 H23 L22 36 L31 21 H25 Z" fill={`url(#${gid})`} />
    </Svg>
  );
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <BrandMark size={size + 12} />
      <Text variant="h3" style={{ fontSize: size, letterSpacing: 0.5 }}>
        FORGE<Text variant="h3" color="#FF5A1F" style={{ fontSize: size }}>FIT</Text>
      </Text>
    </View>
  );
}

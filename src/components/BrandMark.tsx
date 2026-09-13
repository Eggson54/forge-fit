import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { gradients } from '../theme';
import { Text } from './ui/Text';

/**
 * Original ForgeFit logomark: an upward "anvil spark" chevron formed from two
 * ascending bars — evokes progression and the forge. Text/vector only.
 */
export function BrandMark({ size = 40 }: { size?: number }) {
  const gid = React.useId();
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <LinearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor={gradients.ember[1]} />
          <Stop offset="1" stopColor={gradients.forge[1]} />
        </LinearGradient>
      </Defs>
      {/* ascending chevrons */}
      <Path d="M6 30 L18 16 L24 23 L18 30 L24 37 Z" fill={`url(#${gid})`} />
      <Path d="M24 30 L36 16 L42 23 L36 30 L42 37 Z" fill={`url(#${gid})`} opacity={0.92} />
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

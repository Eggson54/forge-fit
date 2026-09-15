import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import { colors } from '../theme';
import { Text } from './ui/Text';

/**
 * Monogram avatar: the initial on a lit disc inside a ring tinted with the
 * athlete's rank colour, so identity and rank read as one thing.
 */
export function Avatar({ initial, size = 76, accent = colors.primary }: { initial: string; size?: number; accent?: string }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id="avfill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#2C3040" />
            <Stop offset="1" stopColor="#1A1D28" />
          </LinearGradient>
          <LinearGradient id="avring" x1="0.1" y1="0" x2="0.9" y2="1">
            <Stop offset="0" stopColor={accent} stopOpacity="0.95" />
            <Stop offset="0.55" stopColor={accent} stopOpacity="0.28" />
            <Stop offset="1" stopColor={accent} stopOpacity="0.9" />
          </LinearGradient>
        </Defs>
        <Circle cx="50" cy="50" r="44" fill="url(#avfill)" />
        <Circle cx="50" cy="50" r="46" fill="none" stroke="url(#avring)" strokeWidth="4" />
        {/* A short top arc reads as a highlight on a curved surface. */}
        <Circle
          cx="50"
          cy="50"
          r="44"
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity="0.16"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeDasharray="70 210"
          strokeDashoffset="35"
        />
      </Svg>
      <Text variant="h1" color={accent}>
        {initial}
      </Text>
    </View>
  );
}

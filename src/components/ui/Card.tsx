import React from 'react';
import { Pressable, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../../theme';

interface Props extends ViewProps {
  children: React.ReactNode;
  onPress?: () => void;
  padded?: boolean;
  style?: ViewStyle | ViewStyle[];
  tone?: 'default' | 'alt' | 'high';
}

export function Card({ children, onPress, padded = true, style, tone = 'default', ...rest }: Props) {
  const bg = tone === 'alt' ? colors.cardAlt : tone === 'high' ? colors.surfaceHigh : colors.card;
  const base: ViewStyle = {
    backgroundColor: bg,
    borderRadius: radius.lg,
    padding: padded ? spacing.lg : 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  };
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [base, style as ViewStyle, pressed && styles.pressed]} {...rest}>
        {children}
      </Pressable>
    );
  }
  return (
    <View style={[base, style as ViewStyle]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
});

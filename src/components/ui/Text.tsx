import React from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { colors, palette, typography } from '../../theme';

type Variant = keyof typeof typography;

interface Props extends RNTextProps {
  variant?: Variant;
  color?: keyof typeof palette | string;
  center?: boolean;
  dim?: boolean;
}

/** App text with a type-scale variant and color token. */
export function Text({ variant = 'body', color, center, dim, style, ...rest }: Props) {
  const resolved =
    color && color in palette ? (palette as Record<string, string>)[color] : color ?? (dim ? colors.textDim : colors.text);
  const base: TextStyle = { ...typography[variant], color: resolved };
  if (center) base.textAlign = 'center';
  return <RNText style={[base, style]} {...rest} />;
}

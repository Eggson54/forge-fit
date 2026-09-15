import React from 'react';
import { Platform, Pressable, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { radius, spacing } from '../../theme';

type Tone = 'default' | 'alt' | 'high';

interface Props extends ViewProps {
  children: React.ReactNode;
  onPress?: () => void;
  padded?: boolean;
  style?: ViewStyle | ViewStyle[];
  tone?: Tone;
}

/**
 * Surface with material: a subtle top-lit vertical gradient, a hairline rim that
 * catches light at the top edge, and a soft drop shadow. Reads as a raised
 * panel rather than a flat grey rectangle.
 */
const TONES: Record<Tone, [string, string]> = {
  default: ['#1A1C26', '#131520'],
  alt: ['#20232F', '#191B26'],
  high: ['#272B3A', '#1F222E'],
};

/**
 * The gradient and rim live in absolutely-positioned layers, so children sit in
 * a nested content view. Callers still pass layout through `style` ("make this
 * card a row"), so those properties are forwarded to the content view; box and
 * outer-flow properties stay on the shell.
 */
const CONTENT_KEYS = [
  'flexDirection',
  'alignItems',
  'justifyContent',
  'flexWrap',
  'gap',
  'rowGap',
  'columnGap',
] as const;

function splitStyle(style?: ViewStyle | ViewStyle[]): { shell: ViewStyle; content: ViewStyle } {
  const flat = (StyleSheet.flatten(style) ?? {}) as ViewStyle;
  const shell: ViewStyle = { ...flat };
  const content: ViewStyle = {};
  for (const k of CONTENT_KEYS) {
    if (flat[k] !== undefined) {
      (content as Record<string, unknown>)[k] = flat[k];
      delete (shell as Record<string, unknown>)[k];
    }
  }
  return { shell, content };
}

export function Card({ children, onPress, padded = true, style, tone = 'default', ...rest }: Props) {
  const gradient = TONES[tone];
  const { shell: passedShell, content: passedContent } = splitStyle(style);

  const shell: ViewStyle = {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 14 },
      android: { elevation: 3 },
      default: { boxShadow: '0 6px 18px rgba(0,0,0,0.32)' } as ViewStyle,
    }),
  };

  const inner: ViewStyle = { padding: padded ? spacing.lg : 0, ...passedContent };

  const body = (
    <LinearGradient colors={gradient} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill as ViewStyle} />
  );

  // A 1px highlight along the top edge sells the "lit from above" read.
  const rim = (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.10)' }}
    />
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [shell, passedShell, pressed && styles.pressed]} {...rest}>
        {body}
        {rim}
        <View style={inner}>{children}</View>
      </Pressable>
    );
  }

  return (
    <View style={[shell, passedShell]} {...rest}>
      {body}
      {rim}
      <View style={inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.9, transform: [{ scale: 0.995 }] },
});

import React, { useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { elevation as ELEVATION, spacing, type Elevation } from '../../theme';

/** Kept for the tones the app already asks for; each maps onto an elevation. */
type Tone = 'default' | 'alt' | 'high';

interface Props extends ViewProps {
  children: React.ReactNode;
  onPress?: () => void;
  padded?: boolean;
  style?: ViewStyle | ViewStyle[];
  tone?: Tone;
  /** Overrides `tone`. Prefer this — it says what the surface is doing. */
  elevation?: Elevation;
  /** A hairline of accent down the left edge, for cards that lead a section. */
  accent?: string;
}

const TONE_ELEVATION: Record<Tone, Elevation> = {
  default: 'raised',
  alt: 'flat',
  high: 'floating',
};

/**
 * Surface with material: a top-lit vertical gradient, a rim that catches light
 * along the top edge, and a shadow sized to its elevation.
 *
 * The four elevations are what stop a screen reading as one flat sheet — see
 * the note on `elevation` in the theme.
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

/**
 * The gradient and rim live in absolutely-positioned layers, so children sit in
 * a nested content view. Callers still pass layout through `style` ("make this
 * card a row"), so those properties are forwarded to the content view; box and
 * outer-flow properties stay on the shell.
 */
/**
 * Outer-flow properties, which have to live on the OUTERMOST element. A
 * pressable card is wrapped in an animated view for the press spring, and
 * leaving `flex: 1` on the inner pressable let that wrapper collapse to its
 * content — two side-by-side cards stopped being equal halves.
 */
const FLOW_KEYS = ['flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'width', 'minWidth', 'maxWidth', 'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical'] as const;

function splitStyle(style?: ViewStyle | ViewStyle[]): { flow: ViewStyle; shell: ViewStyle; content: ViewStyle } {
  const flat = (StyleSheet.flatten(style) ?? {}) as ViewStyle;
  const shell: ViewStyle = { ...flat };
  const content: ViewStyle = {};
  const flow: ViewStyle = {};
  for (const k of CONTENT_KEYS) {
    if (flat[k] !== undefined) {
      (content as Record<string, unknown>)[k] = flat[k];
      delete (shell as Record<string, unknown>)[k];
    }
  }
  for (const k of FLOW_KEYS) {
    if (flat[k] !== undefined) {
      (flow as Record<string, unknown>)[k] = flat[k];
      delete (shell as Record<string, unknown>)[k];
    }
  }
  return { flow, shell, content };
}

function shadowFor(level: Elevation): ViewStyle {
  if (level === 'flat') return {};
  if (level === 'sunken') {
    // No native inset shadow exists; the darker fill and dark rim carry it.
    return Platform.OS === 'web' ? ({ boxShadow: ELEVATION.sunken.shadow } as ViewStyle) : {};
  }
  const deep = level === 'floating';
  return Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: deep ? 14 : 6 },
      shadowOpacity: deep ? 0.5 : 0.3,
      shadowRadius: deep ? 28 : 14,
    },
    android: { elevation: deep ? 10 : 3 },
    default: { boxShadow: ELEVATION[level].shadow } as ViewStyle,
  }) as ViewStyle;
}

export function Card({
  children,
  onPress,
  padded = true,
  style,
  tone = 'default',
  elevation,
  accent,
  ...rest
}: Props) {
  const level: Elevation = elevation ?? TONE_ELEVATION[tone];
  const spec = ELEVATION[level];
  const { flow, shell: passedShell, content: passedContent } = splitStyle(style);
  const scale = useRef(new Animated.Value(1)).current;

  const shell: ViewStyle = {
    borderRadius: spec.radius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: spec.rim,
    overflow: 'hidden',
    ...shadowFor(level),
  };

  const inner: ViewStyle = { padding: padded ? spacing.lg : 0, ...passedContent };

  const layers = (
    <>
      <LinearGradient
        colors={spec.fill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill as ViewStyle}
      />
      {/* A 1px highlight along the top edge sells the "lit from above" read. */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: spec.rimTop }}
      />
      {accent && (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 3, backgroundColor: accent }}
        />
      )}
    </>
  );

  if (onPress) {
    // A spring rather than an opacity flicker: the card should feel like it
    // takes the press, not like it blinked.
    const to = (v: number) =>
      Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 42, bounciness: 4 }).start();
    return (
      <Animated.View style={[flow, { transform: [{ scale }] }]}>
        <Pressable
          onPress={onPress}
          onPressIn={() => to(0.975)}
          onPressOut={() => to(1)}
          style={[shell, { flex: flow.flex !== undefined ? 1 : undefined }]}
          {...rest}
        >
          {layers}
          <View style={inner}>{children}</View>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <View style={[flow, shell, passedShell]} {...rest}>
      {layers}
      <View style={inner}>{children}</View>
    </View>
  );
}

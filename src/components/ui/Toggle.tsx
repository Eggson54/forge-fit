import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors } from '../../theme';

const W = 52;
const H = 31;
const THUMB = 25;

/**
 * On/off switch.
 *
 * React Native's own Switch does not honour thumbColor on web — it paints the
 * knob in the platform accent, so a brand-orange track came out with a green
 * knob hanging off its edge. This draws both halves itself, which also keeps
 * the control identical on iOS, Android and the web build.
 */
export function Toggle({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: value ? 1 : 0,
      duration: 160,
      useNativeDriver: false,
    }).start();
  }, [value, anim]);

  const track = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.surfaceHigh, colors.primary],
  });
  const left = anim.interpolate({ inputRange: [0, 1], outputRange: [3, W - THUMB - 3] });

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
        onValueChange(!value);
      }}
      style={{ opacity: disabled ? 0.45 : 1 }}
    >
      <Animated.View style={{ width: W, height: H, borderRadius: H / 2, backgroundColor: track, justifyContent: 'center' }}>
        <Animated.View
          style={{
            position: 'absolute',
            left,
            width: THUMB,
            height: THUMB,
            borderRadius: THUMB / 2,
            backgroundColor: '#FFFFFF',
            ...Platform.select({
              ios: { shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
              android: { elevation: 2 },
              default: { boxShadow: '0 1px 3px rgba(0,0,0,0.35)' },
            }),
          }}
        />
      </Animated.View>
    </Pressable>
  );
}

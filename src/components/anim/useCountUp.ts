import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

/**
 * Animate a number from its previous value to `value` and return the current
 * frame value. Uses RN's Animated (JS driver) so it works identically on
 * native and web. Safe for rapid target changes — it re-targets smoothly.
 */
export function useCountUp(value: number, duration = 800): number {
  const anim = useRef(new Animated.Value(value)).current;
  const [display, setDisplay] = useState(value);
  const first = useRef(true);

  useEffect(() => {
    const id = anim.addListener(({ value: v }) => setDisplay(v));
    return () => anim.removeListener(id);
  }, [anim]);

  useEffect(() => {
    if (first.current) {
      // Animate up from 0 on first mount for a lively entrance.
      first.current = false;
      anim.setValue(0);
    }
    const a = Animated.timing(anim, {
      toValue: value,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    a.start();
    return () => a.stop();
  }, [value, duration, anim]);

  return display;
}

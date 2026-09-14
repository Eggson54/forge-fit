import React from 'react';
import { Text } from '../ui/Text';
import { useCountUp } from './useCountUp';

interface Props extends React.ComponentProps<typeof Text> {
  value: number;
  format?: (n: number) => string;
  duration?: number;
}

/** A <Text> whose numeric value counts up/down smoothly when it changes. */
export function AnimatedNumber({ value, format, duration, ...rest }: Props) {
  const current = useCountUp(value, duration);
  const rounded = Math.round(current);
  return <Text {...rest}>{format ? format(rounded) : String(rounded)}</Text>;
}

import React from 'react';
import { ProgressRing } from '../ui/ProgressRing';
import { useCountUp } from './useCountUp';

type RingProps = React.ComponentProps<typeof ProgressRing>;

/** ProgressRing that animates its fill from 0 to `progress` on mount/changes. */
export function AnimatedProgressRing({ progress, duration = 900, ...rest }: RingProps & { duration?: number }) {
  const animated = useCountUp(progress, duration);
  return <ProgressRing progress={animated} {...rest} />;
}

import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'home'
  | 'dumbbell'
  | 'nutrition'
  | 'progress'
  | 'profile'
  | 'plus'
  | 'flame'
  | 'water'
  | 'bolt'
  | 'timer'
  | 'camera'
  | 'bell';

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/** Minimal stroke icon set (original), drawn with react-native-svg. */
export function Icon({ name, size = 24, color = '#fff', strokeWidth = 2 }: Props) {
  const common = { stroke: color, strokeWidth, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'home' && <Path d="M3 11 L12 4 L21 11 M5 10 V20 H19 V10" {...common} />}
      {name === 'dumbbell' && (
        <>
          <Path d="M2 12 H22" {...common} />
          <Rect x="3" y="8" width="3" height="8" rx="1" {...common} />
          <Rect x="18" y="8" width="3" height="8" rx="1" {...common} />
          <Rect x="6.5" y="9.5" width="2.5" height="5" rx="1" {...common} />
          <Rect x="15" y="9.5" width="2.5" height="5" rx="1" {...common} />
        </>
      )}
      {name === 'nutrition' && (
        <>
          <Path d="M6 3 V10 M9 3 V10 M7.5 10 V21 M6 3 Q6 8 7.5 8 Q9 8 9 3" {...common} />
          <Path d="M16 3 C13 4 13 11 16 11 V21" {...common} />
        </>
      )}
      {name === 'progress' && <Path d="M4 19 V5 M4 19 H20 M7 15 L11 10 L14 13 L19 6" {...common} />}
      {name === 'profile' && (
        <>
          <Circle cx="12" cy="8" r="3.5" {...common} />
          <Path d="M5 20 C5 15 19 15 19 20" {...common} />
        </>
      )}
      {name === 'plus' && <Path d="M12 5 V19 M5 12 H19" {...common} />}
      {name === 'flame' && <Path d="M12 3 C13 7 17 8 15 13 C14 16 10 16 9 13 C8 11 9 9 10 8 C10 11 12 11 12 8 C13 9 13 6 12 3 Z" {...common} />}
      {name === 'water' && <Path d="M12 3 C12 3 18 10 18 14 A6 6 0 0 1 6 14 C6 10 12 3 12 3 Z" {...common} />}
      {name === 'bolt' && <Path d="M13 2 L4 14 H11 L10 22 L20 9 H13 Z" {...common} />}
      {name === 'timer' && (
        <>
          <Circle cx="12" cy="13" r="8" {...common} />
          <Path d="M12 13 V9 M9 2 H15" {...common} />
        </>
      )}
      {name === 'camera' && (
        <>
          <Rect x="3" y="7" width="18" height="13" rx="3" {...common} />
          <Circle cx="12" cy="13" r="3.5" {...common} />
          <Path d="M8 7 L9.5 4 H14.5 L16 7" {...common} />
        </>
      )}
      {name === 'bell' && <Path d="M6 9 A6 6 0 0 1 18 9 C18 15 20 16 20 16 H4 C4 16 6 15 6 9 M10 19 A2 2 0 0 0 14 19" {...common} />}
    </Svg>
  );
}

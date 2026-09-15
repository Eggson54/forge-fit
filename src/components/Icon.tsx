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
  /** Tab icons have a solid variant used for the active state. */
  filled?: boolean;
}

/** Original icon set: crisp 24px stroke icons with solid variants for tabs. */
export function Icon({ name, size = 24, color = '#fff', strokeWidth = 2, filled = false }: Props) {
  const s = { stroke: color, strokeWidth, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'home' &&
        (filled ? (
          <Path d="M12 3.6 21 11.4a1 1 0 0 1-.66 1.75H19.2V19a1.6 1.6 0 0 1-1.6 1.6h-3.2v-5.1h-4.8v5.1H6.4A1.6 1.6 0 0 1 4.8 19v-5.85H3.66A1 1 0 0 1 3 11.4Z" fill={color} />
        ) : (
          <>
            <Path d="M3.5 11.5 12 4.2l8.5 7.3" {...s} />
            <Path d="M5.8 10.6V19a1 1 0 0 0 1 1h3.4v-4.6h3.6V20h3.4a1 1 0 0 0 1-1v-8.4" {...s} />
          </>
        ))}

      {name === 'dumbbell' &&
        (filled ? (
          <>
            <Rect x="9.8" y="10.9" width="4.4" height="2.2" fill={color} />
            <Rect x="2.6" y="7.4" width="4" height="9.2" rx="1.6" fill={color} />
            <Rect x="17.4" y="7.4" width="4" height="9.2" rx="1.6" fill={color} />
            <Rect x="7.2" y="9.4" width="3" height="5.2" rx="1.2" fill={color} />
            <Rect x="13.8" y="9.4" width="3" height="5.2" rx="1.2" fill={color} />
          </>
        ) : (
          <>
            <Path d="M9.6 12h4.8" stroke={color} strokeWidth={2} strokeLinecap="round" />
            <Rect x="2.8" y="7.6" width="4" height="8.8" rx="1.5" {...s} />
            <Rect x="17.2" y="7.6" width="4" height="8.8" rx="1.5" {...s} />
            <Rect x="7.4" y="9.6" width="2.8" height="4.8" rx="1.2" {...s} />
            <Rect x="13.8" y="9.6" width="2.8" height="4.8" rx="1.2" {...s} />
          </>
        ))}

      {name === 'nutrition' &&
        (filled ? (
          <>
            <Path d="M5.6 3a.9.9 0 0 1 1.8 0v4.4h.8V3a.9.9 0 0 1 1.8 0v4.4h.8V3a.9.9 0 0 1 1.8 0v4.6c0 1.7-1 3-2.4 3.3V20a1.1 1.1 0 0 1-2.2 0v-9.1C6.6 10.6 5.6 9.3 5.6 7.6Z" fill={color} />
            <Path d="M17.4 2.6c-2.6.9-3.2 8.6-.8 9.5V20a1.1 1.1 0 0 0 2.2 0V3.6c0-.8-.7-1.3-1.4-1Z" fill={color} />
          </>
        ) : (
          <>
            <Path d="M6.4 3v7.6M9.4 3v7.6M7.9 10.6V21" {...s} />
            <Path d="M6.4 3c0 5 3 5 3 0" {...s} />
            <Path d="M16.6 3c-2.2 1-2.2 8.4 0 8.4V21" {...s} />
          </>
        ))}

      {name === 'progress' &&
        (filled ? (
          <>
            <Path d="M4 3a1 1 0 0 1 1 1v15h15a1 1 0 0 1 0 2H4.6A1.6 1.6 0 0 1 3 19.4V4a1 1 0 0 1 1-1Z" fill={color} />
            <Rect x="7" y="12" width="2.8" height="5" rx="1.1" fill={color} />
            <Rect x="11.6" y="8.4" width="2.8" height="8.6" rx="1.1" fill={color} />
            <Rect x="16.2" y="4.8" width="2.8" height="12.2" rx="1.1" fill={color} />
          </>
        ) : (
          <>
            <Path d="M4 20V4M4 20h16" {...s} />
            <Path d="M7.4 15.4 11 10.6l3 2.7 4.4-6" {...s} />
          </>
        ))}

      {name === 'profile' &&
        (filled ? (
          <>
            <Circle cx="12" cy="7.8" r="4.2" fill={color} />
            <Path d="M12 13.6c4.2 0 7.4 2.3 7.4 6.1a1 1 0 0 1-1 1H5.6a1 1 0 0 1-1-1c0-3.8 3.2-6.1 7.4-6.1Z" fill={color} />
          </>
        ) : (
          <>
            <Circle cx="12" cy="8" r="3.6" {...s} />
            <Path d="M4.8 20c0-4 3.4-6 7.2-6s7.2 2 7.2 6" {...s} />
          </>
        ))}

      {name === 'plus' && <Path d="M12 5v14M5 12h14" {...s} />}
      {name === 'flame' && (
        <Path d="M12.6 2.2c.5 3 3.4 4.2 3.4 7.2 0 .9-.3 1.7-.8 2.3.9-.2 1.7-.8 2.1-1.7 1 1.5 1.6 3.2 1.6 4.8 0 4.1-3.1 7-6.9 7s-6.9-2.9-6.9-7c0-3.4 2.3-6 4.2-7.9-.3 1.6.1 3 .9 3.8.3-3.9 1-6.4 2.4-8.5Z" fill={color} />
      )}
      {name === 'water' && <Path d="M12 2.6c0 0 6.6 7.2 6.6 11.4A6.6 6.6 0 0 1 5.4 14C5.4 9.8 12 2.6 12 2.6Z" fill={color} />}
      {name === 'bolt' && <Path d="M13.6 2 4.8 13.4h5.3L9.4 22l8.9-11.6h-5.4Z" fill={color} />}
      {name === 'timer' && (
        <>
          <Circle cx="12" cy="13.4" r="7.8" {...s} />
          <Path d="M12 13.4V9.2M9.4 2.2h5.2" {...s} />
        </>
      )}
      {name === 'camera' && (
        <>
          <Path d="M3 8.4A1.8 1.8 0 0 1 4.8 6.6h2.3l1.3-2.2h6.8l1.3 2.2h2.7A1.8 1.8 0 0 1 21 8.4v9.4a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 17.8Z" {...s} />
          <Circle cx="12" cy="13" r="3.6" {...s} />
        </>
      )}
      {name === 'bell' && (
        <>
          <Path d="M6.2 9.6a5.8 5.8 0 0 1 11.6 0c0 5.2 2 6.4 2 6.4H4.2s2-1.2 2-6.4Z" {...s} />
          <Path d="M10 19.4a2.2 2.2 0 0 0 4 0" {...s} />
        </>
      )}
    </Svg>
  );
}

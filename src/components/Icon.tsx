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
  | 'bell'
  | 'steps'
  | 'moon'
  | 'scale'
  | 'trophy'
  | 'clock'
  | 'list'
  | 'search'
  | 'target'
  | 'shield'
  | 'trash'
  | 'lock'
  | 'repeat'
  | 'document'
  | 'download'
  | 'help'
  | 'gear'
  | 'card'
  | 'watch'
  | 'check'
  | 'chart'
  | 'sliders';

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
            <Rect x="2.6" y="9.9" width="2.6" height="4.2" rx="1.2" fill={color} />
            <Rect x="6" y="6.6" width="3.4" height="10.8" rx="1.5" fill={color} />
            <Rect x="9.2" y="11" width="5.6" height="2" rx="1" fill={color} />
            <Rect x="14.6" y="6.6" width="3.4" height="10.8" rx="1.5" fill={color} />
            <Rect x="18.8" y="9.9" width="2.6" height="4.2" rx="1.2" fill={color} />
          </>
        ) : (
          <>
            <Path d="M9.6 12h4.8" stroke={color} strokeWidth={2} strokeLinecap="round" />
            <Path d="M8.2 7.8v8.4" stroke={color} strokeWidth={3.2} strokeLinecap="round" fill="none" />
            <Path d="M15.8 7.8v8.4" stroke={color} strokeWidth={3.2} strokeLinecap="round" fill="none" />
            <Path d="M4.4 10.1v3.8" stroke={color} strokeWidth={2.4} strokeLinecap="round" fill="none" />
            <Path d="M19.6 10.1v3.8" stroke={color} strokeWidth={2.4} strokeLinecap="round" fill="none" />
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
      {name === 'steps' && (
        <>
          <Path d="M7.6 3.2c1.7 0 2.7 1.5 2.7 3.6 0 1.5-.5 2.6-.5 3.8 0 1 .4 1.7.4 2.6 0 1.3-1 2.1-2.6 2.1s-2.6-.8-2.6-2.1c0-.9.4-1.6.4-2.6 0-1.2-.5-2.3-.5-3.8 0-2.1 1-3.6 2.7-3.6Z" fill={color} />
          <Path d="M5.4 17.2h4.4c.5 0 .8.4.7.9l-.3 1.5c-.2.8-.9 1.2-1.9 1.2H6.9c-1 0-1.7-.4-1.9-1.2l-.3-1.5c-.1-.5.2-.9.7-.9Z" fill={color} opacity={0.75} />
          <Path d="M16.4 6.8c1.7 0 2.7 1.5 2.7 3.6 0 1.5-.5 2.6-.5 3.8 0 1 .4 1.7.4 2.6 0 1.3-1 2.1-2.6 2.1s-2.6-.8-2.6-2.1c0-.9.4-1.6.4-2.6 0-1.2-.5-2.3-.5-3.8 0-2.1 1-3.6 2.7-3.6Z" fill={color} opacity={0.55} />
        </>
      )}
      {name === 'moon' && (
        <Path d="M20.4 14.6A8.6 8.6 0 0 1 9.4 3.6a8.8 8.8 0 1 0 11 11Z" fill={color} />
      )}
      {name === 'scale' && (
        <>
          <Path d="M4.4 6.6h15.2A1.6 1.6 0 0 1 21.2 8.4v10.2a1.8 1.8 0 0 1-1.8 1.8H4.6a1.8 1.8 0 0 1-1.8-1.8V8.4a1.8 1.8 0 0 1 1.6-1.8Z" {...s} />
          <Path d="M9 11.2a3 3 0 0 1 6 0" {...s} />
        </>
      )}
      {name === 'bell' && (
        <>
          <Path d="M6.2 9.6a5.8 5.8 0 0 1 11.6 0c0 5.2 2 6.4 2 6.4H4.2s2-1.2 2-6.4Z" {...s} />
          <Path d="M10 19.4a2.2 2.2 0 0 0 4 0" {...s} />
        </>
      )}

      {name === 'trophy' && (
        <>
          <Path d="M7.4 4h9.2v4.8a4.6 4.6 0 0 1-9.2 0Z" {...s} />
          <Path d="M7.4 5.6H4.9v1.3a3.2 3.2 0 0 0 2.9 3.1" {...s} />
          <Path d="M16.6 5.6h2.5v1.3a3.2 3.2 0 0 1-2.9 3.1" {...s} />
          <Path d="M12 13.4V17" {...s} />
          <Path d="M8.6 20h6.8l-.8-3H9.4Z" {...s} />
        </>
      )}

      {name === 'clock' && (
        <>
          <Circle cx="12" cy="12" r="8.4" {...s} />
          <Path d="M12 7.4V12l3.1 1.9" {...s} />
        </>
      )}

      {name === 'list' && (
        <>
          <Path d="M9 6.4h11M9 12h11M9 17.6h11" {...s} />
          <Circle cx="4.6" cy="6.4" r="1.4" fill={color} stroke="none" />
          <Circle cx="4.6" cy="12" r="1.4" fill={color} stroke="none" />
          <Circle cx="4.6" cy="17.6" r="1.4" fill={color} stroke="none" />
        </>
      )}

      {name === 'search' && (
        <>
          <Circle cx="10.8" cy="10.8" r="6.4" {...s} />
          <Path d="M15.5 15.5 20.4 20.4" {...s} />
        </>
      )}


      {name === 'target' && (
        <>
          <Circle cx="12" cy="12" r="8.4" {...s} />
          <Circle cx="12" cy="12" r="4.6" {...s} />
          <Circle cx="12" cy="12" r="1.5" fill={color} stroke="none" />
        </>
      )}

      {name === 'shield' && (
        <>
          <Path d="M12 3.2 19 5.8v5.5c0 4.2-2.8 7.6-7 9.5-4.2-1.9-7-5.3-7-9.5V5.8Z" {...s} />
          <Path d="m9.1 12.1 2 2 3.8-3.9" {...s} />
        </>
      )}

      {name === 'trash' && (
        <>
          <Path d="M4.6 6.6h14.8" {...s} />
          <Path d="M9.4 6.6V4.9a1 1 0 0 1 1-1h3.2a1 1 0 0 1 1 1v1.7" {...s} />
          <Path d="M6.5 6.6 7.3 19a1.6 1.6 0 0 0 1.6 1.5h6.2A1.6 1.6 0 0 0 16.7 19l.8-12.4" {...s} />
          <Path d="M10.4 10.2v6.4M13.6 10.2v6.4" {...s} />
        </>
      )}

      {name === 'lock' && (
        <>
          <Rect x="4.8" y="10.4" width="14.4" height="9.8" rx="2.2" {...s} />
          <Path d="M8.4 10.4V7.9a3.6 3.6 0 0 1 7.2 0v2.5" {...s} />
          <Circle cx="12" cy="15.3" r="1.4" fill={color} stroke="none" />
        </>
      )}

      {name === 'repeat' && (
        <>
          <Path d="M4.4 10.2a5 5 0 0 1 5-5h9.3" {...s} />
          <Path d="m15.8 2.4 3 2.8-3 2.8" {...s} />
          <Path d="M19.6 13.8a5 5 0 0 1-5 5H5.3" {...s} />
          <Path d="m8.2 21.6-3-2.8 3-2.8" {...s} />
        </>
      )}

      {name === 'document' && (
        <>
          <Path d="M13.4 3.4H7.2a1.8 1.8 0 0 0-1.8 1.8v13.6a1.8 1.8 0 0 0 1.8 1.8h9.6a1.8 1.8 0 0 0 1.8-1.8V8.4Z" {...s} />
          <Path d="M13.4 3.4v5h5.2" {...s} />
          <Path d="M8.8 13h6.4M8.8 16.6h4.4" {...s} />
        </>
      )}

      {name === 'download' && (
        <>
          <Path d="M12 3.6v10.8" {...s} />
          <Path d="m7.8 10.6 4.2 4.2 4.2-4.2" {...s} />
          <Path d="M4.6 17.4v1.6a1.6 1.6 0 0 0 1.6 1.6h11.6a1.6 1.6 0 0 0 1.6-1.6v-1.6" {...s} />
        </>
      )}

      {name === 'help' && (
        <>
          <Circle cx="12" cy="12" r="8.4" {...s} />
          <Path d="M9.6 9.5a2.5 2.5 0 0 1 4.9.7c0 1.7-2.5 2-2.5 3.6" {...s} />
          <Circle cx="12" cy="16.6" r="1.1" fill={color} stroke="none" />
        </>
      )}

      {name === 'gear' && (
        <>
          <Circle cx="12" cy="12" r="3.1" {...s} />
          <Path d="M19.1 14.5a1.5 1.5 0 0 0 .3 1.7l.1.1a1.8 1.8 0 1 1-2.6 2.6l-.1-.1a1.5 1.5 0 0 0-1.7-.3 1.5 1.5 0 0 0-.9 1.4v.3a1.8 1.8 0 1 1-3.6 0v-.2a1.5 1.5 0 0 0-1-1.4 1.5 1.5 0 0 0-1.7.3l-.1.1a1.8 1.8 0 1 1-2.6-2.6l.1-.1a1.5 1.5 0 0 0 .3-1.7 1.5 1.5 0 0 0-1.4-.9h-.3a1.8 1.8 0 1 1 0-3.6h.2a1.5 1.5 0 0 0 1.4-1 1.5 1.5 0 0 0-.3-1.7l-.1-.1a1.8 1.8 0 1 1 2.6-2.6l.1.1a1.5 1.5 0 0 0 1.7.3h.1a1.5 1.5 0 0 0 .9-1.4v-.3a1.8 1.8 0 1 1 3.6 0v.2a1.5 1.5 0 0 0 .9 1.4 1.5 1.5 0 0 0 1.7-.3l.1-.1a1.8 1.8 0 1 1 2.6 2.6l-.1.1a1.5 1.5 0 0 0-.3 1.7v.1a1.5 1.5 0 0 0 1.4.9h.3a1.8 1.8 0 1 1 0 3.6h-.2a1.5 1.5 0 0 0-1.4.9Z" {...s} />
        </>
      )}

      {name === 'card' && (
        <>
          <Rect x="2.8" y="5.4" width="18.4" height="13.2" rx="2.4" {...s} />
          <Path d="M2.8 10h18.4" {...s} />
          <Path d="M6.6 14.6h3.2" {...s} />
        </>
      )}

      {name === 'watch' && (
        <>
          <Rect x="6.8" y="6.8" width="10.4" height="10.4" rx="3" {...s} />
          <Path d="M9.2 6.8 9.6 3h4.8l.4 3.8" {...s} />
          <Path d="M9.2 17.2 9.6 21h4.8l.4-3.8" {...s} />
          <Path d="M12 9.9V12l1.7 1.1" {...s} />
        </>
      )}


      {name === 'check' && <Path d="m5.2 12.6 4.4 4.4 9.2-10" {...s} strokeWidth={2.4} />}

      {name === 'chart' && (
        <>
          <Path d="M4 20h16" {...s} />
          <Path d="M7 20v-6M12 20V7M17 20v-9" {...s} strokeWidth={2.4} />
        </>
      )}

      {name === 'sliders' && (
        <>
          <Path d="M5 5v5M5 14v5M12 5v3M12 12v7M19 5v9M19 18v1" {...s} />
          <Circle cx="5" cy="12" r="2" {...s} />
          <Circle cx="12" cy="10" r="2" {...s} />
          <Circle cx="19" cy="16" r="2" {...s} />
        </>
      )}

    </Svg>
  );
}

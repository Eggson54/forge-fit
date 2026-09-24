import React from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

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
  | 'sliders'
  | 'calendar'
  | 'chevron_left'
  | 'chevron_right'
  | 'chevron_up'
  | 'chevron_down'
  | 'link_off'
  | 'close'
  | 'minus'
  | 'map'
  | 'copy'
  | 'rivals'
  | 'people'
  | 'levels'
  | 'star';

// Footprint used by the `steps` glyph, drawn once and mirrored for the pair.
const STEP_SOLE =
  'M7.5 3.2c2 0 3.3 1.5 3.3 3.6 0 1.4-.6 2.5-.6 3.5 0 .9.5 1.6.5 2.4 0 1.2-1.2 2-3.2 2s-3.2-.8-3.2-2c0-.8.5-1.5.5-2.4 0-1-.6-2.1-.6-3.5 0-2.1 1.3-3.6 3.3-3.6Z';
const STEP_HEEL =
  'M5.1 15.1h4.8c.6 0 .9.4.8 1l-.3 1.4c-.2.8-.9 1.3-1.9 1.3H6.5c-1 0-1.7-.5-1.9-1.3l-.3-1.4c-.1-.6.2-1 .8-1Z';

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
            <Rect x="4.4" y="11.4" width="15.2" height="1.2" rx="0.6" fill={color} />
            <Rect x="2.8" y="9.6" width="2.6" height="4.8" rx="1.2" fill={color} />
            <Rect x="6.1" y="6.4" width="3.4" height="11.2" rx="1.5" fill={color} />
            <Rect x="9.3" y="10.9" width="5.4" height="2.2" rx="1.1" fill={color} />
            <Rect x="14.5" y="6.4" width="3.4" height="11.2" rx="1.5" fill={color} />
            <Rect x="18.6" y="9.6" width="2.6" height="4.8" rx="1.2" fill={color} />
          </>
        ) : (
          <>
            <Path d="M5 12h14" stroke={color} strokeWidth={1.6} strokeLinecap="round" fill="none" />
            <Path d="M8 12h8" stroke={color} strokeWidth={2.4} strokeLinecap="round" fill="none" />
            <Path d="M7.7 7.4v9.2" stroke={color} strokeWidth={3.4} strokeLinecap="round" fill="none" />
            <Path d="M16.3 7.4v9.2" stroke={color} strokeWidth={3.4} strokeLinecap="round" fill="none" />
            <Path d="M4.2 9.6v4.8" stroke={color} strokeWidth={2.6} strokeLinecap="round" fill="none" />
            <Path d="M19.8 9.6v4.8" stroke={color} strokeWidth={2.6} strokeLinecap="round" fill="none" />
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
      {/* A matched pair of prints: the earlier version faded one print to 55%,
          which at tab size read as two smudges rather than footsteps. */}
      {name === 'steps' && (
        <>
          <G transform="rotate(-8 7.5 11)">
            <Path d={STEP_SOLE} fill={color} />
            <Path d={STEP_HEEL} fill={color} />
          </G>
          <G transform="translate(25,4) scale(-1,1) rotate(-8 7.5 11)">
            <Path d={STEP_SOLE} fill={color} />
            <Path d={STEP_HEEL} fill={color} />
          </G>
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

      {name === 'close' && <Path d="M6.4 6.4 17.6 17.6M17.6 6.4 6.4 17.6" {...s} />}

      {/* A minus, not a cross: the decrement control read as "delete this". */}
      {name === 'minus' && <Path d="M5.6 12h12.8" {...s} />}

      {/* Pin with a hollow eye — the one mark everybody reads as "a place". */}
      {name === 'map' && (
        <>
          <Path d="M12 21.2c4.2-4.6 6.4-7.9 6.4-11a6.4 6.4 0 1 0-12.8 0c0 3.1 2.2 6.4 6.4 11Z" {...s} />
          <Circle cx={12} cy={10} r={2.4} {...s} />
        </>
      )}

      {/* Two offset sheets — the standard "make another one of these" mark. */}
      {name === 'copy' && (
        <>
          <Rect x={8.6} y={8.6} width={11.8} height={11.8} rx={2.2} {...s} />
          <Path d="M16 5.4a2 2 0 0 0-2-2H5.6a2.2 2.2 0 0 0-2.2 2.2V14a2 2 0 0 0 2 2" {...s} />
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


      {/* Ascending steps, for bands you climb. The podium next to it in the
          same grid is also made of bars, so this one is a staircase and a
          marker rather than a fourth bar chart. */}
      {name === 'levels' && (
        <>
          <Path d="M3 20h4.5v-4H3zM9.75 20h4.5v-8h-4.5zM16.5 20H21V6h-4.5z" {...s} strokeLinejoin="round" />
          <Path d="M5.25 12.5 12 8.5l6.75-4" {...s} strokeWidth={1.4} opacity={0.55} />
        </>
      )}

      {/* A podium: first, second, third. The trophy three tiles earlier already
          means a personal record, and standings are a different idea. */}
      {name === 'rivals' && (
        <>
          <Path d="M3 20h18" {...s} />
          <Rect x="9.2" y="6" width="5.6" height="14" rx="1.2" {...s} />
          <Rect x="2.8" y="11.5" width="5.6" height="8.5" rx="1.2" {...s} />
          <Rect x="15.6" y="14" width="5.6" height="6" rx="1.2" {...s} />
        </>
      )}

      {/* Two people, for the social tab.
          The podium above ('rivals') was doing this job and sat next to the
          Progress tab's line chart — two adjacent tabs whose glyphs are both
          made of bars is a discriminability problem at 24px, before anybody's
          colour vision is even considered. This is unmistakably not a chart. */}
      {name === 'people' && (
        <>
          <Circle cx="9" cy="8" r="3.4" {...s} />
          <Path d="M3 19.5c0-3.2 2.7-5.2 6-5.2s6 2 6 5.2" {...s} strokeLinecap="round" />
          <Path d="M16.2 5.1a3.4 3.4 0 0 1 0 6.3" {...s} strokeLinecap="round" opacity={0.75} />
          <Path d="M17.4 14.7c2.1.6 3.6 2.4 3.6 4.8" {...s} strokeLinecap="round" opacity={0.75} />
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

      {name === 'calendar' &&
        (filled ? (
          <>
            <Rect x="3" y="5" width="18" height="16" rx="3" fill={color} />
            <Path d="M8 2.6v3.2M16 2.6v3.2" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
          </>
        ) : (
          <>
            <Rect x="3.2" y="5.2" width="17.6" height="15.6" rx="3" {...s} />
            <Path d="M3.2 10h17.6" {...s} />
            <Path d="M8 3v3.4M16 3v3.4" {...s} />
          </>
        ))}

      {name === 'chevron_left' && <Path d="M14.5 5.5 8 12l6.5 6.5" {...s} />}

      {name === 'chevron_right' && <Path d="M9.5 5.5 16 12l-6.5 6.5" {...s} />}
      {name === 'chevron_up' && <Path d="M5.5 14.5 12 8l6.5 6.5" {...s} />}
      {name === 'chevron_down' && <Path d="M5.5 9.5 12 16l6.5-6.5" {...s} />}

      {name === 'star' &&
        (filled ? (
          <Path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.45 6.19 20.5l1.11-6.47L2.6 9.45l6.5-.95Z" fill={color} />
        ) : (
          <Path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.45 6.19 20.5l1.11-6.47L2.6 9.45l6.5-.95Z" {...s} />
        ))}

      {name === 'link_off' && (
        <>
          <Path d="M9.2 14.8 7.4 16.6a3.6 3.6 0 0 1-5.1-5.1l1.8-1.8" {...s} />
          <Path d="M14.8 9.2l1.8-1.8a3.6 3.6 0 0 1 5.1 5.1l-1.8 1.8" {...s} />
          <Path d="M4 4l16 16" {...s} />
        </>
      )}

    </Svg>
  );
}

/**
 * Original demo rivals for the ranked leaderboard (fictional handles, not real
 * people). In a connected build these are replaced by the user's friends/global
 * leaderboard from the backend.
 */
export interface Rival {
  id: string;
  handle: string;
  score: number;
  weeklyDelta: number;
}

export const DEMO_RIVALS: Rival[] = [
  { id: 'r1', handle: 'IronVanguard', score: 946, weeklyDelta: 12 },
  { id: 'r2', handle: 'AshRunner', score: 902, weeklyDelta: 8 },
  { id: 'r3', handle: 'TitanForge', score: 731, weeklyDelta: -4 },
  { id: 'r4', handle: 'NovaLifts', score: 688, weeklyDelta: 22 },
  { id: 'r5', handle: 'GraniteJaw', score: 604, weeklyDelta: 5 },
  { id: 'r6', handle: 'EmberEdge', score: 512, weeklyDelta: 14 },
  { id: 'r7', handle: 'ColdSteelKe', score: 430, weeklyDelta: -2 },
  { id: 'r8', handle: 'PulseChaser', score: 356, weeklyDelta: 9 },
  { id: 'r9', handle: 'QuietBeast', score: 288, weeklyDelta: 6 },
  { id: 'r10', handle: 'DawnPatrol', score: 210, weeklyDelta: 18 },
  { id: 'r11', handle: 'RookieRise', score: 132, weeklyDelta: 25 },
  { id: 'r12', handle: 'FirstRepFox', score: 74, weeklyDelta: 40 },
];

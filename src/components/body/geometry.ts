import type { MuscleGroup } from '../../domain/types';

/**
 * Figure geometry shared by the full body map and the per-exercise thumbnails.
 *
 * The figure is generated rather than hand-drawn: every segment is a centreline
 * with a half-width at each sample, swept into a smooth closed outline. Editing
 * anatomy then means changing a number ("widen the shoulders") instead of
 * nudging bezier control points, and muscles built from the same centrelines are
 * guaranteed to sit inside the limb they belong to.
 */

export const VIEWBOX = { width: 150, height: 330 } as const;

export const UNTRAINED = '#2F3244';
export const GROOVE = '#171924';
export const BASE = '#262939';

type Sample = readonly [x: number, y: number, halfWidth: number];

/** Catmull-Rom through the points, emitted as cubic beziers. */
function smoothClosed(pts: [number, number][]): string {
  const n = pts.length;
  const at = (i: number) => pts[(i + n) % n]!;
  let d = `M${at(0)[0].toFixed(1)},${at(0)[1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0]!.toFixed(1)},${c1[1]!.toFixed(1)} ${c2[0]!.toFixed(1)},${c2[1]!.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return `${d}Z`;
}

/** Sweep a centreline with half-widths into a closed outline. */
function sweep(samples: readonly Sample[]): string {
  const right = samples.map(([x, y, w]) => [x + w, y] as [number, number]);
  const left = samples.map(([x, y, w]) => [x - w, y] as [number, number]).reverse();
  return smoothClosed([...right, ...left]);
}

// ---------------------------------------------------------------------------
// Silhouette. Canvas is 150 x 330; the figure faces the viewer, centred on x=75,
// and the left half is mirrored for the right.
// ---------------------------------------------------------------------------

const TORSO = sweep([
  [75, 46, 9], // base of neck
  [75, 54, 19], // trap slope
  [75, 63, 29], // deltoid shelf
  [75, 78, 27.5], // chest
  [75, 96, 23], // lower ribs
  [75, 118, 19.2], // waist
  [75, 136, 23], // iliac crest
  [75, 154, 25], // hips
  [75, 164, 23.5], // seat
]);

const ARM = sweep([
  [50, 62, 10.5], // deltoid cap, tucked under the shoulder shelf
  [45.5, 82, 9.8], // biceps belly
  [41.5, 103, 7.4], // above elbow
  [39.5, 116, 6.2], // elbow
  [36.5, 134, 7], // forearm belly
  [33.5, 158, 4.4], // wrist
  [32, 170, 5.2], // hand
  [31, 181, 3.2], // fingertips
]);

const LEG = sweep([
  [62.5, 152, 14], // glute / hip
  [61.5, 176, 14.2], // upper thigh
  [60.5, 206, 12.2], // mid thigh
  [59.5, 232, 8.6], // above knee
  [59, 244, 8.2], // knee
  [58.5, 262, 9.6], // calf belly
  [58, 288, 5.4], // lower calf
  [57.5, 304, 4.2], // ankle
]);

const FOOT =
  'M53.3,300 c-0.6,4.4-1.4,7.6-3.4,9.6 -2.4,2.4-6,3.6-7.6,5.4 -1.6,1.8-0.8,3.8 1.8,4 4.4,0.4 11.4,0.4 14.8,0 2.2-0.3 3.1-1.8 3.1-4 v-15 Z';

// Head and neck as one shape: a seam across the jaw read as a collar.
const HEAD =
  'M75,7 c-8.4,0-15.2,4.4-17.2,11.8 -1.8,6.8-0.2,14.6 3.1,19.8 1.5,2.4 2.8,3.6 3.3,6.2 0.5,2.6 0.2,4.6-0.6,6.2 -0.7,1.4-1.8,2.4-3.1,3.2 h29 c-1.3-0.8-2.4-1.8-3.1-3.2 -0.8-1.6-1.1-3.6-0.6-6.2 0.5-2.6 1.8-3.8 3.3-6.2 3.3-5.2 4.9-13 3.1-19.8 C90.2,11.4 83.4,7 75,7 Z';

/** Shapes drawn once, un-mirrored, then mirrored for the other side. */
export const SIL_CENTRE = [HEAD, TORSO];
export const SIL_MIRROR = [ARM, LEG, FOOT];

// ---------------------------------------------------------------------------
// Muscle overlays. Arm and leg groups reuse the limb centrelines at reduced
// width so they can never spill outside the silhouette.
// ---------------------------------------------------------------------------

const DELT = sweep([
  [50.5, 60, 9.4],
  [47.5, 72, 9.4],
  [45.6, 84, 8],
]);
const UPPER_ARM = sweep([
  [46, 86, 8],
  [43.5, 96, 7.4],
  [41.6, 107, 5.8],
]);
const FOREARM = sweep([
  [39.2, 120, 5.2],
  [37, 133, 6],
  [34.8, 149, 5],
  [33.6, 158, 3.6],
]);
const QUADS = sweep([
  [63, 168, 10.4],
  [62, 190, 10.8],
  [61, 211, 9.4],
  [60, 231, 6.6],
]);
const CALVES = sweep([
  [59, 250, 7.4],
  [58.5, 265, 8.2],
  [58, 281, 6],
  [57.8, 293, 4],
]);
const GLUTES = sweep([
  [63.4, 152, 10.4],
  [62.8, 164, 12.6],
  [62.2, 178, 10.6],
]);
const HAMSTRINGS = sweep([
  [62, 186, 11],
  [61.2, 204, 10.8],
  [60.4, 226, 7.6],
]);

// Torso groups are drawn directly: they follow the ribcage, not a limb. Each
// keeps ~2 units clear of the midline so the mirrored pair reads as a pair.
const PEC = 'M73,70 C63,66.5 55,68 50.8,74 C47.4,79.8 48.8,91 53,98 C57.4,105 67,106.5 73,103.5 Z';
const OBLIQUE = 'M63.8,104 C58.8,108 56,117.5 56.8,128.5 C57.6,138 60.8,144 65,146.5 L66.6,106 Z';
const ABS = 'M64.6,101 C64.6,98.6 85.4,98.6 85.4,101 L83.8,136 C81.6,144.5 68.4,144.5 66.2,136 Z';
// Back: a lat wing from the armpit tapering to the waist, leaving a spine gap.
const LAT = 'M72.8,66 C63.5,64 55.5,68.5 51.6,77 C48.4,84.5 49.6,97.5 54,107.5 C58,116.5 65,124.5 71,128.5 L72.8,118 Z';
const TRAPS = 'M75,47 C67,47 62,51 59.5,57.5 L55.5,70 C61,64 68,61 73,61 L77,61 C82,61 89,64 94.5,70 L90.5,57.5 C88,51 83,47 75,47 Z';
const ERECTORS = 'M68.6,130 C68.6,127.6 81.4,127.6 81.4,130 L79.8,164 C77.6,155.5 72.4,155.5 70.2,164 Z';

/** [muscle, path] pairs for the mirrored half of each view. */
export const FRONT_SIDE: [MuscleGroup, string][] = [
  ['shoulders', DELT],
  ['chest', PEC],
  ['biceps', UPPER_ARM],
  ['forearms', FOREARM],
  ['core', OBLIQUE],
  ['quads', QUADS],
  ['calves', CALVES],
];
export const BACK_SIDE: [MuscleGroup, string][] = [
  ['shoulders', DELT],
  ['back', LAT],
  ['triceps', UPPER_ARM],
  ['forearms', FOREARM],
  ['glutes', GLUTES],
  ['hamstrings', HAMSTRINGS],
  ['calves', CALVES],
];
export const FRONT_CENTRE: [MuscleGroup, string][] = [['core', ABS]];
export const BACK_CENTRE: [MuscleGroup, string][] = [
  ['back', TRAPS],
  ['back', ERECTORS],
];


/** Which view a muscle is visible from, for a single-figure thumbnail. */
export function viewForMuscle(m: MuscleGroup): 'front' | 'back' {
  return FRONT_SIDE.some(([k]) => k === m) || FRONT_CENTRE.some(([k]) => k === m) ? 'front' : 'back';
}

/** The muscle shapes drawn for a view, split into mirrored and centre pieces. */
export function shapesFor(front: boolean): { side: [MuscleGroup, string][]; centre: [MuscleGroup, string][] } {
  return front ? { side: FRONT_SIDE, centre: FRONT_CENTRE } : { side: BACK_SIDE, centre: BACK_CENTRE };
}

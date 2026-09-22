import { caloriesFromMacros } from './nutrition';
import type { FoodMacros, NutritionEntry } from './types';

/**
 * Judging a meal from a photograph.
 *
 * A model looking at a plate can tell you it is chicken, rice and broccoli.
 * It cannot tell you the rice was 180 g rather than 90 g, and portion size is
 * most of the calories. So everything here is built on one assumption: the
 * estimate is a *starting point the athlete corrects*, never a measurement,
 * and the interface has to make that impossible to miss.
 *
 * That is not pedantry about labelling. Somebody eating at a deficit who
 * trusts a confident-looking 520 for a 900-calorie plate will wonder for
 * weeks why the scale is not moving.
 *
 * The three jobs here are all ones a screen should not be doing inline:
 * deciding whether a returned estimate is internally consistent, deciding how
 * loudly to caveat it, and deciding how big an image is allowed to be.
 */

// ------------------------------------------------------------- images ------

/**
 * The largest image the app will send, in bytes of encoded JPEG.
 *
 * A modern phone camera produces 3–8 MB per frame, and base64 inflates that
 * by a third again. Sending one costs the athlete's data, the server's
 * bandwidth and — because most vision pricing is per image — real money, for
 * no accuracy gain: a plate of food is recognisable at 1024 px. Images are
 * downscaled before this is checked; the limit is the backstop for the
 * pathological case rather than the normal path.
 */
export const MAX_IMAGE_BYTES = 1_500_000;

/** The longest edge an image is downscaled to before sending. */
export const MAX_IMAGE_EDGE = 1024;

/** JPEG quality used for the downscale. Enough for food, a third of the size. */
export const IMAGE_QUALITY = 0.6;

/**
 * Decoded byte count for a base64 payload, without decoding it.
 *
 * Four base64 characters carry three bytes, minus whatever the trailing `=`
 * padding stands in for. Measuring `.length` directly overstates by a third
 * and would reject images that are actually fine.
 */
export function base64Bytes(base64: string): number {
  const clean = base64.replace(/^data:[^,]*,/, '').replace(/\s/g, '');
  if (!clean) return 0;
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

export function imageTooLarge(base64: string, limit = MAX_IMAGE_BYTES): boolean {
  return base64Bytes(base64) > limit;
}

// ---------------------------------------------------------- the result -----

export type Confidence = 'low' | 'medium' | 'high';

export interface PhotoEstimate {
  name: string;
  servingLabel: string;
  macros: FoodMacros;
  confidence: Confidence;
  note: string;
}

/**
 * How hard to caveat, by confidence.
 *
 * Deliberately not scaled smoothly: "high" still says the portion is a guess,
 * because that is true even when the model has correctly identified every
 * item on the plate. The difference between the three is how much else is
 * uncertain, not whether the number can be trusted as measured.
 */
export const CONFIDENCE_COPY: Record<Confidence, string> = {
  high: 'Recognised clearly, but portion size is still estimated from a flat image. Check the amounts.',
  medium: 'Some of this is a guess. Worth correcting the portion and anything it named wrongly.',
  low: 'A rough guess. Treat these numbers as a placeholder and edit them, or weigh the food instead.',
};

export const PHOTO_ESTIMATE_NOTE =
  'An estimate from a photograph, not a measurement. A model cannot see how much rice is under the chicken, and portion size is most of the calories — edit anything that looks wrong before saving. Logged entries from a photo stay marked as estimates.';

export const PHOTO_PRIVACY_NOTE =
  'The photo is sent to the AI server you configured, used to produce this estimate, and not stored by the app. Do not photograph anything you would not want leaving the device.';

// ------------------------------------------------------------- checks ------

export interface EstimateProblem {
  field: 'calories' | 'protein' | 'carbs' | 'fat' | 'serving' | 'name';
  message: string;
}

/**
 * Whether a returned estimate hangs together.
 *
 * A model can return macros that do not add up to the calories it also
 * returned — they are separate numbers in its output, and nothing forces
 * consistency. Rather than silently overwriting one with the other, the
 * mismatch is surfaced so the athlete decides which is closer.
 *
 * The thresholds are loose on purpose. Rounding, alcohol, fibre and sugar
 * alcohols all make the 4/4/9 arithmetic approximate even for correct data,
 * so only a gap big enough to change a decision is worth raising.
 */
export function checkEstimate(estimate: PhotoEstimate): EstimateProblem[] {
  const problems: EstimateProblem[] = [];
  const { macros } = estimate;

  if (!estimate.name.trim()) {
    problems.push({ field: 'name', message: 'It did not name the food. Type what it was.' });
  }

  if (!estimate.servingLabel.trim()) {
    problems.push({ field: 'serving', message: 'No portion given, so this is one unnamed serving.' });
  }

  const derived = caloriesFromMacros(macros);
  if (macros.calories <= 0) {
    problems.push({ field: 'calories', message: 'No calories returned. The macros imply about ' + derived + '.' });
  } else if (derived > 0) {
    const gap = Math.abs(derived - macros.calories);
    // A fifth out is past what rounding and fibre explain.
    if (gap > macros.calories * 0.2 && gap > 40) {
      problems.push({
        field: 'calories',
        message: `Calories say ${macros.calories} but the macros add up to about ${derived}. One of them is wrong.`,
      });
    }
  }

  // A single logged item above this is nearly always a portion mistake rather
  // than a real meal, and it is the mistake that matters most.
  if (macros.calories > 2000) {
    problems.push({ field: 'calories', message: 'That is a very large single entry — check the portion.' });
  }

  if (macros.proteinG > 200) problems.push({ field: 'protein', message: 'Protein looks implausibly high.' });
  if (macros.carbsG > 400) problems.push({ field: 'carbs', message: 'Carbs look implausibly high.' });
  if (macros.fatG > 200) problems.push({ field: 'fat', message: 'Fat looks implausibly high.' });

  return problems;
}

/**
 * What to record as the source of a logged entry.
 *
 * The distinction is kept honest because the history screen shows it, and a
 * typed description that was never photographed should not claim it was. The
 * old code hard-coded 'photo' for both, which made every AI estimate look
 * like it came from a camera.
 */
export function estimateSource(hasImage: boolean): NutritionEntry['source'] {
  return hasImage ? 'photo' : 'manual';
}

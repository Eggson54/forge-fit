import { ftInToCm, toKg } from './units';

/**
 * Is this number a person?
 *
 * Onboarding used to accept anything on its body steps, and those numbers go
 * straight into calorie and protein targets. The typos are ordinary ones —
 * a height in centimetres typed into the feet box, a weight in kilograms
 * typed as pounds — and the output looked authoritative: a 30 lb adult was
 * told to eat 29 g of protein a day, on a screen headed "Your starting
 * targets".
 *
 * The bounds below are deliberately wide. They are here to catch a number
 * that cannot be a person, not to police bodies that are unusual — somebody
 * at either end of these ranges exists and is using a fitness app, and a
 * refusal would be the app telling them they are wrong about themselves.
 * Where a mistake has an obvious shape, the message names it rather than
 * saying only "invalid".
 */

export const HEIGHT_CM = { min: 90, max: 250 };
export const WEIGHT_KG = { min: 25, max: 350 };
/**
 * Thirteen is the floor most app stores and privacy regimes draw for an
 * account at all, and the same floor bioAge already uses. The calorie maths
 * behind the targets is only published for adults, which the targets screen
 * already says; this is the lower bound for being here, not for the maths.
 */
export const AGE = { min: 13, max: 110 };

const parse = (raw: string): number | null => {
  const t = raw.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

export function ageProblem(raw: string): string | null {
  const n = parse(raw);
  // Optional on its step, so blank is fine.
  if (n === null) return null;
  if (Number.isNaN(n) || !Number.isInteger(n)) return 'Age in whole years.';
  if (n < AGE.min) return `ForgeFit is for people aged ${AGE.min} and over.`;
  if (n > AGE.max) return 'That age looks like a typo.';
  return null;
}

export function heightProblem(
  input: { ft: string; inches: string } | { cm: string },
): string | null {
  if ('cm' in input) {
    const cm = parse(input.cm);
    if (cm === null || Number.isNaN(cm)) return 'Height in centimetres, as a number.';
    if (cm >= 3 && cm <= 8) {
      // 5.8 in the centimetre box is somebody's height in feet.
      return `That looks like feet. ${cm} ft is about ${Math.round(cm * 30.48)} cm — or switch to imperial.`;
    }
    if (cm < HEIGHT_CM.min || cm > HEIGHT_CM.max) return `That is ${cm} cm, which looks like a typo.`;
    return null;
  }

  const ft = parse(input.ft);
  const inches = parse(input.inches) ?? 0;
  if (ft === null || Number.isNaN(ft) || Number.isNaN(inches)) return 'Height in feet and inches, as numbers.';
  if (ft >= 90 && ft <= 250) {
    // The single most likely mistake here: centimetres in the feet box.
    return `${ft} ft looks like centimetres. Switch to metric, or enter feet and inches.`;
  }
  if (ft > 8) return `${ft} ft looks like a typo.`;
  if (inches < 0 || inches >= 12) return 'Inches from 0 to 11 — anything over 11 is another foot.';
  const cm = ftInToCm(ft, inches);
  if (cm < HEIGHT_CM.min || cm > HEIGHT_CM.max) return `${ft} ft ${inches} in looks like a typo.`;
  return null;
}

export function weightProblem(raw: string, units: 'imperial' | 'metric', opts: { optional?: boolean } = {}): string | null {
  const n = parse(raw);
  if (n === null) return opts.optional ? null : 'Enter a weight to base the targets on.';
  if (Number.isNaN(n) || n <= 0) return 'Weight as a number.';
  const kg = toKg(n, units);
  if (kg < WEIGHT_KG.min || kg > WEIGHT_KG.max) {
    const unit = units === 'imperial' ? 'lb' : 'kg';
    // Kilograms typed as pounds lands at a weight that is too light, and is
    // by far the likeliest cause of one — so when the same number *read as
    // kilograms* would be a person, say so.
    if (units === 'imperial' && kg < WEIGHT_KG.min && n >= WEIGHT_KG.min && n <= WEIGHT_KG.max) {
      return `${n} lb looks like it might be kilograms. Switch to metric, or enter pounds.`;
    }
    return `${n} ${unit} looks like a typo.`;
  }
  return null;
}

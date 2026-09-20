/** Pure unit conversions. No side effects. */

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;
export const OZ_PER_ML = 0.033814;

export const lbToKg = (lb: number): number => lb * KG_PER_LB;
export const kgToLb = (kg: number): number => kg / KG_PER_LB;
export const inToCm = (inches: number): number => inches * CM_PER_IN;
export const cmToIn = (cm: number): number => cm / CM_PER_IN;

export const round = (n: number, dp = 0): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** Display a weight value in the user's preferred units. */
export function displayWeight(kg: number, units: 'imperial' | 'metric'): { value: number; unit: string } {
  return units === 'imperial'
    ? { value: round(kgToLb(kg), 1), unit: 'lb' }
    : { value: round(kg, 1), unit: 'kg' };
}

/** Convert a user-entered weight (in their units) back to canonical kg. */
export function toKg(value: number, units: 'imperial' | 'metric'): number {
  return units === 'imperial' ? lbToKg(value) : value;
}

/** Feet/inches <-> cm helpers for height entry. */
export function cmToFtIn(cm: number): { ft: number; in: number } {
  const totalIn = cmToIn(cm);
  const ft = Math.floor(totalIn / 12);
  return { ft, in: round(totalIn - ft * 12) };
}

export function ftInToCm(ft: number, inches: number): number {
  return inToCm(ft * 12 + inches);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Thousands separators without relying on Intl, which Hermes ships partially. */
export function groupThousands(n: number): string {
  const s = String(Math.abs(Math.trunc(n)));
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return n < 0 ? `-${out}` : out;
}

/**
 * Training volume. A tenth of a pound is noise here and six raw digits are
 * unreadable, so this groups thousands and switches to "k" once the number
 * stops fitting a stat tile: 8,602 lb / 137.5k lb.
 */
export function displayVolume(kg: number, units: 'imperial' | 'metric'): { value: string; unit: string } {
  const unit = units === 'imperial' ? 'lb' : 'kg';
  const n = units === 'imperial' ? kgToLb(kg) : kg;
  if (n >= 100_000) return { value: `${groupThousands(round(n / 1000))}k`, unit };
  // Abbreviated from a thousand rather than ten thousand, so a list of
  // sessions does not print "8,882 lb" directly above "10.7k lb" — two
  // formats for the same quantity, which reads as two different units.
  if (n >= 1_000) return { value: `${round(n / 1000, 1)}k`, unit };
  return { value: groupThousands(n), unit };
}

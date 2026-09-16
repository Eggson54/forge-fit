import { clamp, round } from './units';
import type {
  ActivityLevel,
  FoodMacros,
  Goal,
  ISODate,
  MealSlot,
  NutritionEntry,
  Profile,
  Targets,
} from './types';

/**
 * Evidence-informed target ESTIMATES. These are starting points a user can edit
 * — the app never presents them as medical prescriptions. See onboarding copy.
 */

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

// Calorie delta applied to maintenance, in kcal.
const GOAL_DELTA: Record<Goal, number> = {
  build_muscle: 250,
  lose_fat: -450,
  recomposition: -150,
  gain_weight: 400,
  maintain: 0,
  athletic_performance: 100,
};

// Protein target as grams per kg of bodyweight.
const GOAL_PROTEIN_PER_KG: Record<Goal, number> = {
  build_muscle: 2.0,
  lose_fat: 2.2,
  recomposition: 2.1,
  gain_weight: 1.8,
  maintain: 1.6,
  athletic_performance: 1.9,
};

/** Mifflin-St Jeor basal metabolic rate. */
export function bmr(weightKg: number, heightCm: number, age: number, sex: Profile['sex']): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (sex === 'male') return base + 5;
  if (sex === 'female') return base - 161;
  // Neutral midpoint when sex is unspecified.
  return base - 78;
}

export function maintenanceCalories(p: Pick<Profile, 'weightKg' | 'heightCm' | 'age' | 'sex' | 'activityLevel'>): number {
  const w = p.weightKg ?? 75;
  const h = p.heightCm ?? 175;
  const a = p.age ?? 30;
  return Math.round(bmr(w, h, a, p.sex) * ACTIVITY_MULTIPLIER[p.activityLevel]);
}

/**
 * Compute recommended daily targets from a profile. Fat is set to ~25% of
 * calories, protein by bodyweight, and carbs fill the remainder. A hard floor
 * keeps recommendations in a safe range (never suggests dangerously low intake).
 */
export function recommendedTargets(p: Profile): Targets {
  const maintenance = maintenanceCalories(p);
  const weightKg = p.weightKg ?? 75;

  let calories = maintenance + GOAL_DELTA[p.goal];
  // Safety floor: never recommend below a sensible minimum.
  const floor = p.sex === 'female' ? 1200 : 1500;
  calories = Math.max(floor, calories);

  const proteinG = Math.round(weightKg * GOAL_PROTEIN_PER_KG[p.goal]);
  const fatCalories = calories * 0.25;
  const fatG = Math.round(fatCalories / 9);
  const proteinCalories = proteinG * 4;
  const carbsG = Math.max(0, Math.round((calories - fatCalories - proteinCalories) / 4));

  return {
    calories: Math.round(calories),
    proteinG,
    carbsG,
    fatG,
    waterOz: Math.round(clamp(weightKg * 1.0, 64, 140)), // ~0.5oz/lb, bounded
    steps: 10000,
    sleepMinutes: 8 * 60,
  };
}

export const EMPTY_MACROS: FoodMacros = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };

/** Scale a per-serving macro set by quantity. */
export function scaleMacros(m: FoodMacros, qty: number): FoodMacros {
  return {
    calories: round(m.calories * qty),
    proteinG: round(m.proteinG * qty, 1),
    carbsG: round(m.carbsG * qty, 1),
    fatG: round(m.fatG * qty, 1),
    fiberG: round((m.fiberG ?? 0) * qty, 1),
  };
}

/** Sum a day's nutrition entries into a single macro total. */
export function sumMacros(entries: NutritionEntry[]): FoodMacros {
  return entries.reduce<FoodMacros>((acc, e) => {
    const scaled = scaleMacros(e.macros, e.quantity);
    return {
      calories: acc.calories + scaled.calories,
      proteinG: round(acc.proteinG + scaled.proteinG, 1),
      carbsG: round(acc.carbsG + scaled.carbsG, 1),
      fatG: round(acc.fatG + scaled.fatG, 1),
      fiberG: round((acc.fiberG ?? 0) + (scaled.fiberG ?? 0), 1),
    };
  }, { ...EMPTY_MACROS });
}

/** Derive calories from macros (validation of AI/estimated outputs). */
export function caloriesFromMacros(m: Pick<FoodMacros, 'proteinG' | 'carbsG' | 'fatG'>): number {
  return Math.round(m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9);
}

/**
 * Validate an estimated macro payload (e.g. from the AI food service) and clamp
 * absurd values. Returns a sanitized copy and whether it looked plausible.
 */
export function sanitizeMacros(m: Partial<FoodMacros>): { macros: FoodMacros; plausible: boolean } {
  const proteinG = clamp(Number(m.proteinG) || 0, 0, 400);
  const carbsG = clamp(Number(m.carbsG) || 0, 0, 800);
  const fatG = clamp(Number(m.fatG) || 0, 0, 400);
  const fiberG = clamp(Number(m.fiberG) || 0, 0, 100);
  const derived = caloriesFromMacros({ proteinG, carbsG, fatG });
  const given = clamp(Number(m.calories) || 0, 0, 5000);
  // If given calories are wildly off the macro-derived value, trust the macros.
  const calories = given > 0 && Math.abs(given - derived) <= derived * 0.25 ? given : derived;
  const plausible = calories > 0 && calories <= 3000;
  return { macros: { calories, proteinG, carbsG, fatG, fiberG }, plausible };
}

export interface FrequentFood {
  name: string;
  servingLabel: string;
  quantity: number;
  macros: FoodMacros;
  slot: MealSlot;
  isEstimate: boolean;
  /** How many times this has been logged in the window. */
  count: number;
  lastLogged: ISODate;
}

/**
 * The foods this person actually eats, most-logged first.
 *
 * People rotate through a short list, so a database search is the slow path
 * for almost every entry. Grouping is by name and serving together: "100 g" of
 * chicken and "1 breast" of chicken are different rows to re-add, and merging
 * them would re-log the wrong portion.
 */
export function frequentFoods(entries: NutritionEntry[], limit = 8): FrequentFood[] {
  const byKey = new Map<string, FrequentFood>();
  for (const e of entries) {
    const key = `${e.name.trim().toLowerCase()}|${e.servingLabel.trim().toLowerCase()}`;
    const found = byKey.get(key);
    if (found) {
      found.count += 1;
      // Keep the most recent portion: what you ate last time is the better
      // guess at what you are about to eat.
      if (e.date > found.lastLogged) {
        found.lastLogged = e.date;
        found.quantity = e.quantity;
        found.macros = e.macros;
        found.slot = e.slot;
      }
    } else {
      byKey.set(key, {
        name: e.name,
        servingLabel: e.servingLabel,
        quantity: e.quantity,
        macros: e.macros,
        slot: e.slot,
        isEstimate: e.isEstimate,
        count: 1,
        lastLogged: e.date,
      });
    }
  }
  return [...byKey.values()]
    .sort((a, b) => b.count - a.count || (a.lastLogged < b.lastLogged ? 1 : -1))
    .slice(0, limit);
}

export interface DailyIntake {
  date: ISODate;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** False when nothing was logged at all — distinct from a zero-calorie day. */
  logged: boolean;
}

export interface IntakeSummary {
  days: DailyIntake[];
  /** Averaged over logged days only; an unlogged day is missing data, not a fast. */
  avgCalories: number;
  avgProteinG: number;
  avgCarbsG: number;
  avgFatG: number;
  loggedDays: number;
  /** Days whose protein reached the target. */
  proteinHits: number;
  /** Days within 10% of the calorie target, either side. */
  calorieHits: number;
}

/**
 * Roll a window of daily intake into the numbers worth acting on.
 *
 * Averages exclude unlogged days on purpose. Counting a day nobody logged as
 * zero calories drags the average toward a starvation number and makes anyone
 * who misses a day look like they are undereating badly — which is exactly
 * when a nutrition screen should not be shouting.
 */
export function summariseIntake(days: DailyIntake[], targets: Targets): IntakeSummary {
  const logged = days.filter((d) => d.logged);
  const mean = (pick: (d: DailyIntake) => number) =>
    logged.length ? Math.round((logged.reduce((a, d) => a + pick(d), 0) / logged.length) * 10) / 10 : 0;

  return {
    days,
    avgCalories: Math.round(mean((d) => d.calories)),
    avgProteinG: mean((d) => d.proteinG),
    avgCarbsG: mean((d) => d.carbsG),
    avgFatG: mean((d) => d.fatG),
    loggedDays: logged.length,
    proteinHits: logged.filter((d) => d.proteinG >= targets.proteinG).length,
    calorieHits: logged.filter((d) => Math.abs(d.calories - targets.calories) <= targets.calories * 0.1).length,
  };
}

/**
 * Adjust one macro so the three of them add up to the calorie target.
 *
 * Calories and macros are entered independently, so they drift apart. Carbs are
 * the default lever because protein and fat both have floors worth defending —
 * protein drives the training result the athlete is here for, and fat below
 * roughly 20% of intake is a line most guidance treats as a floor. Nothing here
 * is a prescription: it is arithmetic on targets the user set, offered as a
 * one-tap fix they can ignore.
 *
 * Returns null when the sum cannot be reached without pushing the adjusted
 * macro below zero — better to say so than to hand back a nonsense target.
 */
export function balanceMacros(
  targets: Pick<Targets, 'calories' | 'proteinG' | 'carbsG' | 'fatG'>,
  adjust: 'carbsG' | 'fatG' = 'carbsG',
): Pick<Targets, 'proteinG' | 'carbsG' | 'fatG'> | null {
  const perGram = adjust === 'fatG' ? 9 : 4;
  const fixedCalories =
    targets.proteinG * 4 + (adjust === 'carbsG' ? targets.fatG * 9 : targets.carbsG * 4);
  const remaining = targets.calories - fixedCalories;
  if (remaining < 0) return null;

  const grams = Math.round(remaining / perGram);
  return {
    proteinG: targets.proteinG,
    carbsG: adjust === 'carbsG' ? grams : targets.carbsG,
    fatG: adjust === 'fatG' ? grams : targets.fatG,
  };
}

/** Default water quick-add amounts, in oz: a glass and a small bottle. */
export const DEFAULT_WATER_QUICK_ADD_OZ = [8, 16];

/**
 * Quick-add amounts for water, honouring the athlete's own if they set them.
 * Sorted ascending and de-duplicated so the row reads small-to-large however
 * the values were entered.
 */
export function waterQuickAdds(custom?: number[]): number[] {
  const usable = (custom ?? []).filter((n) => n > 0 && n <= 200);
  return usable.length ? [...new Set(usable)].sort((a, b) => a - b).slice(0, 4) : DEFAULT_WATER_QUICK_ADD_OZ;
}

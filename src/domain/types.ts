/**
 * Core domain types shared across stores, services and UI.
 * These mirror the Supabase schema (see supabase/migrations) but are the
 * source of truth for the client. Keep them serializable (JSON-safe).
 */

export type UUID = string;
export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string; // full ISO timestamp

export type Goal =
  | 'build_muscle'
  | 'lose_fat'
  | 'recomposition'
  | 'gain_weight'
  | 'maintain'
  | 'athletic_performance';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Experience = 'beginner' | 'intermediate' | 'advanced';
export type Sex = 'male' | 'female' | 'other' | 'prefer_not_say';
export type Units = 'imperial' | 'metric';

export type Equipment =
  | 'bodyweight'
  | 'dumbbells'
  | 'barbell'
  | 'kettlebell'
  | 'machines'
  | 'cables'
  | 'bands'
  | 'full_gym';

export type DietaryPreference =
  | 'none'
  | 'high_protein'
  | 'vegetarian'
  | 'vegan'
  | 'keto'
  | 'paleo'
  | 'mediterranean'
  | 'pescatarian';

export type CoachPersonality = 'friendly' | 'motivational' | 'savage' | 'no_mercy';

export interface Profile {
  id: UUID;
  name: string;
  sex: Sex;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  targetWeightKg: number | null;
  goal: Goal;
  activityLevel: ActivityLevel;
  experience: Experience;
  trainingDaysPerWeek: number;
  preferredWorkoutMinutes: number;
  equipment: Equipment[];
  dietaryPreferences: DietaryPreference[];
  units: Units;
  onboardedAt: ISODateTime | null;
  /**
   * Plate denominations this gym actually has, in display units. Empty means
   * "the usual set" — most people never think about it, and the calculator
   * should not make them before it works.
   */
  availablePlates?: number[];
  /** Quick-add water amounts in oz, e.g. the size of the bottle they carry. */
  waterQuickAddOz?: number[];
}

export interface Targets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterOz: number;
  steps: number;
  sleepMinutes: number;
}

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'
  | 'forearms'
  | 'full_body';

export type ExerciseCategory = 'compound' | 'isolation' | 'cardio' | 'mobility' | 'olympic';

export interface Exercise {
  id: string;
  name: string;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  equipment: Equipment;
  category: ExerciseCategory;
  difficulty: Experience;
  instructions: string[];
  isCustom?: boolean;
  isUnilateral?: boolean;
  /**
   * How a set of this exercise is measured. A plank has no meaningful rep
   * count — logging it as "3 × 1" was the model shrugging.
   */
  tracking?: ExerciseTracking;
}

export type ExerciseTracking =
  /** Weight on the bar, for a number of reps. The default. */
  | 'load'
  /** Bodyweight, optionally with weight added or assisted. */
  | 'bodyweight'
  /** Held or carried for a duration; reps are meaningless. */
  | 'duration';

/**
 * What a set is *for*. Only warmups are excluded from volume, PRs and
 * progression — a drop set or a set taken to failure is real work.
 */
export type SetKind = 'working' | 'warmup' | 'drop' | 'failure';

export interface SetEntry {
  id: string;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  completed: boolean;
  kind?: SetKind;
  /** Seconds held, for exercises measured by duration rather than reps. */
  seconds?: number | null;
  /** @deprecated Superseded by `kind`; still read so older logs keep counting. */
  isWarmup?: boolean;
  isPr?: boolean;
}

export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  name: string;
  primaryMuscle: MuscleGroup;
  notes?: string;
  /** Shared by adjacent exercises trained back-to-back as a superset. */
  supersetGroup?: string;
  restSeconds: number;
  sets: SetEntry[];
  targetReps?: number;
}

export type WorkoutStatus = 'planned' | 'in_progress' | 'completed' | 'skipped';

export interface Workout {
  id: UUID;
  name: string;
  status: WorkoutStatus;
  date: ISODate;
  startedAt: ISODateTime | null;
  completedAt: ISODateTime | null;
  durationSeconds: number | null;
  exercises: WorkoutExercise[];
  focus: MuscleGroup[];
  notes?: string;
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface FoodMacros {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
}

export interface NutritionEntry {
  id: UUID;
  date: ISODate;
  slot: MealSlot;
  name: string;
  quantity: number; // number of servings
  servingLabel: string;
  macros: FoodMacros; // per serving
  source: 'manual' | 'search' | 'photo' | 'recipe' | 'barcode';
  isEstimate: boolean;
  loggedAt: ISODateTime;
}

export interface SavedFood extends FoodMacros {
  id: string;
  name: string;
  brand?: string;
  servingLabel: string;
}

export interface WaterLog {
  id: UUID;
  date: ISODate;
  amountOz: number;
  loggedAt: ISODateTime;
}

export interface WeightLog {
  id: UUID;
  date: ISODate;
  weightKg: number;
  loggedAt: ISODateTime;
}

export interface SleepLog {
  id: UUID;
  date: ISODate;
  minutes: number;
  quality?: number; // 1-5
}

export interface StepsLog {
  id: UUID;
  date: ISODate;
  steps: number;
  source: 'manual' | 'health';
}

export interface MeasurementLog {
  id: UUID;
  date: ISODate;
  chestCm?: number;
  waistCm?: number;
  hipsCm?: number;
  armCm?: number;
  thighCm?: number;
  neckCm?: number;
  bodyFatPct?: number;
}

export type PhotoPose = 'front' | 'side' | 'back';

export interface ProgressPhoto {
  id: UUID;
  date: ISODate;
  pose: PhotoPose;
  uri: string; // local secure uri or remote signed url
  weightKg?: number;
}

export type ReminderType =
  | 'workout'
  | 'water'
  | 'meal'
  | 'protein'
  | 'steps'
  | 'sleep'
  | 'progress_photo'
  | 'weight'
  | 'protocol'
  | 'custom';

export interface Reminder {
  id: UUID;
  type: ReminderType;
  title: string;
  body?: string;
  time: string; // "HH:mm" 24h
  days: number[]; // 0-6, Sun-Sat
  enabled: boolean;
  notificationIds?: string[];
}

export type ProtocolFrequency = 'daily' | 'eod' | 'weekly' | '2x_week' | '3x_week' | 'custom';

export interface Protocol {
  id: UUID;
  name: string;
  dose: number | null;
  unit: string; // mg, mcg, iu, ml — free text, user provided
  frequency: ProtocolFrequency;
  timeOfDay?: string; // HH:mm
  notes?: string;
  reminderEnabled: boolean;
  startedAt: ISODate;
  active: boolean;
}

export interface ProtocolLog {
  id: UUID;
  protocolId: UUID;
  date: ISODate;
  time: string;
  taken: boolean;
  dose: number | null;
  unit: string;
  notes?: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  /** Name of a glyph in the app icon set, not an emoji. */
  icon: string;
  /** Hex tint for the badge medallion. */
  tint: string;
  /** Which tracked number this badge measures. */
  metric: AchievementMetric;
  /** The value of that metric which unlocks it. */
  target: number;
  unlockedAt: ISODateTime | null;
}

export type AchievementMetric =
  | 'workoutsCompleted'
  | 'currentDailyStreak'
  | 'proteinStreak'
  | 'hydrationStreak'
  | 'prsSet'
  | 'progressPhotos'
  | 'bestDisciplineScore'
  | 'gymsClaimed'
  | 'gymKindsClaimed'
  | 'rareGymsClaimed';

export interface StreakState {
  workout: number;
  protein: number;
  nutrition: number;
  hydration: number;
  daily: number;
  longestDaily: number;
  lastActiveDate: ISODate | null;
}

export interface DisciplineWeights {
  workout: number;
  nutrition: number;
  protein: number;
  steps: number;
  water: number;
  sleep: number;
}

export interface CoachSettings {
  personality: CoachPersonality;
  aggression: number; // 0-100
  allowAggressiveLanguage: boolean;
  enabled: boolean;
}

export type SubscriptionTier = 'free' | 'pro';

export interface SubscriptionState {
  tier: SubscriptionTier;
  productId: string | null;
  expiresAt: ISODateTime | null;
  managementUrl?: string | null;
}

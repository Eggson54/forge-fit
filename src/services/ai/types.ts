import type {
  CoachSettings,
  Equipment,
  FoodMacros,
  Goal,
  MuscleGroup,
  Profile,
  Units,
} from '../../domain/types';
import type { CoachContext, CoachIntent, WeeklyStats } from '../../domain/coach';

/** Structured contracts for every AI function. Responses are validated before use. */

export interface FoodAnalysisRequest {
  description?: string;
  imageBase64?: string;
}
export interface FoodAnalysisResult {
  name: string;
  servingLabel: string;
  macros: FoodMacros;
  confidence: 'low' | 'medium' | 'high';
  isEstimate: true;
  note: string;
}

export interface WorkoutGenRequest {
  goal: Goal;
  experience: Profile['experience'];
  equipment: Equipment[];
  durationMinutes: number;
  focus?: MuscleGroup[];
  daysPerWeek: number;
}
export interface GeneratedExercise {
  exerciseId: string;
  name: string;
  primaryMuscle: MuscleGroup;
  sets: number;
  reps: [number, number];
  restSeconds: number;
  /** Shared by adjacent exercises meant to be trained as a superset. */
  supersetGroup?: string;
}
export interface WorkoutGenResult {
  name: string;
  focus: MuscleGroup[];
  estimatedMinutes: number;
  exercises: GeneratedExercise[];
  note: string;
}

export interface CoachMessageRequest {
  context: CoachContext;
  settings: CoachSettings;
  /** What the athlete asked. Omitted for the unprompted daily message. */
  intent?: CoachIntent;
  /**
   * A question in the athlete's own words. When present and no intent is
   * given, the service routes it; a question it will not answer comes back
   * with `declined` set rather than an invented reply.
   */
  question?: string;
}
export interface CoachMessageResult {
  text: string;
  tone: 'praise' | 'nudge' | 'push' | 'reflect';
  /**
   * Set when the coach declined the question rather than answered it — out of
   * scope on safety grounds, or not understood. The UI marks these so a
   * refusal never reads as coaching.
   */
  declined?: 'dosing' | 'sourcing' | 'medical' | 'injury' | 'unknown';
  /**
   * Set when the reply is a reference answer about a compound rather than
   * coaching. Drawn differently, because "BPC-157 has no human trials" is a
   * fact the app is reporting, not something it is telling you to do.
   */
  reference?: { compoundId: string; title: string };
}

export interface WeeklyReviewRequest {
  stats: WeeklyStats;
  settings: CoachSettings;
}
export interface WeeklyReviewResult {
  summary: string;
  highlights: string[];
  focusNextWeek: string;
}

export interface ProgressAnalysisRequest {
  weightSeriesKg: { date: string; value: number }[];
  goal: Goal;
  targetWeightKg: number | null;
  /**
   * Which units the summary sentence should speak in. The numbers on the wire
   * stay canonical kg; this only decides how the prose reads, so a screen that
   * says "141k lb moved" does not also say "0.92 kg/week".
   */
  units: Units;
}
export interface ProgressAnalysisResult {
  trend: 'up' | 'down' | 'flat';
  weeklyRateKg: number;
  summary: string;
  onTrack: boolean;
}

export interface AIService {
  analyzeFood(req: FoodAnalysisRequest): Promise<FoodAnalysisResult>;
  generateWorkout(req: WorkoutGenRequest): Promise<WorkoutGenResult>;
  coachMessage(req: CoachMessageRequest): Promise<CoachMessageResult>;
  weeklyReview(req: WeeklyReviewRequest): Promise<WeeklyReviewResult>;
  analyzeProgress(req: ProgressAnalysisRequest): Promise<ProgressAnalysisResult>;
  readonly isMock: boolean;
}

import type {
  CoachSettings,
  Equipment,
  FoodMacros,
  Goal,
  MuscleGroup,
  Profile,
} from '../../domain/types';
import type { CoachContext, WeeklyStats } from '../../domain/coach';

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
}
export interface CoachMessageResult {
  text: string;
  tone: 'praise' | 'nudge' | 'push' | 'reflect';
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

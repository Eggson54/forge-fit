import { sanitizeMacros } from '../../domain/nutrition';
import { config } from '../config';
import { getSupabase } from '../supabase';
import type {
  AIService,
  CoachMessageRequest,
  CoachMessageResult,
  FoodAnalysisRequest,
  FoodAnalysisResult,
  ProgressAnalysisRequest,
  ProgressAnalysisResult,
  WeeklyReviewRequest,
  WeeklyReviewResult,
  WorkoutGenRequest,
  WorkoutGenResult,
} from './types';

/**
 * Real AI client. Talks to YOUR secure backend (config.ai.apiUrl) which holds
 * the model provider key — never the app. All requests carry the Supabase
 * access token so the backend can authenticate and rate-limit per user.
 */
export class HttpAIService implements AIService {
  readonly isMock = false;
  constructor(private baseUrl: string) {}

  private async authHeader(): Promise<Record<string, string>> {
    const supa = getSupabase();
    const token = supa ? (await supa.auth.getSession()).data.session?.access_token : undefined;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await this.authHeader()) },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new AIError(res.status, text || res.statusText);
    }
    return (await res.json()) as T;
  }

  async analyzeFood(req: FoodAnalysisRequest): Promise<FoodAnalysisResult> {
    const raw = await this.post<FoodAnalysisResult>('/ai/food', req);
    // Never trust remote macros blindly — sanitize before returning.
    const { macros } = sanitizeMacros(raw.macros);
    return { ...raw, macros, isEstimate: true };
  }
  generateWorkout(req: WorkoutGenRequest) {
    return this.post<WorkoutGenResult>('/ai/workout', req);
  }
  coachMessage(req: CoachMessageRequest) {
    return this.post<CoachMessageResult>('/ai/coach', req);
  }
  weeklyReview(req: WeeklyReviewRequest) {
    return this.post<WeeklyReviewResult>('/ai/weekly-review', req);
  }
  analyzeProgress(req: ProgressAnalysisRequest) {
    return this.post<ProgressAnalysisResult>('/ai/progress', req);
  }
}

export class AIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AIError';
  }
}

export const aiClientConfigured = () => config.ai.enabled;

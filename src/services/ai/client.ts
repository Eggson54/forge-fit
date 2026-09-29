import { sanitizeMacros } from '../../domain/nutrition';
import { config } from '../config';
import { getSupabase } from '../supabase';
import { routeCoachRequest } from '../../domain/coachRouting';
import { exerciseCandidates } from '../../domain/exerciseCandidates';
import { EXERCISE_LIBRARY } from '../../data/exercises';
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
    // The library travels with the request so the server can make the ids an
    // enum: a model that has never seen it would otherwise invent them.
    return this.post<WorkoutGenResult>('/ai/workout', {
      ...req,
      candidates: exerciseCandidates(req.equipment, EXERCISE_LIBRARY),
    });
  }
  async coachMessage(req: CoachMessageRequest): Promise<CoachMessageResult> {
    // Refusals, compound facts and computed numbers are answered on the
    // device and never sent. What goes out is the intent, not the question:
    // the athlete's own words stay here, and a server cannot be talked into
    // anything by a sentence it never receives.
    const route = routeCoachRequest(req);
    if (route.kind === 'answered') return route.result;
    const raw = await this.post<CoachMessageResult>('/ai/coach', {
      context: req.context,
      settings: req.settings,
      intent: route.intent,
    });
    // Tone is from a closed set, and anything else the server sent — a
    // `declined` or `reference` flag — is not the server's to set. Those
    // mean something specific in the UI and are only ever set above.
    const tone = (['praise', 'nudge', 'push', 'reflect'] as const).includes(raw.tone) ? raw.tone : 'nudge';
    return { text: String(raw.text ?? '').slice(0, 400), tone };
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

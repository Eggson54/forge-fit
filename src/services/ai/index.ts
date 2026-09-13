import { config } from '../config';
import { HttpAIService } from './client';
import { MockAIService } from './mock';
import type { AIService } from './types';

/**
 * AI facade. Uses the real backend when configured; otherwise the on-device
 * mock. The rest of the app depends only on the AIService interface, so
 * swapping providers is a one-line change here.
 *
 * The HTTP client also falls back to the mock automatically on network/5xx
 * failure so a flaky backend never bricks a user flow (best-effort AI).
 */
class ResilientAI implements AIService {
  readonly isMock: boolean;
  private primary: AIService;
  private fallback = new MockAIService();

  constructor() {
    this.primary = config.ai.enabled ? new HttpAIService(config.ai.apiUrl) : this.fallback;
    this.isMock = !config.ai.enabled;
  }

  private async guard<T>(fn: (svc: AIService) => Promise<T>): Promise<T> {
    try {
      return await fn(this.primary);
    } catch {
      return fn(this.fallback);
    }
  }

  analyzeFood: AIService['analyzeFood'] = (r) => this.guard((s) => s.analyzeFood(r));
  generateWorkout: AIService['generateWorkout'] = (r) => this.guard((s) => s.generateWorkout(r));
  coachMessage: AIService['coachMessage'] = (r) => this.guard((s) => s.coachMessage(r));
  weeklyReview: AIService['weeklyReview'] = (r) => this.guard((s) => s.weeklyReview(r));
  analyzeProgress: AIService['analyzeProgress'] = (r) => this.guard((s) => s.analyzeProgress(r));
}

export const ai: AIService = new ResilientAI();
export * from './types';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { uid } from '../lib/uid';
import { challengeProblem, type Challenge, type ChallengeDraft } from '../domain/challenges';
import { jsonStorage, STORE_KEYS } from './persist';

/**
 * Targets the athlete set themselves.
 *
 * A finished challenge is kept rather than swept away. "I did 100 km in
 * September" is the whole reward, and a list that empties itself the moment
 * you succeed takes the reward with it.
 */

interface ChallengeState {
  challenges: Challenge[];
  create: (draft: ChallengeDraft) => Challenge | null;
  remove: (id: string) => void;
  reset: () => void;
}

export const useChallengeStore = create<ChallengeState>()(
  persist(
    (set) => ({
      challenges: [],

      create: (draft) => {
        // The same validation the screen shows, applied again here: a store
        // that trusts its callers is one screen away from holding a target
        // of NaN.
        if (challengeProblem(draft)) return null;
        const challenge: Challenge = {
          id: uid('ch_'),
          name: draft.name.trim(),
          metric: draft.metric,
          target: draft.target,
          from: draft.from,
          to: draft.to,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ challenges: [challenge, ...s.challenges] }));
        return challenge;
      },

      remove: (id) => set((s) => ({ challenges: s.challenges.filter((c) => c.id !== id) })),
      reset: () => set({ challenges: [] }),
    }),
    { name: STORE_KEYS.challenges, storage: jsonStorage() },
  ),
);

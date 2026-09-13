import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_DISCIPLINE_WEIGHTS } from '../domain/discipline';
import { recommendedTargets } from '../domain/nutrition';
import type {
  CoachSettings,
  DisciplineWeights,
  Profile,
  SubscriptionState,
  Targets,
  Units,
} from '../domain/types';
import { subscriptions } from '../services/subscriptions';
import { jsonStorage, STORE_KEYS } from './persist';

export const DEFAULT_PROFILE: Profile = {
  id: '',
  name: '',
  sex: 'prefer_not_say',
  age: null,
  heightCm: null,
  weightKg: null,
  targetWeightKg: null,
  goal: 'recomposition',
  activityLevel: 'moderate',
  experience: 'beginner',
  trainingDaysPerWeek: 4,
  preferredWorkoutMinutes: 45,
  equipment: ['bodyweight'],
  dietaryPreferences: ['none'],
  units: 'imperial',
  onboardedAt: null,
};

const DEFAULT_TARGETS: Targets = {
  calories: 2200,
  proteinG: 150,
  carbsG: 220,
  fatG: 70,
  waterOz: 100,
  steps: 10000,
  sleepMinutes: 480,
};

const DEFAULT_COACH: CoachSettings = {
  personality: 'motivational',
  aggression: 50,
  allowAggressiveLanguage: true,
  enabled: true,
};

interface ProfileState {
  profile: Profile;
  targets: Targets;
  coach: CoachSettings;
  disciplineWeights: DisciplineWeights;
  subscription: SubscriptionState;
  protocolFeatureEnabled: boolean;

  isPro: () => boolean;
  isOnboarded: () => boolean;

  setProfile: (patch: Partial<Profile>) => void;
  completeOnboarding: (profile: Profile) => void;
  setTargets: (patch: Partial<Targets>) => void;
  recomputeTargets: () => void;
  setCoach: (patch: Partial<CoachSettings>) => void;
  setDisciplineWeights: (w: DisciplineWeights) => void;
  setUnits: (u: Units) => void;
  setProtocolFeatureEnabled: (v: boolean) => void;
  refreshSubscription: () => Promise<void>;
  setSubscription: (s: SubscriptionState) => void;
  reset: () => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      profile: DEFAULT_PROFILE,
      targets: DEFAULT_TARGETS,
      coach: DEFAULT_COACH,
      disciplineWeights: DEFAULT_DISCIPLINE_WEIGHTS,
      subscription: { tier: 'free', productId: null, expiresAt: null },
      protocolFeatureEnabled: false,

      isPro: () => get().subscription.tier === 'pro',
      isOnboarded: () => Boolean(get().profile.onboardedAt),

      setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),

      completeOnboarding: (profile) => {
        const withStamp: Profile = { ...profile, onboardedAt: new Date().toISOString() };
        set({ profile: withStamp, targets: recommendedTargets(withStamp) });
      },

      setTargets: (patch) => set((s) => ({ targets: { ...s.targets, ...patch } })),

      recomputeTargets: () => set((s) => ({ targets: recommendedTargets(s.profile) })),

      setCoach: (patch) =>
        set((s) => {
          const coach = { ...s.coach, ...patch };
          // If aggressive language is disabled, keep aggression modest.
          if (!coach.allowAggressiveLanguage && coach.aggression > 60) coach.aggression = 60;
          return { coach };
        }),

      setDisciplineWeights: (disciplineWeights) => set({ disciplineWeights }),

      setUnits: (units) => set((s) => ({ profile: { ...s.profile, units } })),

      setProtocolFeatureEnabled: (protocolFeatureEnabled) => set({ protocolFeatureEnabled }),

      refreshSubscription: async () => {
        const subscription = await subscriptions.getState();
        set({ subscription });
      },

      setSubscription: (subscription) => set({ subscription }),

      reset: () =>
        set({
          profile: DEFAULT_PROFILE,
          targets: DEFAULT_TARGETS,
          coach: DEFAULT_COACH,
          disciplineWeights: DEFAULT_DISCIPLINE_WEIGHTS,
          subscription: { tier: 'free', productId: null, expiresAt: null },
          protocolFeatureEnabled: false,
        }),
    }),
    { name: STORE_KEYS.profile, storage: jsonStorage() },
  ),
);

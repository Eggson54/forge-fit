import { config } from './config';
import { storage } from './storage';
import type { SubscriptionState } from '../domain/types';

/**
 * Subscription abstraction (RevenueCat-shaped). When RevenueCat keys are absent,
 * a local mock store simulates purchases so the paywall and Pro-gating are fully
 * testable. Swap `configure()` to initialize the real SDK in a dev build.
 */
export interface Product {
  id: string;
  title: string;
  priceString: string;
  period: 'month' | 'year';
  perMonthString?: string;
  savingsLabel?: string;
}

export const PRODUCTS: Product[] = [
  { id: 'forgefit_pro_monthly', title: 'Monthly', priceString: '$7.99', period: 'month' },
  {
    id: 'forgefit_pro_annual',
    title: 'Annual',
    priceString: '$59.99',
    period: 'year',
    perMonthString: '$5.00/mo',
    savingsLabel: 'Save 37%',
  },
];

const MOCK_KEY = 'forgefit:mock_subscription';

export const subscriptions = {
  get usingRealBilling() {
    return config.revenueCat.enabled;
  },

  async configure(_appUserId?: string): Promise<void> {
    // Real: Purchases.configure({ apiKey, appUserID }). Mock: no-op.
  },

  async getState(): Promise<SubscriptionState> {
    if (!config.revenueCat.enabled) {
      const mock = await storage.get<SubscriptionState>(MOCK_KEY);
      return mock ?? { tier: 'free', productId: null, expiresAt: null };
    }
    // Real: read customerInfo.entitlements.active['pro'].
    return { tier: 'free', productId: null, expiresAt: null };
  },

  async getProducts(): Promise<Product[]> {
    return PRODUCTS;
  },

  async purchase(productId: string): Promise<SubscriptionState> {
    if (!config.revenueCat.enabled) {
      const period = productId.includes('annual') ? 365 : 30;
      const state: SubscriptionState = {
        tier: 'pro',
        productId,
        expiresAt: new Date(Date.now() + period * 86_400_000).toISOString(),
      };
      await storage.set(MOCK_KEY, state);
      return state;
    }
    // Real: const { customerInfo } = await Purchases.purchaseStoreProduct(product)
    throw new Error('RevenueCat not initialized');
  },

  async restore(): Promise<SubscriptionState> {
    if (!config.revenueCat.enabled) {
      return (await storage.get<SubscriptionState>(MOCK_KEY)) ?? { tier: 'free', productId: null, expiresAt: null };
    }
    // Real: Purchases.restorePurchases()
    return { tier: 'free', productId: null, expiresAt: null };
  },

  async cancelMock(): Promise<SubscriptionState> {
    const state: SubscriptionState = { tier: 'free', productId: null, expiresAt: null };
    await storage.set(MOCK_KEY, state);
    return state;
  },
};

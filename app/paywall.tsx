import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Button, Screen, Text } from '../src/components/ui';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { BrandMark } from '../src/components/BrandMark';
import { Icon } from '../src/components/Icon';
import { colors, gradients, radius, spacing } from '../src/theme';
import { subscriptions, type Product } from '../src/services/subscriptions';
import { useProfileStore } from '../src/stores/useProfileStore';
import { analytics } from '../src/services/analytics';

const FEATURES = [
  'Unlimited AI food analysis',
  'Advanced AI workout generation',
  'Advanced AI coaching & personalities',
  'Advanced analytics & progress insights',
  'Unlimited reminders & customization',
  'No advertisements',
];

export default function Paywall() {
  const setSubscription = useProfileStore((s) => s.setSubscription);
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState('forgefit_pro_annual');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    analytics.track('paywall_viewed');
    subscriptions.getProducts().then(setProducts);
  }, []);

  const purchase = async () => {
    setLoading(true);
    try {
      const state = await subscriptions.purchase(selected);
      setSubscription(state);
      analytics.track('subscription_started', { tier: 'pro' });
      router.back();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen
      gradient
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button title="Start ForgeFit Pro" onPress={purchase} loading={loading} size="lg" />
          <Pressable onPress={() => subscriptions.restore().then(setSubscription)}>
            <Text variant="caption" color={colors.textDim} center>
              Restore purchases
            </Text>
          </Pressable>
        </View>
      }
    >
      <ScreenHeader onBack={() => router.back()} />
      <View style={{ alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl }}>
        <BrandMark size={56} />
        <Text variant="display" center>
          Take your training seriously.
        </Text>
        <Text variant="body" color={colors.textDim} center>
          Everything you need to stop making excuses.
        </Text>
      </View>

      <View style={{ gap: spacing.md, marginBottom: spacing.xl }}>
        {FEATURES.map((f) => (
          <View key={f} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,90,31,0.15)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="flame" size={15} color={colors.primary} />
            </View>
            <Text variant="body">{f}</Text>
          </View>
        ))}
      </View>

      <View style={{ gap: spacing.md }}>
        {products.map((p) => {
          const active = selected === p.id;
          return (
            <Pressable key={p.id} onPress={() => setSelected(p.id)}>
              <LinearGradient
                colors={active ? gradients.ember : [colors.surface, colors.surface]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ borderRadius: radius.lg, padding: 2 }}
              >
                <View style={{ backgroundColor: active ? 'rgba(0,0,0,0.35)' : colors.surface, borderRadius: radius.lg - 2, padding: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Text variant="title">{p.title}</Text>
                      {p.savingsLabel && (
                        <View style={{ backgroundColor: colors.lime, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
                          <Text variant="caption" color="#0B0B0F">
                            {p.savingsLabel}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text variant="caption" color={colors.textDim}>
                      {p.perMonthString ? `${p.perMonthString} · billed annually` : 'billed monthly'}
                    </Text>
                  </View>
                  <Text variant="h3">{p.priceString}</Text>
                </View>
              </LinearGradient>
            </Pressable>
          );
        })}
      </View>

      <Text variant="caption" color={colors.textFaint} center style={{ marginTop: spacing.xl }}>
        Subscriptions renew automatically until canceled. Cancel anytime in your app store account settings. Prices shown are examples and may vary by region.
      </Text>
    </Screen>
  );
}

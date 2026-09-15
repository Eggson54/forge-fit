import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Button, Screen, Text } from '../src/components/ui';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { BrandMark } from '../src/components/BrandMark';
import { Icon, type IconName } from '../src/components/Icon';
import { colors, radius, spacing } from '../src/theme';
import { subscriptions, type Product } from '../src/services/subscriptions';
import { useProfileStore } from '../src/stores/useProfileStore';
import { analytics } from '../src/services/analytics';

// Each benefit gets its own glyph; six identical bullets read as filler.
const FEATURES: { icon: IconName; label: string }[] = [
  { icon: 'nutrition', label: 'Unlimited AI food analysis' },
  { icon: 'dumbbell', label: 'Advanced AI workout generation' },
  { icon: 'flame', label: 'Advanced AI coaching & personalities' },
  { icon: 'chart', label: 'Advanced analytics & progress insights' },
  { icon: 'bell', label: 'Unlimited reminders & customization' },
  { icon: 'check', label: 'No advertisements' },
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
          <View key={f.label} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ width: 30, height: 30, borderRadius: radius.sm, backgroundColor: 'rgba(255,90,31,0.13)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={f.icon} size={17} color={colors.primary} strokeWidth={1.9} />
            </View>
            <Text variant="body" style={{ flex: 1 }}>
              {f.label}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ gap: spacing.md }}>
        {products.map((p) => {
          const active = selected === p.id;
          return (
            <Pressable key={p.id} onPress={() => setSelected(p.id)}>
              <View
                style={{
                  borderRadius: radius.lg,
                  overflow: 'hidden',
                  borderWidth: active ? 1.5 : StyleSheet.hairlineWidth,
                  borderColor: active ? colors.primary : colors.border,
                }}
              >
                <LinearGradient
                  colors={active ? ['rgba(255,90,31,0.22)', 'rgba(255,90,31,0.06)'] : [colors.surface, colors.surface]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={{ padding: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md }}>
                  <View style={{ flexShrink: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Text variant="title">{p.title}</Text>
                      {p.savingsLabel && (
                        <View
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                            borderRadius: 999,
                            backgroundColor: 'rgba(61,220,132,0.16)',
                            borderWidth: StyleSheet.hairlineWidth,
                            borderColor: 'rgba(61,220,132,0.45)',
                          }}
                        >
                          <Text variant="caption" color={colors.success}>
                            {p.savingsLabel}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text variant="caption" color={colors.textDim}>
                      {p.perMonthString ? `${p.perMonthString} · billed annually` : 'billed monthly'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Text variant="h3">{p.priceString}</Text>
                    {active && <Icon name="check" size={18} color={colors.primary} />}
                  </View>
                </View>
              </View>
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

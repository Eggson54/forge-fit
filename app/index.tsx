import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { colors } from '../src/theme';
import { useAuthStore } from '../src/stores/useAuthStore';
import { useProfileStore } from '../src/stores/useProfileStore';

/** Entry router: sends the user to auth, onboarding, or the app based on state. */
export default function Index() {
  const status = useAuthStore((s) => s.status);
  const onboarded = useProfileStore((s) => Boolean(s.profile.onboardedAt));

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (status === 'unauthenticated') return <Redirect href="/(auth)/sign-in" />;
  if (!onboarded) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)/home" />;
}

// Loaded first and on its own line: Hermes ships URL without searchParams,
// and both the OAuth callback handler and the Strava redirect parser need it.
// Relying on another module to pull it in makes correctness depend on import
// order, which is not a thing to depend on.
import 'react-native-url-polyfill/auto';
import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { FONT_MAP } from '../src/theme/typography';
import { colors } from '../src/theme';
import { useAuthStore } from '../src/stores/useAuthStore';
import { useProfileStore } from '../src/stores/useProfileStore';
import { ensureNative } from '../src/services/health';
// Imported for its side effect: the background recording task has to be
// defined when the bundle loads, because that is when iOS looks for it.
import '../src/services/backgroundLocation';
import { notifications } from '../src/services/notifications';
import { setRestAlerts } from '../src/stores/restAlerts';
import { RestTimer } from '../src/components/RestTimer';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const status = useAuthStore((s) => s.status);
  const [fontsLoaded, fontError] = useFonts(FONT_MAP);
  const fontsSettled = fontsLoaded || !!fontError;

  useEffect(() => {
    // Give the rest timer a way to buzz the phone when it is in a pocket. The
    // store itself knows nothing about notifications, so this is where the two
    // are introduced.
    setRestAlerts({
      schedule: (seconds, label) => notifications.scheduleRestEnd(seconds, label),
      cancel: (id) => void notifications.cancel([id]),
    });
    ensureNative();
    // Kick off startup work; persisted stores rehydrate themselves.
    useAuthStore.getState().hydrate();
    useProfileStore.getState().refreshSubscription();
  }, []);

  useEffect(() => {
    if (status !== 'loading' && fontsSettled) SplashScreen.hideAsync().catch(() => {});
  }, [status, fontsSettled]);

  // Hold the splash until the type system is ready so text never reflows. If a
  // face fails to load we render anyway with the platform fallback rather than
  // stranding the user on a blank screen.
  if (!fontsSettled) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="paywall" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="coach" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="log" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="workout/active" options={{ animation: 'slide_from_bottom' }} />
          </Stack>
          {/* Above the navigator, so a rest started in a session keeps running
              while the user wanders off to the food log or the gym map. */}
          <RestTimer />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

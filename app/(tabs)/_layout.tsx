import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Icon, type IconName } from '../../src/components/Icon';
import { Text } from '../../src/components/ui/Text';
import { colors, spacing } from '../../src/theme';

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: 'home', label: 'Home', icon: 'home' },
  { name: 'workout', label: 'Workout', icon: 'dumbbell' },
  { name: 'nutrition', label: 'Nutrition', icon: 'nutrition' },
  { name: 'progress', label: 'Progress', icon: 'progress' },
  { name: 'profile', label: 'Profile', icon: 'profile' },
];

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => (
        <View style={[styles.wrap, { paddingBottom: insets.bottom || spacing.md }]}>
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.bar}>
            {state.routes.map((route, index) => {
              const tab = TABS.find((t) => t.name === route.name);
              if (!tab) return null;
              const focused = state.index === index;
              return (
                <Pressable
                  key={route.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: focused }}
                  accessibilityLabel={tab.label}
                  style={styles.tab}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
                    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                    if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
                  }}
                >
                  {/* An ember pill behind the active glyph: colour alone is a weak
                      cue at 24px, especially for anyone with reduced colour vision. */}
                  <View style={[styles.iconSlot, focused && styles.iconSlotActive]}>
                    <Icon name={tab.icon} size={23} filled={focused} color={focused ? colors.primary : colors.textFaint} />
                  </View>
                  <Text variant="caption" color={focused ? colors.primary : colors.textFaint} style={{ fontSize: 10 }}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    >
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: 'rgba(11,11,15,0.85)',
  },
  bar: { flexDirection: 'row', paddingTop: spacing.sm },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 2 },
  iconSlot: { width: 46, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  iconSlotActive: { backgroundColor: 'rgba(255,90,31,0.14)' },
});

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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
                  style={styles.tab}
                  onPress={() => {
                    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                    if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
                  }}
                >
                  <Icon name={tab.icon} size={24} filled={focused} color={focused ? colors.primary : colors.textFaint} />
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
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4 },
});

import React from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout, spacing } from '../../theme';

interface Props {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  gradient?: boolean;
  contentStyle?: ViewStyle;
  footer?: React.ReactNode;
  refreshControl?: React.ReactElement;
}

/** Standard screen wrapper: safe-area aware, dark ground, optional scroll. */
export function Screen({ children, scroll = true, padded = true, gradient = false, contentStyle, footer, refreshControl }: Props) {
  const insets = useSafeAreaInsets();
  const pad: ViewStyle = padded ? { paddingHorizontal: layout.screenPadding } : {};

  const inner = (
    <View style={[{ paddingTop: insets.top + spacing.sm, paddingBottom: spacing.xxxl }, pad, contentStyle]}>{children}</View>
  );

  return (
    <View style={styles.root}>
      {gradient && (
        <LinearGradient colors={['#16131C', colors.background]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      )}
      {scroll ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={refreshControl}
        >
          {inner}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{inner}</View>
      )}
      {footer && <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }, pad]}>{footer}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.background, paddingTop: spacing.md },
});

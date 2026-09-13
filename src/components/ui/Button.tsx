import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius, spacing } from '../../theme';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  haptic?: boolean;
}

const HEIGHTS: Record<Size, number> = { sm: 40, md: 50, lg: 56 };

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  fullWidth = true,
  icon,
  style,
  haptic = true,
}: Props) {
  const isDisabled = disabled || loading;
  const height = HEIGHTS[size];

  const handlePress = () => {
    if (isDisabled) return;
    if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onPress?.();
  };

  const content = (
    <View style={styles.row}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.onPrimary : colors.text} />
      ) : (
        <>
          {icon}
          <Text
            variant={size === 'lg' ? 'title' : 'bodyStrong'}
            color={variant === 'primary' ? colors.onPrimary : variant === 'danger' ? colors.danger : colors.text}
          >
            {title}
          </Text>
        </>
      )}
    </View>
  );

  const base: ViewStyle = {
    height,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    opacity: isDisabled ? 0.5 : 1,
    alignSelf: fullWidth ? 'stretch' : 'flex-start',
  };

  if (variant === 'primary') {
    return (
      <Pressable onPress={handlePress} disabled={isDisabled} style={[fullWidth && { alignSelf: 'stretch' }, style]}>
        <LinearGradient colors={gradients.ember} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={base}>
          {content}
        </LinearGradient>
      </Pressable>
    );
  }

  const bg =
    variant === 'secondary' ? colors.surfaceHigh : variant === 'danger' ? 'rgba(255,77,94,0.12)' : 'transparent';
  const border = variant === 'ghost' ? colors.border : 'transparent';

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      style={({ pressed }) => [base, { backgroundColor: bg, borderWidth: variant === 'ghost' ? StyleSheet.hairlineWidth : 0, borderColor: border }, pressed && { opacity: 0.7 }, style]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});

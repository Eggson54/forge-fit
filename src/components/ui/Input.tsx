import React, { useState } from 'react';
import { Platform, StyleSheet, TextInput, View, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme';
import { Text } from './Text';
import { Icon, type IconName } from '../Icon';

interface Props extends TextInputProps {
  label?: string;
  suffix?: string;
  error?: string;
  /** Glyph drawn inside the field, before the text. */
  icon?: IconName;
}

export function Input({ label, suffix, error, icon, style, onFocus, onBlur, ...rest }: Props) {
  const [focused, setFocused] = useState(false);

  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;
  const focusRing: ViewStyle | null = focused && !error ? { backgroundColor: 'rgba(255,90,31,0.06)' } : null;

  return (
    <View style={{ gap: spacing.xs }}>
      {label && (
        <Text variant="label" color={colors.textDim}>
          {label}
        </Text>
      )}
      <View style={[styles.wrap, { borderColor, borderWidth: focused || error ? 1 : StyleSheet.hairlineWidth }, focusRing]}>
        {icon && <Icon name={icon} size={18} color={focused ? colors.primary : colors.textFaint} strokeWidth={1.9} />}
        <TextInput
          placeholderTextColor={colors.textFaint}
          // The field itself draws the focus state, so suppress the browser's
          // own outline on web rather than stacking two rings.
          style={[styles.input, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : null, style]}
          selectionColor={colors.primary}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {suffix && (
          <Text variant="label" color={colors.textFaint}>
            {suffix}
          </Text>
        )}
      </View>
      {error && (
        <Text variant="caption" color={colors.danger}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  input: { flex: 1, color: colors.text, paddingVertical: spacing.md, ...typography.body },
});

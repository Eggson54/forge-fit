import React from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme';
import { Text } from './Text';

interface Props extends TextInputProps {
  label?: string;
  suffix?: string;
  error?: string;
}

export function Input({ label, suffix, error, style, ...rest }: Props) {
  return (
    <View style={{ gap: spacing.xs }}>
      {label && (
        <Text variant="label" color={colors.textDim}>
          {label}
        </Text>
      )}
      <View style={[styles.wrap, error ? { borderColor: colors.danger } : null]}>
        <TextInput
          placeholderTextColor={colors.textFaint}
          style={[styles.input, style]}
          selectionColor={colors.primary}
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  input: { flex: 1, color: colors.text, paddingVertical: spacing.md, ...typography.body },
});

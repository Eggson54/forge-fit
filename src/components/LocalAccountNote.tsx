import React from 'react';
import { View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './ui/Text';
import { colors, radius, spacing } from '../theme';
import { LOCAL_ACCOUNT_NOTE, isLocalOnly } from '../services/auth';

/**
 * Said before somebody makes an account, not discovered after they lose one.
 *
 * With no account server, "Create Account" makes a lock on this phone rather
 * than an account anywhere. That is a perfectly good way to use the app — it
 * is how most people will first try it, in Expo Go — but the button's wording
 * implies a backup that does not exist, and the difference only shows up the
 * day someone gets a new phone.
 */
export function LocalAccountNote() {
  if (!isLocalOnly()) return null;
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: spacing.sm,
        alignItems: 'flex-start',
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: `${colors.amber}14`,
        borderWidth: 1,
        borderColor: `${colors.amber}40`,
      }}
    >
      <Icon name="lock" size={16} color={colors.amber} />
      <Text variant="caption" color={colors.textDim} style={{ flex: 1 }}>
        {LOCAL_ACCOUNT_NOTE}
      </Text>
    </View>
  );
}

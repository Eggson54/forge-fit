import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Screen, Text, Input, Button } from '../../src/components/ui';
import { colors, spacing } from '../../src/theme';
import { auth } from '../../src/services/auth';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      await auth.resetPassword(email.trim());
      setMessage('If an account exists for that email, a reset link is on its way.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen gradient>
      <View style={{ gap: spacing.xxl, paddingTop: spacing.huge }}>
        <View style={{ gap: spacing.sm }}>
          <Text variant="h1">Reset password</Text>
          <Text variant="body" color={colors.textDim}>
            Enter your email and we'll send you a link to get back in.
          </Text>
        </View>
        <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" />
        {message && (
          <Text variant="caption" color={colors.success}>
            {message}
          </Text>
        )}
        {error && (
          <Text variant="caption" color={colors.danger}>
            {error}
          </Text>
        )}
        <Button title="Send reset link" onPress={onSubmit} loading={loading} size="lg" />
        <Button title="Back to sign in" variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

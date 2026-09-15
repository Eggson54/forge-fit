import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Link, router } from 'expo-router';
import { Screen, Text, Input, Button } from '../../src/components/ui';
import { SocialAuthButtons } from '../../src/components/SocialAuthButtons';
import { Wordmark } from '../../src/components/BrandMark';
import { colors, spacing } from '../../src/theme';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { isCloudEnabled } from '../../src/services/supabase';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signIn = useAuthStore((s) => s.signIn);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      router.replace('/');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen gradient ambient>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ gap: spacing.xxxl, paddingTop: spacing.huge }}>
          <View style={{ gap: spacing.sm }}>
            <Wordmark size={26} />
            <Text variant="h1" style={{ marginTop: spacing.xl }}>
              Welcome back.
            </Text>
            <Text variant="body" color={colors.textDim}>
              Your coach has been waiting. Let's get back to work.
            </Text>
          </View>

          <View style={{ gap: spacing.lg }}>
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
            />
            <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
            {error && (
              <Text variant="caption" color={colors.danger}>
                {error}
              </Text>
            )}
            <Button title="Sign In" onPress={onSubmit} loading={loading} size="lg" />
            <Link href="/(auth)/forgot-password" asChild>
              <Text variant="label" color={colors.textDim} center>
                Forgot password?
              </Text>
            </Link>
            <SocialAuthButtons />
          </View>

          <View style={{ alignItems: 'center', gap: spacing.sm }}>
            <Link href="/(auth)/sign-up" asChild>
              <Text variant="body" color={colors.text}>
                New here? <Text variant="bodyStrong" color={colors.primary}>Create an account</Text>
              </Text>
            </Link>
            {!isCloudEnabled() && (
              <Text variant="caption" color={colors.textFaint} center>
                Running in offline mode — your account stays on this device.
              </Text>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

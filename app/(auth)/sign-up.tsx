import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Link, router } from 'expo-router';
import { Screen, Text, Input, Button } from '../../src/components/ui';
import { SocialAuthButtons } from '../../src/components/SocialAuthButtons';
import { Wordmark } from '../../src/components/BrandMark';
import { colors, spacing } from '../../src/theme';
import { useAuthStore } from '../../src/stores/useAuthStore';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signUp = useAuthStore((s) => s.signUp);

  const onSubmit = async () => {
    setError(null);
    if (password.length < 6) {
      setError('Use at least 6 characters for your password.');
      return;
    }
    setLoading(true);
    try {
      await signUp(email, password);
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
              Build the habit.
            </Text>
            <Text variant="body" color={colors.textDim}>
              Track everything. Skip the excuses. Your AI coach starts now.
            </Text>
          </View>

          <View style={{ gap: spacing.lg }}>
            <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" />
            <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 6 characters" />
            {error && (
              <Text variant="caption" color={colors.danger}>
                {error}
              </Text>
            )}
            <Button title="Create Account" onPress={onSubmit} loading={loading} size="lg" />
            {/* Through the entry router, not straight to onboarding. Tapping
                Google on this screen is how a *returning* user often signs
                back in — they land on Create account on a fresh install — and
                sending them to onboarding unconditionally made them redo
                eleven steps they had already done. `/` already knows the
                difference, from onboardedAt. */}
            <SocialAuthButtons onDone={() => router.replace('/')} />
          </View>

          <Link href="/(auth)/sign-in" asChild>
            <Text variant="body" color={colors.text} center>
              Already have an account? <Text variant="bodyStrong" color={colors.primary}>Sign in</Text>
            </Text>
          </Link>

          <Text variant="caption" color={colors.textFaint} center>
            By continuing you agree to our Terms and Privacy Policy. ForgeFit is a fitness tracking tool, not medical advice.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

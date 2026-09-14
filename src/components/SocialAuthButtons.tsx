import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { colors, radius, spacing } from '../theme';
import { useAuthStore } from '../stores/useAuthStore';
import { Text } from './ui/Text';

/** Google + Apple sign-in buttons using the standard button treatments. */
export function SocialAuthButtons({ onDone }: { onDone?: () => void }) {
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const signInWithApple = useAuthStore((s) => s.signInWithApple);
  const [busy, setBusy] = useState<null | 'google' | 'apple'>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (which: 'google' | 'apple', fn: () => Promise<void>) => {
    setError(null);
    setBusy(which);
    try {
      await fn();
      if (onDone) onDone();
      else router.replace('/');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.dividerRow}>
        <View style={styles.line} />
        <Text variant="caption" color={colors.textFaint}>or continue with</Text>
        <View style={styles.line} />
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Pressable style={[styles.btn, { backgroundColor: '#FFFFFF' }]} disabled={busy !== null} onPress={() => run('google', signInWithGoogle)}>
          {busy === 'google' ? (
            <ActivityIndicator color="#111" />
          ) : (
            <>
              <GoogleIcon />
              <Text variant="bodyStrong" color="#1A1A1A">Google</Text>
            </>
          )}
        </Pressable>

        <Pressable style={[styles.btn, { backgroundColor: '#000000', borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }]} disabled={busy !== null} onPress={() => run('apple', signInWithApple)}>
          {busy === 'apple' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <AppleIcon />
              <Text variant="bodyStrong" color="#FFFFFF">Apple</Text>
            </>
          )}
        </Pressable>
      </View>

      {error && (
        <Text variant="caption" color={colors.danger} center>
          {error}
        </Text>
      )}
    </View>
  );
}

function GoogleIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.2-.1-2.3-.4-3.5z" />
      <Path fill="#FF3D00" d="M4.3 12.7l6.6 4.8C12.7 13.6 17 10.5 24 10.5c3 0 5.8 1.1 7.9 3l5.7-5.7C34.6 4.1 29.6 2 24 2 15.9 2 8.8 6.6 4.3 12.7z" />
      <Path fill="#4CAF50" d="M24 46c5.5 0 10.4-2.1 14.1-5.5l-6.5-5.5c-2 1.5-4.6 2.5-7.6 2.5-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C8.7 41.3 15.8 46 24 46z" />
      <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.5 5.5C41.4 36.6 45 31 45 24c0-1.2-.1-2.3-.4-3.5z" />
    </Svg>
  );
}

function AppleIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path fill="#fff" d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.8-3.5.8-.7 0-1.9-.8-3.1-.8-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.5.8 1.1 1.7 2.4 3 2.3 1.2-.1 1.6-.8 3.1-.8 1.4 0 1.8.8 3.1.8 1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.5-1-2.5-3.9zM14.1 5.8c.7-.8 1.1-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.xs },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  btn: { flex: 1, height: 50, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
});

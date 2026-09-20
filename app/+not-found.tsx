import React from 'react';
import { View } from 'react-native';
import { Link, router, usePathname } from 'expo-router';
import { Button, Card, Screen, Text } from '../src/components/ui';
import { Icon } from '../src/components/Icon';
import { colors, radius, spacing } from '../src/theme';

/**
 * A dead link inside the app.
 *
 * Without this, Expo Router's stock screen takes over: white headings, blue
 * links and a raw URL, none of which belong to this app — and "Sitemap" offers
 * a developer tool to someone who mistyped something.
 */
export default function NotFound() {
  const path = usePathname();

  return (
    <Screen gradient>
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing.lg, paddingVertical: spacing.xxl }}>
        <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl }}>
          <View style={styles.mark}>
            <Icon name="help" size={28} color={colors.textDim} strokeWidth={1.7} />
          </View>
          <Text variant="h2" center>
            Nothing here
          </Text>
          <Text variant="body" color={colors.textDim} center>
            That link does not lead anywhere in ForgeFit. It may have been a
            screen that moved, or a notification for something you have since
            deleted.
          </Text>
          {!!path && (
            <Text variant="caption" color={colors.textFaint} center numberOfLines={1}>
              {path}
            </Text>
          )}
          <View style={{ alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md }}>
            <Button title="Back to home" onPress={() => router.replace('/(tabs)/home')} />
            {/* Only offered when there is somewhere to go back to; on a cold
                open from a link there is not, and a dead Back button is worse
                than none. */}
            {router.canGoBack() && (
              <Button title="Go back" variant="ghost" onPress={() => router.back()} />
            )}
          </View>
        </Card>

        <Link href="/search" asChild>
          <Text variant="label" color={colors.primary} center>
            Search the app instead ›
          </Text>
        </Link>
      </View>
    </Screen>
  );
}

const styles = {
  mark: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.surfaceHigh,
  },
};

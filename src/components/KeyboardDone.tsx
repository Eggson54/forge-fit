import React from 'react';
import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './ui/Text';
import { colors, spacing } from '../theme';

/**
 * A "Done" bar above the iPhone's number keyboards.
 *
 * iOS's number pad and decimal pad have no return key. Nothing dismisses
 * them but a tap somewhere that happens to handle one, so on a phone the
 * keyboard sat over whatever was below the field: the Continue button in
 * onboarding, the tick that completes a set mid-workout. A browser has a
 * keyboard with a return key, which is why no screenshot ever showed it.
 *
 * One bar, mounted once at the root, and every number field points at it by
 * id — the pattern InputAccessoryView is built for. Android's number
 * keyboards have their own done key, so this is iOS only.
 */

export const KEYBOARD_DONE_ID = 'forgefit-keyboard-done';

const NEEDS_DONE = new Set(['number-pad', 'decimal-pad', 'numeric', 'phone-pad', 'numbers-and-punctuation']);

/** Props to spread onto a TextInput so its keyboard gets the Done bar. */
export function doneAccessory(keyboardType: string | undefined): { inputAccessoryViewID?: string } {
  if (Platform.OS !== 'ios' || !keyboardType || !NEEDS_DONE.has(keyboardType)) return {};
  return { inputAccessoryViewID: KEYBOARD_DONE_ID };
}

export function KeyboardDoneBar() {
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={KEYBOARD_DONE_ID} backgroundColor={colors.surface}>
      <View style={styles.bar}>
        <Pressable
          onPress={() => Keyboard.dismiss()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Done, hide the keyboard"
        >
          <Text variant="bodyStrong" color={colors.primary}>
            Done
          </Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});

import { Platform, type TextStyle } from 'react-native';

/**
 * Suppress the browser's default focus ring on text fields. Every input in the
 * app draws its own focused state, and on web the two rings stacked.
 * `outlineStyle` is a react-native-web extension, hence the cast.
 */
export const noOutline: TextStyle | null =
  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : null;

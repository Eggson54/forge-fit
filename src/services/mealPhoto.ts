import { Platform } from 'react-native';
import { IMAGE_QUALITY, MAX_IMAGE_EDGE, base64Bytes, imageTooLarge } from '../domain/photoEstimate';

/**
 * Getting a photograph of a meal, small enough to send.
 *
 * Every native module is required lazily and literally, because this file has
 * to survive three environments: a development build with a camera, Expo Go
 * without one, and the web bundle where `expo-image-picker` resolves but the
 * camera permission flow does not behave the same way. None of those should
 * throw into a render.
 *
 * The requires are written out one per module rather than through a helper
 * taking a name. Metro resolves `require` statically at bundle time, so
 * `require(someVariable)` is not a dynamic lookup — it is a bundling error,
 * and one that passes both TypeScript and lint before failing at runtime.
 *
 * Downscaling happens here rather than at the call site because it is the
 * difference between a 300 KB request and a 6 MB one, and the caller should
 * not have to remember.
 */

export type PhotoOutcome =
  | { kind: 'ok'; base64: string; uri: string; bytes: number }
  | { kind: 'cancelled' }
  | { kind: 'denied'; reason: string }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'too_large'; reason: string }
  | { kind: 'failed'; reason: string };

interface PickerAsset {
  uri: string;
  base64?: string | null;
  width?: number;
  height?: number;
}

interface PickerModule {
  launchCameraAsync: (opts: Record<string, unknown>) => Promise<{ canceled: boolean; assets?: PickerAsset[] | null }>;
  launchImageLibraryAsync: (opts: Record<string, unknown>) => Promise<{ canceled: boolean; assets?: PickerAsset[] | null }>;
  requestCameraPermissionsAsync: () => Promise<{ granted: boolean; canAskAgain?: boolean }>;
  requestMediaLibraryPermissionsAsync: () => Promise<{ granted: boolean; canAskAgain?: boolean }>;
}

interface ManipulatorModule {
  manipulateAsync: (
    uri: string,
    actions: { resize?: { width?: number; height?: number } }[],
    opts: { compress?: number; format?: unknown; base64?: boolean },
  ) => Promise<{ uri: string; base64?: string | null; width: number; height: number }>;
  SaveFormat: { JPEG: unknown };
}

function picker(): PickerModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-image-picker') as PickerModule;
  } catch {
    return null;
  }
}

function manipulator(): ManipulatorModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-image-manipulator') as ManipulatorModule;
  } catch {
    return null;
  }
}

/**
 * Shrink to something a vision model can read and a phone can upload.
 *
 * A plate of food is recognisable at 1024 px on the long edge; sending 4032
 * costs the athlete's data and the server's money for no extra accuracy.
 * Only the width is constrained — passing both would distort a portrait
 * photo, and expo-image-manipulator keeps the aspect ratio from one side.
 *
 * If the manipulator is not available the original is used, and the size
 * guard downstream decides whether it can be sent. That is better than
 * refusing outright in a build that could still work.
 */
async function shrink(asset: PickerAsset): Promise<{ uri: string; base64: string } | null> {
  const mod = manipulator();
  if (!mod) {
    return asset.base64 ? { uri: asset.uri, base64: asset.base64 } : null;
  }

  try {
    const wide = (asset.width ?? 0) >= (asset.height ?? 0);
    const resize = wide ? { width: MAX_IMAGE_EDGE } : { height: MAX_IMAGE_EDGE };
    const out = await mod.manipulateAsync(asset.uri, [{ resize }], {
      compress: IMAGE_QUALITY,
      format: mod.SaveFormat.JPEG,
      base64: true,
    });
    if (out.base64) return { uri: out.uri, base64: out.base64 };
  } catch {
    // Fall through to the original below.
  }

  return asset.base64 ? { uri: asset.uri, base64: asset.base64 } : null;
}

const PICK_OPTIONS = {
  mediaTypes: ['images'] as const,
  // A square crop is both a smaller upload and a better prompt: it makes the
  // athlete frame the plate rather than the whole table.
  allowsEditing: true,
  quality: IMAGE_QUALITY,
  base64: true,
  exif: false,
};

async function finish(result: { canceled: boolean; assets?: PickerAsset[] | null }): Promise<PhotoOutcome> {
  if (result.canceled) return { kind: 'cancelled' };

  const asset = result.assets?.[0];
  if (!asset) return { kind: 'failed', reason: 'No image came back from the picker.' };

  const shrunk = await shrink(asset);
  if (!shrunk) {
    return { kind: 'failed', reason: 'Could not read that image.' };
  }

  if (imageTooLarge(shrunk.base64)) {
    return {
      kind: 'too_large',
      reason: 'That photo is too big to send even after shrinking. Try a tighter crop.',
    };
  }

  return { kind: 'ok', base64: shrunk.base64, uri: shrunk.uri, bytes: base64Bytes(shrunk.base64) };
}

export const mealPhoto = {
  /** Whether this build can pick an image at all. */
  available(): boolean {
    return picker() !== null;
  },

  /**
   * Whether a live camera is worth offering.
   *
   * On web the picker falls back to a file input, which is a perfectly good
   * way to choose a photo and a confusing way to present a "Take a photo"
   * button that opens a file browser.
   */
  cameraAvailable(): boolean {
    return picker() !== null && Platform.OS !== 'web';
  },

  async capture(): Promise<PhotoOutcome> {
    const mod = picker();
    if (!mod) {
      return { kind: 'unsupported', reason: 'This build has no camera module. Describe the meal instead.' };
    }

    try {
      const permission = await mod.requestCameraPermissionsAsync();
      if (!permission.granted) {
        return {
          kind: 'denied',
          reason:
            permission.canAskAgain === false
              ? 'Camera access is off for ForgeFit. Turn it on in Settings, or choose a photo from your library.'
              : 'Camera access is needed to photograph a meal.',
        };
      }
      return await finish(await mod.launchCameraAsync(PICK_OPTIONS));
    } catch (err) {
      return { kind: 'failed', reason: err instanceof Error ? err.message : 'The camera did not open.' };
    }
  },

  async choose(): Promise<PhotoOutcome> {
    const mod = picker();
    if (!mod) {
      return { kind: 'unsupported', reason: 'This build cannot open a photo library. Describe the meal instead.' };
    }

    try {
      const permission = await mod.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        return { kind: 'denied', reason: 'Photo library access is needed to pick a meal photo.' };
      }
      return await finish(await mod.launchImageLibraryAsync(PICK_OPTIONS));
    } catch (err) {
      return { kind: 'failed', reason: err instanceof Error ? err.message : 'The photo library did not open.' };
    }
  },
};

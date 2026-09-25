import { Platform } from 'react-native';
import { uid } from '../lib/uid';
import type { ActivityPhoto } from '../domain/activityPhotos';

/**
 * Getting a photograph onto an activity.
 *
 * Deliberately not `mealPhoto`, which exists to produce base64 for a vision
 * model and keeps the image small enough to upload. Nothing here is uploaded:
 * what is wanted is a file on the device and a reference to it, at a size
 * worth looking at rather than a size worth sending.
 *
 * The re-encode is the important part and is not an optimisation. A phone
 * writes GPS coordinates into a photograph's EXIF, so a picture taken at the
 * start of a run is a copy of the address a privacy zone exists to hide.
 * Passing it through the manipulator writes a new file from the pixels alone,
 * and the metadata does not come with it. Where the manipulator is missing —
 * Expo Go, some web builds — the original is used and `stripped` comes back
 * false, so the screen can say which of the two happened rather than claiming
 * a protection the build did not apply.
 *
 * Requires are written out one per module: Metro resolves them statically, so
 * `require(someVariable)` is a bundling error that passes both TypeScript and
 * lint before failing at runtime.
 */

export type ActivityPhotoOutcome =
  | { kind: 'ok'; photo: ActivityPhoto; stripped: boolean }
  | { kind: 'cancelled' }
  | { kind: 'denied'; reason: string }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'failed'; reason: string };

/** Long edge. Plenty for a phone screen, a fraction of a 12-megapixel file. */
export const PHOTO_EDGE = 1600;
export const PHOTO_QUALITY = 0.8;

interface PickerAsset {
  uri: string;
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
    opts: { compress?: number; format?: unknown },
  ) => Promise<{ uri: string; width: number; height: number }>;
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

const PICK_OPTIONS = {
  mediaTypes: ['images'] as const,
  // No forced crop. A meal is a plate and squares it nicely; a ridgeline is
  // the whole point of the photograph and cropping it to a square throws the
  // subject away.
  allowsEditing: false,
  quality: PHOTO_QUALITY,
  // Asked for as a belt to the manipulator's braces. Some pickers honour it,
  // none can be relied on to, and the re-encode below is what actually does
  // the work.
  exif: false,
};

async function reencode(asset: PickerAsset): Promise<{ uri: string; stripped: boolean }> {
  const mod = manipulator();
  if (!mod) return { uri: asset.uri, stripped: false };
  try {
    const wide = (asset.width ?? 0) >= (asset.height ?? 0);
    // One side only: constraining both distorts a portrait photograph, and
    // expo-image-manipulator keeps the aspect ratio from whichever is given.
    const resize = wide ? { width: PHOTO_EDGE } : { height: PHOTO_EDGE };
    const out = await mod.manipulateAsync(asset.uri, [{ resize }], {
      compress: PHOTO_QUALITY,
      format: mod.SaveFormat.JPEG,
    });
    return { uri: out.uri, stripped: true };
  } catch {
    return { uri: asset.uri, stripped: false };
  }
}

async function finish(result: { canceled: boolean; assets?: PickerAsset[] | null }): Promise<ActivityPhotoOutcome> {
  if (result.canceled) return { kind: 'cancelled' };
  const asset = result.assets?.[0];
  if (!asset?.uri) return { kind: 'failed', reason: 'No image came back from the picker.' };

  const { uri, stripped } = await reencode(asset);
  return {
    kind: 'ok',
    stripped,
    photo: { id: uid('aph_'), uri, addedAt: new Date().toISOString() },
  };
}

export const activityPhoto = {
  async fromCamera(): Promise<ActivityPhotoOutcome> {
    const mod = picker();
    if (!mod) {
      return { kind: 'unsupported', reason: 'Taking a photo needs a development build.' };
    }
    if (Platform.OS === 'web') {
      // The browser's camera capture goes through the file input, so the
      // library path is the one that works. Saying so beats a dead button.
      return { kind: 'unsupported', reason: 'On the web build, choose an existing photo instead.' };
    }
    const perm = await mod.requestCameraPermissionsAsync();
    if (!perm.granted) {
      return {
        kind: 'denied',
        reason: perm.canAskAgain === false
          ? 'Camera access is off for this app. Settings can turn it back on.'
          : 'Camera access was declined.',
      };
    }
    return finish(await mod.launchCameraAsync(PICK_OPTIONS));
  },

  async fromLibrary(): Promise<ActivityPhotoOutcome> {
    const mod = picker();
    if (!mod) {
      return { kind: 'unsupported', reason: 'Choosing a photo needs a development build.' };
    }
    const perm = await mod.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      return {
        kind: 'denied',
        reason: perm.canAskAgain === false
          ? 'Photo access is off for this app. Settings can turn it back on.'
          : 'Photo access was declined.',
      };
    }
    return finish(await mod.launchImageLibraryAsync(PICK_OPTIONS));
  },
};

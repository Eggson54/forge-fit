import { Platform, Share } from 'react-native';
import { GPX_NOTE, toGpx, type ImportCandidate } from '../domain/gpx';
import { candidatesFrom, looksLikeGpx } from '../domain/gpx';
import type { TrackPoint } from '../domain/track';
import { planToGpx, type SavedRoute } from '../domain/routePlan';

/**
 * Getting GPX files in and out of the app.
 *
 * Every native module here is required lazily and every one has a fallback,
 * because this file has to work in three quite different places: a
 * development build with everything available, Expo Go without the document
 * picker, and the web build where "a file" means something else entirely.
 * None of those should be a crash, and none of them should be a silent
 * no-op either — the caller gets told which one it is.
 */

export type PickOutcome =
  | { kind: 'ok'; name: string; text: string }
  | { kind: 'cancelled' }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'unreadable'; reason: string };

interface PickerModule {
  getDocumentAsync: (opts: {
    type?: string | string[];
    copyToCacheDirectory?: boolean;
    multiple?: boolean;
  }) => Promise<{
    canceled: boolean;
    assets?: { uri: string; name: string; mimeType?: string | null }[] | null;
  }>;
}

interface FsModule {
  readAsStringAsync: (uri: string) => Promise<string>;
  writeAsStringAsync: (uri: string, contents: string) => Promise<void>;
  cacheDirectory: string | null;
}

interface SharingModule {
  isAvailableAsync: () => Promise<boolean>;
  shareAsync: (uri: string, opts?: { mimeType?: string; dialogTitle?: string; UTI?: string }) => Promise<void>;
}

/**
 * The three optional native modules, each required by a literal path.
 *
 * A generic `lazy(name)` helper reads better and does not build: Metro
 * resolves requires statically, so `require(someVariable)` is a syntax error
 * at bundle time — which neither TypeScript nor ESLint will tell you.
 */
function loadPicker(): PickerModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-document-picker') as PickerModule;
  } catch {
    return null;
  }
}

function loadFs(): FsModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-file-system') as FsModule;
  } catch {
    return null;
  }
}

function loadSharing(): SharingModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-sharing') as SharingModule;
  } catch {
    return null;
  }
}

export const gpxFiles = {
  /**
   * Ask for a GPX file and read it.
   *
   * `type` is left wide rather than pinned to a GPX mime type: the correct one
   * is `application/gpx+xml`, and a good half of the tools that produce these
   * files label them `application/octet-stream`, `text/xml` or nothing at all.
   * Filtering strictly hides the user's own files from them in the picker.
   */
  async pick(): Promise<PickOutcome> {
    const picker = loadPicker();
    const fs = loadFs();

    if (!picker || !fs) {
      return {
        kind: 'unsupported',
        reason:
          'Choosing a file needs a development build. You can still paste the contents of a .gpx file below.',
      };
    }

    try {
      const result = await picker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return { kind: 'cancelled' };

      const asset = result.assets?.[0];
      if (!asset) return { kind: 'cancelled' };

      const text = await fs.readAsStringAsync(asset.uri);
      if (!looksLikeGpx(text)) {
        return {
          kind: 'unreadable',
          reason: `${asset.name} is not a GPX file. Watches and services usually offer "Export GPX" somewhere in an activity's menu.`,
        };
      }
      return { kind: 'ok', name: asset.name, text };
    } catch (e) {
      return { kind: 'unreadable', reason: (e as Error).message || 'That file could not be read.' };
    }
  },

  /** Parse whatever came back, from the picker or from a paste. */
  read(text: string): ImportCandidate[] {
    return looksLikeGpx(text) ? candidatesFrom(text) : [];
  },

  async export(points: TrackPoint[], opts: { name: string; type?: string }): Promise<boolean> {
    return deliver(toGpx(points, { name: opts.name, type: opts.type }), opts.name, 'activity');
  },

  /**
   * Hand out a *planned* route rather than a recorded one.
   *
   * Separate from `export` above because the two carry different XML — a
   * `<rte>` against a `<trk>` — and a watch treats them as different things.
   * Sharing the delivery code and not the document is the point.
   */
  async exportRoute(route: SavedRoute): Promise<boolean> {
    return deliver(planToGpx(route), route.name, 'route');
  },

  note: GPX_NOTE,
};

/**
 * Get a GPX document to wherever the platform puts files.
 *
 * On a phone that is the share sheet with a real file attached, so it can go
 * to Files, a watch's companion app, a mail draft. `Share.share` with the XML
 * as a message would technically work and would paste six thousand lines into
 * a text field, so it is only the last resort.
 */
async function deliver(xml: string, name: string, fallbackName: string): Promise<boolean> {
    const filename = `${name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || fallbackName}.gpx`;

    if (Platform.OS === 'web') {
      try {
        const blob = new Blob([xml], { type: 'application/gpx+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        return true;
      } catch {
        return false;
      }
    }

    const fs = loadFs();
    const sharing = loadSharing();

    if (fs?.cacheDirectory && sharing && (await sharing.isAvailableAsync().catch(() => false))) {
      try {
        const uri = `${fs.cacheDirectory}${filename}`;
        await fs.writeAsStringAsync(uri, xml);
        await sharing.shareAsync(uri, {
          mimeType: 'application/gpx+xml',
          UTI: 'public.xml',
          dialogTitle: name,
        });
        return true;
      } catch {
        /* Fall through to the share sheet below. */
      }
    }

    try {
      await Share.share({ title: filename, message: xml });
      return true;
    } catch {
      return false;
    }
}

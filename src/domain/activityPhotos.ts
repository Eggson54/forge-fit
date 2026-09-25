/**
 * Photographs attached to a recorded activity.
 *
 * Two facts about these shape everything below, and both are said on screen
 * rather than left for someone to discover:
 *
 * **They live on the device.** What is stored here is a file URI, not the
 * bytes. That is why the data export redacts photo paths — a file full of
 * `file:///var/mobile/...` would be a list of things the reader cannot open.
 * Reinstall the app and the references survive while the files may not, so
 * `usablePhotos` exists to drop the ones that no longer resolve rather than
 * render a row of broken frames.
 *
 * **A photograph carries a position.** A phone writes GPS coordinates into
 * EXIF, so a picture taken at the start of a run is a copy of the address a
 * privacy zone exists to hide. Attaching one to an activity whose route was
 * trimmed would quietly undo the trimming. The picker therefore re-encodes
 * every image, which drops EXIF as a side effect, and `photoPrivacyWarning`
 * says so where it matters instead of relying on the athlete to know it.
 */

export interface ActivityPhoto {
  id: string;
  /** A local file URI. The bytes are not stored here. */
  uri: string;
  caption?: string;
  addedAt: string;
}

/**
 * Enough for a long day out, few enough that the list stays a list.
 *
 * A cap rather than no cap because these are rendered as full-width images:
 * forty of them is a screen that takes a second to scroll past its own top.
 */
export const MAX_ACTIVITY_PHOTOS = 12;

export const MAX_CAPTION = 140;

export function captionProblem(caption: string): string | null {
  if (caption.length > MAX_CAPTION) return `Captions are up to ${MAX_CAPTION} characters.`;
  return null;
}

export function cleanCaption(caption: string): string | undefined {
  const trimmed = caption.trim().slice(0, MAX_CAPTION);
  return trimmed.length > 0 ? trimmed : undefined;
}

export function canAddPhoto(photos: ActivityPhoto[]): boolean {
  return photos.length < MAX_ACTIVITY_PHOTOS;
}

/**
 * Add a photo, newest last.
 *
 * Newest *last* because these are a sequence along a route rather than a
 * feed: the summit shot belongs after the climb, not above it.
 */
export function addPhoto(photos: ActivityPhoto[], photo: ActivityPhoto): ActivityPhoto[] {
  if (!canAddPhoto(photos)) return photos;
  // The same file picked twice is a slip, not two photographs.
  if (photos.some((p) => p.uri === photo.uri)) return photos;
  return [...photos, photo];
}

export function removePhoto(photos: ActivityPhoto[], id: string): ActivityPhoto[] {
  return photos.filter((p) => p.id !== id);
}

export function setCaption(photos: ActivityPhoto[], id: string, caption: string): ActivityPhoto[] {
  const clean = cleanCaption(caption);
  return photos.map((p) => {
    if (p.id !== id) return p;
    const next: ActivityPhoto = { ...p };
    // Deleted rather than set to an empty string: an empty caption is the
    // absence of one, and the difference shows up as a blank line under the
    // image otherwise.
    if (clean) next.caption = clean;
    else delete next.caption;
    return next;
  });
}

/** Drop references the device can no longer resolve. */
export function usablePhotos(photos: ActivityPhoto[]): ActivityPhoto[] {
  return photos.filter((p) => typeof p.uri === 'string' && p.uri.length > 0);
}

export const PHOTO_STORAGE_NOTE =
  'Photos stay on this device. The app keeps a reference to the file rather than a copy of it, so they are not in your data export and they do not follow you to a new phone.';

/**
 * What to say before a photo goes out with a shared activity.
 *
 * Only when a privacy zone actually trimmed this route: warning on every
 * share would train people to dismiss the warning, and the athlete who set
 * no zones has nothing here to be warned about.
 */
export function photoPrivacyWarning(opts: { trimmed: boolean; photoCount: number }): string | null {
  if (!opts.trimmed || opts.photoCount === 0) return null;
  return `${
    opts.photoCount === 1 ? 'the photo on it was' : `the ${opts.photoCount} photos on it were`
  } taken somewhere along the hidden part. Coordinates are stripped from the file when you add it, but what is in the picture is not — a photo of your own front door is still a photo of your own front door.`;
}

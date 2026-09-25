import {
  MAX_ACTIVITY_PHOTOS,
  MAX_CAPTION,
  addPhoto,
  canAddPhoto,
  captionProblem,
  cleanCaption,
  photoPrivacyWarning,
  removePhoto,
  setCaption,
  usablePhotos,
  type ActivityPhoto,
} from '../domain/activityPhotos';

const photo = (n: number): ActivityPhoto => ({
  id: `ph_${n}`,
  uri: `file:///photos/${n}.jpg`,
  addedAt: `2026-09-2${n % 10}T09:00:00.000Z`,
});

const many = (n: number) => Array.from({ length: n }, (_, i) => photo(i));

describe('addPhoto', () => {
  it('appends, newest last', () => {
    // A sequence along a route, not a feed: the summit shot belongs after
    // the climb rather than above it.
    const list = addPhoto(addPhoto([], photo(1)), photo(2));
    expect(list.map((p) => p.id)).toEqual(['ph_1', 'ph_2']);
  });

  it('refuses the same file twice', () => {
    const one = addPhoto([], photo(1));
    expect(addPhoto(one, { ...photo(1), id: 'different' })).toBe(one);
  });

  it('stops at the cap', () => {
    const full = many(MAX_ACTIVITY_PHOTOS);
    expect(canAddPhoto(full)).toBe(false);
    expect(addPhoto(full, photo(99))).toBe(full);
  });

  it('allows one more right up to the cap', () => {
    const nearly = many(MAX_ACTIVITY_PHOTOS - 1);
    expect(canAddPhoto(nearly)).toBe(true);
    expect(addPhoto(nearly, photo(99))).toHaveLength(MAX_ACTIVITY_PHOTOS);
  });
});

describe('removePhoto', () => {
  it('takes only the one named', () => {
    const list = many(3);
    expect(removePhoto(list, 'ph_1').map((p) => p.id)).toEqual(['ph_0', 'ph_2']);
  });

  it('is a no-op for an id that is not there', () => {
    expect(removePhoto(many(2), 'nope')).toHaveLength(2);
  });
});

describe('captions', () => {
  it('trims surrounding space', () => {
    expect(cleanCaption('  the summit  ')).toBe('the summit');
  });

  it('treats whitespace as no caption at all', () => {
    expect(cleanCaption('   ')).toBeUndefined();
    expect(cleanCaption('')).toBeUndefined();
  });

  it('removes the key rather than storing an empty string', () => {
    // An empty caption is the absence of one; the difference shows up as a
    // blank line under the image.
    const [only] = setCaption([{ ...photo(1), caption: 'gone soon' }], 'ph_1', '  ');
    expect(only).not.toHaveProperty('caption');
  });

  it('sets a caption on the one named and leaves the rest', () => {
    const list = setCaption(many(3), 'ph_1', 'halfway');
    expect(list[1]!.caption).toBe('halfway');
    expect(list[0]!.caption).toBeUndefined();
  });

  it('caps a very long caption rather than rejecting the photo', () => {
    const long = 'x'.repeat(MAX_CAPTION + 50);
    expect(cleanCaption(long)).toHaveLength(MAX_CAPTION);
    expect(captionProblem(long)).toMatch(/characters/);
    expect(captionProblem('short')).toBeNull();
  });
});

describe('usablePhotos', () => {
  it('drops a reference with nothing behind it', () => {
    // Reinstall the app and the references survive while the files may not.
    const list = [photo(1), { ...photo(2), uri: '' }];
    expect(usablePhotos(list).map((p) => p.id)).toEqual(['ph_1']);
  });
});

describe('photoPrivacyWarning', () => {
  it('says nothing when no zone trimmed the route', () => {
    // Warning on every share would train people to dismiss the warning.
    expect(photoPrivacyWarning({ trimmed: false, photoCount: 3 })).toBeNull();
  });

  it('says nothing when there are no photos to warn about', () => {
    expect(photoPrivacyWarning({ trimmed: true, photoCount: 0 })).toBeNull();
  });

  it('warns when a trimmed route carries photos', () => {
    const w = photoPrivacyWarning({ trimmed: true, photoCount: 2 })!;
    expect(w).toContain('the 2 photos');
    expect(w).toMatch(/hidden part/i);
  });

  it('reads correctly for a single photo', () => {
    const w = photoPrivacyWarning({ trimmed: true, photoCount: 1 })!;
    expect(w).toContain('the photo on it was');
    expect(w).not.toContain('photos');
  });

  it('is honest that stripping coordinates is not the whole story', () => {
    // A photo of your own front door is still a photo of your own front door.
    expect(photoPrivacyWarning({ trimmed: true, photoCount: 1 })).toMatch(/what is in the picture/i);
  });
});

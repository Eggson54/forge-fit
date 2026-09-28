import { acceptFixes, recordingModeNote } from '../domain/fixBatch';

const f = (t: number, lat = 51.5, lon = -0.1) => ({ lat, lon, t });

describe('acceptFixes', () => {
  it('passes an ordinary batch through in order', () => {
    expect(acceptFixes(null, [f(1), f(2), f(3)]).map((x) => x.t)).toEqual([1, 2, 3]);
  });

  it('sorts a batch that arrives newest first', () => {
    // An out-of-order fix is a leg drawn backwards along the route, counted
    // as distance twice.
    expect(acceptFixes(null, [f(3), f(1), f(2)]).map((x) => x.t)).toEqual([1, 2, 3]);
  });

  it('drops anything not newer than the last accepted point', () => {
    // A batch that overlaps the previous one.
    expect(acceptFixes(10, [f(9), f(10), f(11), f(12)]).map((x) => x.t)).toEqual([11, 12]);
  });

  it('drops a fix delivered twice', () => {
    expect(acceptFixes(null, [f(1), f(2), f(2), f(3)]).map((x) => x.t)).toEqual([1, 2, 3]);
  });

  it('drops anything that is not a coordinate', () => {
    const out = acceptFixes(null, [f(1), f(2, Number.NaN), f(3, 91), f(4, 0, 181), f(Number.NaN), f(5)]);
    expect(out.map((x) => x.t)).toEqual([1, 5]);
  });

  it('returns nothing for an empty or entirely stale batch', () => {
    expect(acceptFixes(null, [])).toEqual([]);
    expect(acceptFixes(100, [f(1), f(50)])).toEqual([]);
  });

  it('keeps whatever else a fix carries', () => {
    const out = acceptFixes(null, [{ ...f(1), accuracyMeters: 4, speedMs: 3.1 }]);
    expect(out[0]).toMatchObject({ accuracyMeters: 4, speedMs: 3.1 });
  });

  it('does not mutate the batch it was given', () => {
    const batch = [f(3), f(1)];
    acceptFixes(null, batch);
    expect(batch.map((x) => x.t)).toEqual([3, 1]);
  });
});

describe('recordingModeNote', () => {
  it('says nothing when recording will survive a locked screen', () => {
    expect(recordingModeNote('background', null)).toBeNull();
    expect(recordingModeNote(null, null)).toBeNull();
  });

  it('warns that locking the screen stops a screen-on recording', () => {
    for (const reason of ['expo-go', 'declined', 'unsupported'] as const) {
      expect(recordingModeNote('screen-on', reason)).toMatch(/locking it stops the recording/);
    }
  });

  it('says why, so the fix is obvious', () => {
    expect(recordingModeNote('screen-on', 'expo-go')).toMatch(/Expo Go/);
    expect(recordingModeNote('screen-on', 'declined')).toMatch(/Always/);
  });
});

import {
  MIN_RECOVERABLE_POINTS,
  assemble,
  describeRecovery,
  orderChunks,
  parseMeta,
} from '../domain/crashRecovery';

const meta = JSON.stringify({ id: 'act_1', type: 'run', startedAt: 1_760_000_000_000, version: 1 });

const chunk = (n: number, count = 10) =>
  JSON.stringify(
    Array.from({ length: count }, (_, i) => ({ lat: 51.5 + (n * count + i) * 0.0001, lon: -0.12, t: 1_760_000_000_000 + (n * count + i) * 1000 })),
  );

const named = (texts: string[]) => texts.map((text, i) => ({ name: `${String(i).padStart(5, '0')}.json`, text }));

describe('orderChunks', () => {
  it('orders numerically, not lexically', () => {
    // Lexical order puts "10" before "9". Padding hides it until a run is long
    // enough to overflow the padding, and then the route silently reorders.
    const names = ['9.json', '10.json', '2.json', 'meta.json'];
    expect(orderChunks(names)).toEqual(['2.json', '9.json', '10.json']);
  });

  it('drops the meta file and anything unexpected', () => {
    expect(orderChunks(['meta.json', '0.json', 'notes.txt', '.DS_Store'])).toEqual(['0.json']);
  });

  it('is empty when there is nothing', () => {
    expect(orderChunks([])).toEqual([]);
  });
});

describe('parseMeta', () => {
  it('reads a good header', () => {
    expect(parseMeta(meta)!.type).toBe('run');
  });

  it('refuses a version it does not know', () => {
    expect(parseMeta(JSON.stringify({ id: 'a', type: 'run', startedAt: 1, version: 2 }))).toBeNull();
  });

  it('refuses a header missing its fields', () => {
    expect(parseMeta(JSON.stringify({ version: 1 }))).toBeNull();
    expect(parseMeta(JSON.stringify({ id: 'a', type: 'run', startedAt: 'soon', version: 1 }))).toBeNull();
  });

  it('refuses something that is not JSON at all', () => {
    expect(parseMeta('{half-writ')).toBeNull();
    expect(parseMeta('')).toBeNull();
  });
});

describe('assemble', () => {
  it('puts the chunks back in order', () => {
    const found = assemble(meta, named([chunk(0), chunk(1), chunk(2)]))!;
    expect(found.points).toHaveLength(30);
    expect(found.truncated).toBe(false);
    for (let i = 1; i < found.points.length; i++) {
      expect(found.points[i]!.t).toBeGreaterThan(found.points[i - 1]!.t);
    }
  });

  it('keeps everything before a half-written final chunk', () => {
    // The real crash case: the app died mid-write.
    const found = assemble(meta, named([chunk(0), chunk(1), '[{"lat":51.5,"lon":-0.1']))!;
    expect(found.points).toHaveLength(20);
    expect(found.truncated).toBe(true);
  });

  it('stops at a bad chunk rather than splicing a gap into the middle', () => {
    // Skipping the bad one and carrying on would join two ends of a route
    // across a hole and report it as continuous.
    const found = assemble(meta, named([chunk(0), 'corrupt', chunk(2)]))!;
    expect(found.points).toHaveLength(10);
    expect(found.truncated).toBe(true);
  });

  it('rejects a chunk that parses but is not points', () => {
    const found = assemble(meta, named([chunk(0), JSON.stringify([{ hello: 'world' }])]))!;
    expect(found.points).toHaveLength(10);
    expect(found.truncated).toBe(true);
  });

  it('refuses a leftover too small to be worth offering', () => {
    expect(assemble(meta, named([chunk(0, 4)]))).toBeNull();
    expect(MIN_RECOVERABLE_POINTS).toBe(10);
  });

  it('refuses when the header is unreadable, however good the chunks', () => {
    expect(assemble('nonsense', named([chunk(0), chunk(1)]))).toBeNull();
  });

  it('refuses when there are no chunks at all', () => {
    expect(assemble(meta, [])).toBeNull();
  });

  it('survives a first chunk that is empty', () => {
    expect(assemble(meta, named(['[]', chunk(1)]))!.points).toHaveLength(10);
  });
});

describe('describeRecovery', () => {
  const found = assemble(meta, named([chunk(0), chunk(1)]))!;

  it('says what was found and how much', () => {
    const text = describeRecovery(found, new Date(1_760_050_000_000));
    expect(text).toMatch(/run/);
    expect(text).toMatch(/20 fixes/);
  });

  it('says "earlier today" for the same day', () => {
    expect(describeRecovery(found, new Date(1_760_030_000_000))).toMatch(/earlier today/);
  });

  it('mentions the lost tail only when there is one', () => {
    expect(describeRecovery(found)).not.toMatch(/did not finish/);
    const cut = assemble(meta, named([chunk(0), chunk(1), 'broken']))!;
    expect(describeRecovery(cut)).toMatch(/did not finish/);
  });
});

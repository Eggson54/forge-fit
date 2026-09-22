import {
  base64Bytes,
  checkEstimate,
  estimateSource,
  imageTooLarge,
  MAX_IMAGE_BYTES,
  type PhotoEstimate,
} from '../domain/photoEstimate';

const estimate = (over: Partial<PhotoEstimate> = {}): PhotoEstimate => ({
  name: 'Chicken burrito bowl',
  servingLabel: '1 bowl',
  macros: { calories: 650, proteinG: 45, carbsG: 70, fatG: 18, fiberG: 9 },
  confidence: 'medium',
  note: '',
  ...over,
});

describe('base64Bytes', () => {
  it('counts decoded bytes, not characters', () => {
    // "abc" -> "YWJj": 4 characters, 3 bytes. Using .length would say 4.
    expect(base64Bytes('YWJj')).toBe(3);
  });

  it('accounts for single padding', () => {
    // "ab" -> "YWI=" : 3 chars of payload, 2 bytes.
    expect(base64Bytes('YWI=')).toBe(2);
  });

  it('accounts for double padding', () => {
    // "a" -> "YQ==" : 1 byte.
    expect(base64Bytes('YQ==')).toBe(1);
  });

  it('strips a data URI prefix rather than measuring it', () => {
    expect(base64Bytes('data:image/jpeg;base64,YWJj')).toBe(3);
  });

  it('ignores whitespace some encoders insert', () => {
    expect(base64Bytes('YWJj\n')).toBe(3);
  });

  it('is zero for an empty payload', () => {
    expect(base64Bytes('')).toBe(0);
    expect(base64Bytes('   ')).toBe(0);
  });
});

describe('imageTooLarge', () => {
  it('accepts an image at the limit', () => {
    // 4 base64 chars per 3 bytes, so this lands exactly on the limit.
    const payload = 'A'.repeat((MAX_IMAGE_BYTES / 3) * 4);
    expect(base64Bytes(payload)).toBe(MAX_IMAGE_BYTES);
    expect(imageTooLarge(payload)).toBe(false);
  });

  it('rejects one past it', () => {
    const payload = 'A'.repeat((MAX_IMAGE_BYTES / 3) * 4 + 400);
    expect(imageTooLarge(payload)).toBe(true);
  });

  it('honours a caller-supplied limit', () => {
    expect(imageTooLarge('YWJj', 2)).toBe(true);
    expect(imageTooLarge('YWJj', 3)).toBe(false);
  });
});

describe('checkEstimate', () => {
  it('passes a consistent estimate', () => {
    // 45*4 + 70*4 + 18*9 = 622, against 650 stated: within rounding.
    expect(checkEstimate(estimate())).toEqual([]);
  });

  it('flags calories that disagree with the macros', () => {
    const problems = checkEstimate(estimate({ macros: { calories: 300, proteinG: 45, carbsG: 70, fatG: 18 } }));
    expect(problems.map((p) => p.field)).toContain('calories');
    expect(problems[0]!.message).toMatch(/622/);
  });

  it('tolerates the gap that fibre and rounding explain', () => {
    // Derived 622 vs stated 700: 78 out, 11% — under the threshold.
    expect(checkEstimate(estimate({ macros: { calories: 700, proteinG: 45, carbsG: 70, fatG: 18 } }))).toEqual([]);
  });

  it('does not flag a small absolute gap on a small entry', () => {
    // An apple: derived 100, stated 70. 30% out, but only 30 calories, which
    // is not worth interrupting somebody over.
    const problems = checkEstimate(
      estimate({ macros: { calories: 70, proteinG: 0, carbsG: 25, fatG: 0 } }),
    );
    expect(problems).toEqual([]);
  });

  it('says so when no calories came back', () => {
    const problems = checkEstimate(estimate({ macros: { calories: 0, proteinG: 45, carbsG: 70, fatG: 18 } }));
    expect(problems[0]!.field).toBe('calories');
    expect(problems[0]!.message).toMatch(/622/);
  });

  it('flags an implausibly large single entry', () => {
    const problems = checkEstimate(
      estimate({ macros: { calories: 2600, proteinG: 150, carbsG: 300, fatG: 100 } }),
    );
    expect(problems.some((p) => p.message.includes('very large'))).toBe(true);
  });

  it('flags a missing name and a missing portion', () => {
    const problems = checkEstimate(estimate({ name: '  ', servingLabel: '' }));
    expect(problems.map((p) => p.field)).toEqual(expect.arrayContaining(['name', 'serving']));
  });

  it('flags each implausible macro on its own field', () => {
    const problems = checkEstimate(
      estimate({ macros: { calories: 1900, proteinG: 250, carbsG: 500, fatG: 250 } }),
    );
    expect(problems.map((p) => p.field)).toEqual(expect.arrayContaining(['protein', 'carbs', 'fat']));
  });
});

describe('estimateSource', () => {
  it('records a photograph as a photograph', () => {
    expect(estimateSource(true)).toBe('photo');
  });

  it('does not claim a typed description was photographed', () => {
    expect(estimateSource(false)).toBe('manual');
  });
});

import {
  BIOMARKERS,
  BIOMARKER_CAVEAT,
  GROUP_LABEL,
  biomarkerByKey,
  markerChange,
  markerSeries,
  panelDates,
  readAgainstRange,
  readPanel,
  summarisePanel,
  type BiomarkerReading,
} from '../domain/biomarkers';

const reading = (over: Partial<BiomarkerReading> & { key: string; value: number }): BiomarkerReading => ({
  id: Math.random().toString(36).slice(2),
  date: '2026-09-21',
  ...over,
});

describe('the catalog', () => {
  it('has no duplicate keys, so a lookup cannot be ambiguous', () => {
    const keys = BIOMARKERS.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every marker a unit, a group with a label, and a description', () => {
    for (const b of BIOMARKERS) {
      expect(b.unit).toBeTruthy();
      expect(GROUP_LABEL[b.group]).toBeTruthy();
      expect(b.what.length).toBeGreaterThan(10);
    }
  });

  it('never has a typical range that is inverted or empty', () => {
    for (const b of BIOMARKERS) {
      expect(b.typical.high).toBeGreaterThan(b.typical.low);
      for (const range of Object.values(b.typicalBySex ?? {})) {
        expect(range.high).toBeGreaterThan(range.low);
      }
    }
  });

  it('describes what a marker is without saying what a result means', () => {
    // The catalog is a glossary, not an interpreter.
    for (const b of BIOMARKERS) {
      expect(b.what).not.toMatch(/\byou should\b|\bindicates\b|\bsuggests\b|\brisk of\b/i);
    }
  });

  it('finds a marker by key and refuses one that does not exist', () => {
    expect(biomarkerByKey('hba1c')!.label).toBe('HbA1c');
    expect(biomarkerByKey('unobtanium')).toBeNull();
  });
});

describe('readAgainstRange', () => {
  const hdl = biomarkerByKey('hdl')!;

  it('places a value inside its range', () => {
    const r = readAgainstRange(reading({ key: 'hdl', value: 60 }), hdl, 'male');
    expect(r.verdict).toBe('in_range');
    expect(r.position).toBeGreaterThan(0);
    expect(r.position).toBeLessThan(1);
  });

  it('prefers the range off the user own report', () => {
    // The whole point: labs differ, and printing "high" against a range the
    // lab did not use is worse than printing nothing.
    const own = readAgainstRange(reading({ key: 'hdl', value: 45, refLow: 50, refHigh: 90 }), hdl, 'male');
    expect(own.source).toBe('yours');
    expect(own.verdict).toBe('below');

    const typical = readAgainstRange(reading({ key: 'hdl', value: 45 }), hdl, 'male');
    expect(typical.source).toBe('typical');
    expect(typical.verdict).toBe('in_range');
  });

  it('ignores a user range that is inverted or incomplete', () => {
    expect(readAgainstRange(reading({ key: 'hdl', value: 60, refLow: 90, refHigh: 40 }), hdl, 'male').source).toBe('typical');
    expect(readAgainstRange(reading({ key: 'hdl', value: 60, refLow: 40 }), hdl, 'male').source).toBe('typical');
  });

  it('uses the sex-specific range where a lab would', () => {
    const male = readAgainstRange(reading({ key: 'hdl', value: 45 }), hdl, 'male');
    const female = readAgainstRange(reading({ key: 'hdl', value: 45 }), hdl, 'female');
    expect(male.verdict).toBe('in_range');
    expect(female.verdict).toBe('below');
  });

  it('says which range it used, every time', () => {
    expect(readAgainstRange(reading({ key: 'hdl', value: 45 }), hdl, 'male').note).toMatch(/a typical range/);
    expect(readAgainstRange(reading({ key: 'hdl', value: 45, refLow: 50, refHigh: 90 }), hdl, 'male').note).toMatch(/your report/);
  });

  it('points at a clinician when something is out of range, and never interprets', () => {
    const note = readAgainstRange(reading({ key: 'hdl', value: 20 }), hdl, 'male').note;
    expect(note).toMatch(/clinician/i);
    expect(note).not.toMatch(/\brisk\b|\bdangerous\b|\byou should\b/i);
  });

  it('does not divide by a zero-width range', () => {
    const r = readAgainstRange(reading({ key: 'hdl', value: 60, refLow: 60, refHigh: 60 }), hdl, 'male');
    expect(Number.isFinite(r.position)).toBe(true);
  });
});

describe('markerSeries and markerChange', () => {
  it('is oldest first and only the marker asked for', () => {
    const rows = [
      reading({ key: 'ldl', value: 110, date: '2026-09-01' }),
      reading({ key: 'hdl', value: 55, date: '2026-09-01' }),
      reading({ key: 'ldl', value: 95, date: '2026-06-01' }),
    ];
    expect(markerSeries(rows, 'ldl').map((r) => r.date)).toEqual(['2026-06-01', '2026-09-01']);
  });

  it('measures the move from first to last', () => {
    const rows = [
      reading({ key: 'ldl', value: 130, date: '2026-01-01' }),
      reading({ key: 'ldl', value: 104, date: '2026-09-01' }),
    ];
    const change = markerChange(markerSeries(rows, 'ldl'))!;
    expect(change.delta).toBe(-26);
    expect(change.percent).toBe(-20);
  });

  it('says nothing from a single draw', () => {
    expect(markerChange(markerSeries([reading({ key: 'ldl', value: 100 })], 'ldl'))).toBeNull();
  });

  it('does not divide by a first value of zero', () => {
    const rows = [
      reading({ key: 'hscrp', value: 0, date: '2026-01-01' }),
      reading({ key: 'hscrp', value: 2, date: '2026-09-01' }),
    ];
    expect(markerChange(markerSeries(rows, 'hscrp'))!.percent).toBe(0);
  });
});

describe('summarisePanel', () => {
  const draw = [
    reading({ key: 'ldl', value: 80 }),
    reading({ key: 'hdl', value: 62 }),
    reading({ key: 'triglycerides', value: 210 }),
    reading({ key: 'hba1c', value: 6.1 }),
  ];

  it('counts what is in range and names what is not', () => {
    const s = summarisePanel(draw, '2026-09-21', 'male')!;
    expect(s.total).toBe(4);
    expect(s.inRange).toBe(2);
    expect(s.flagged.map((f) => f.key).sort()).toEqual(['hba1c', 'triglycerides']);
  });

  it('ignores a marker the catalog does not know', () => {
    const s = summarisePanel([...draw, reading({ key: 'unobtanium', value: 1 })], '2026-09-21', 'male')!;
    expect(s.inRange + s.outOfRange).toBe(4);
  });

  it('says nothing for a date with no draw', () => {
    expect(summarisePanel(draw, '2020-01-01', 'male')).toBeNull();
    expect(summarisePanel([], '2026-09-21', 'male')).toBeNull();
  });

  it('lists draw dates newest first', () => {
    const rows = [
      reading({ key: 'ldl', value: 100, date: '2026-01-01' }),
      reading({ key: 'hdl', value: 50, date: '2026-09-01' }),
      reading({ key: 'ldl', value: 90, date: '2026-09-01' }),
    ];
    expect(panelDates(rows)).toEqual(['2026-09-01', '2026-01-01']);
  });
});

describe('readPanel', () => {
  it('says so plainly when everything is inside range', () => {
    const s = summarisePanel([reading({ key: 'ldl', value: 80 })], '2026-09-21', 'male');
    expect(readPanel(s)).toMatch(/sit inside their reference range/);
  });

  it('names what is out and sends them to whoever ordered the test', () => {
    const s = summarisePanel(
      [reading({ key: 'triglycerides', value: 300 }), reading({ key: 'ldl', value: 80 })],
      '2026-09-21',
      'male',
    );
    const line = readPanel(s)!;
    expect(line).toMatch(/Triglycerides/);
    expect(line).toMatch(/ordered the test/);
  });

  it('does not list every flag when there are many', () => {
    const many = ['ldl', 'triglycerides', 'hba1c', 'fasting_glucose', 'hscrp'].map((key) =>
      reading({ key, value: 100000 }),
    );
    const line = readPanel(summarisePanel(many, '2026-09-21', 'male'))!;
    expect(line).toMatch(/and 2 more/);
  });

  it('says nothing rather than something empty', () => {
    expect(readPanel(null)).toBeNull();
  });
});

describe('the caveat', () => {
  it('refuses the interpretation and explains the lab-range point', () => {
    expect(BIOMARKER_CAVEAT).toMatch(/not a reading of them/i);
    expect(BIOMARKER_CAVEAT).toMatch(/reference ranges differ between labs/i);
    expect(BIOMARKER_CAVEAT).toMatch(/is a diagnosis|diagnostic/i);
  });
});

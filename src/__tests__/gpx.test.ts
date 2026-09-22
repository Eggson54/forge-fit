import {
  candidatesFrom,
  isDuplicate,
  looksLikeGpx,
  parseGpx,
  toGpx,
  typeFromGpx,
} from '../domain/gpx';
import type { TrackPoint } from '../domain/track';

/** A file shaped the way Strava exports one. */
const STRAVA = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="StravaGPX" xmlns="http://www.topografix.com/GPX/1/1">
 <metadata><time>2026-05-04T06:12:31Z</time></metadata>
 <trk>
  <name>Morning Run</name>
  <type>running</type>
  <trkseg>
   <trkpt lat="51.5007000" lon="-0.1246000"><ele>12.4</ele><time>2026-05-04T06:12:31Z</time></trkpt>
   <trkpt lat="51.5016000" lon="-0.1246000"><ele>13.1</ele><time>2026-05-04T06:12:41Z</time></trkpt>
   <trkpt lat="51.5025000" lon="-0.1246000"><ele>14.0</ele><time>2026-05-04T06:12:51Z</time></trkpt>
   <trkpt lat="51.5034000" lon="-0.1246000"><ele>15.2</ele><time>2026-05-04T06:13:01Z</time></trkpt>
   <trkpt lat="51.5043000" lon="-0.1246000"><ele>16.0</ele><time>2026-05-04T06:13:11Z</time></trkpt>
   <trkpt lat="51.5052000" lon="-0.1246000"><ele>16.4</ele><time>2026-05-04T06:13:21Z</time></trkpt>
  </trkseg>
 </trk>
</gpx>`;

/** Garmin's shape: namespaced tags and the TrackPointExtension block. */
const GARMIN = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="Garmin Connect" xmlns="http://www.topografix.com/GPX/1/1"
 xmlns:ns3="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
 <trk>
  <name>Evening Ride</name>
  <type>cycling</type>
  <trkseg>
   <trkpt lat="51.5007" lon="-0.1246">
     <ele>12.4</ele><time>2026-05-04T18:00:00.000Z</time>
     <extensions><ns3:TrackPointExtension><ns3:hr>142</ns3:hr><ns3:cad>86</ns3:cad></ns3:TrackPointExtension></extensions>
   </trkpt>
   <trkpt lat="51.5107" lon="-0.1246">
     <ele>18.9</ele><time>2026-05-04T18:01:00.000Z</time>
     <extensions><ns3:TrackPointExtension><ns3:hr>151</ns3:hr><ns3:cad>90</ns3:cad></ns3:TrackPointExtension></extensions>
   </trkpt>
   <trkpt lat="51.5207" lon="-0.1246">
     <ele>22.0</ele><time>2026-05-04T18:02:00.000Z</time>
     <extensions><ns3:TrackPointExtension><ns3:hr>158</ns3:hr></ns3:TrackPointExtension></extensions>
   </trkpt>
   <trkpt lat="51.5307" lon="-0.1246"><ele>25.0</ele><time>2026-05-04T18:03:00.000Z</time></trkpt>
   <trkpt lat="51.5407" lon="-0.1246"><ele>26.0</ele><time>2026-05-04T18:04:00.000Z</time></trkpt>
  </trkseg>
 </trk>
</gpx>`;

describe('parseGpx', () => {
  it('reads a Strava export', () => {
    const [track] = parseGpx(STRAVA);
    expect(track!.name).toBe('Morning Run');
    expect(track!.type).toBe('running');
    expect(track!.points).toHaveLength(6);
    expect(track!.points[0]!.lat).toBeCloseTo(51.5007, 6);
    expect(track!.points[0]!.ele).toBeCloseTo(12.4, 3);
    expect(track!.points[0]!.t).toBe(Date.parse('2026-05-04T06:12:31Z'));
  });

  it('reads Garmin namespaced extensions', () => {
    const [track] = parseGpx(GARMIN);
    expect(track!.points[0]!.hr).toBe(142);
    expect(track!.points[0]!.cadence).toBe(86);
    // A point with heart rate but no cadence keeps the one it has.
    expect(track!.points[2]!.hr).toBe(158);
    expect(track!.points[2]!.cadence).toBeUndefined();
    // And a point with neither gets neither, rather than a zero.
    expect(track!.points[3]!.hr).toBeUndefined();
  });

  it('reads several tracks from one file', () => {
    // A multi-track GPX — what you get when a watch splits a session, or when
    // somebody concatenates a year of exports into one file.
    const merged = `<gpx>${STRAVA.replace(/[\s\S]*?<trk>/, '<trk>').replace(/<\/gpx>/, '')}${GARMIN.replace(/[\s\S]*?<trk>/, '<trk>').replace(/<\/gpx>/, '')}</gpx>`;
    const tracks = parseGpx(merged);
    expect(tracks).toHaveLength(2);
    expect(tracks[0]!.name).toBe('Morning Run');
    expect(tracks[1]!.name).toBe('Evening Ride');
  });

  it('skips a point with coordinates that cannot be real', () => {
    const bad = STRAVA.replace('lat="51.5016000"', 'lat="991.5"');
    expect(parseGpx(bad)[0]!.points).toHaveLength(5);
  });

  it('skips a point with no coordinates at all', () => {
    const bad = STRAVA.replace('<trkpt lat="51.5016000" lon="-0.1246000">', '<trkpt>');
    expect(parseGpx(bad)[0]!.points).toHaveLength(5);
  });

  it('unescapes entities in a name', () => {
    const escaped = STRAVA.replace('Morning Run', 'Tom &amp; Jerry&apos;s 5k &lt;fast&gt;');
    expect(parseGpx(escaped)[0]!.name).toBe("Tom & Jerry's 5k <fast>");
  });

  it('does not double-unescape an escaped ampersand', () => {
    // "&amp;lt;" is a literal "&lt;", not a "<".
    const tricky = STRAVA.replace('Morning Run', 'A &amp;lt; B');
    expect(parseGpx(tricky)[0]!.name).toBe('A &lt; B');
  });

  it('invents a clock only when the whole file has none', () => {
    const untimed = STRAVA.replace(/<time>[^<]*<\/time>/g, '');
    const points = parseGpx(untimed)[0]!.points;
    expect(points).toHaveLength(6);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!.t - points[i - 1]!.t).toBe(1000);
    }
  });

  it('drops the untimed stragglers from a file that mostly has times', () => {
    const partial = STRAVA.replace('<time>2026-05-04T06:12:41Z</time>', '');
    expect(parseGpx(partial)[0]!.points).toHaveLength(5);
  });

  it('ignores waypoints and planned routes', () => {
    // A route somebody drew is not something that happened.
    const withExtras = STRAVA.replace(
      '<trk>',
      '<wpt lat="1" lon="1"><name>Car park</name></wpt><rte><rtept lat="2" lon="2"/></rte><trk>',
    );
    const tracks = parseGpx(withExtras);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]!.points).toHaveLength(6);
    expect(tracks[0]!.points.some((p) => p.lat === 1 || p.lat === 2)).toBe(false);
  });

  it('returns nothing for a file with no track at all', () => {
    expect(parseGpx('<gpx><wpt lat="1" lon="1"/></gpx>')).toEqual([]);
    expect(parseGpx('')).toEqual([]);
    expect(parseGpx('not xml')).toEqual([]);
  });
});

describe('looksLikeGpx', () => {
  it('recognises a file worth trying', () => {
    expect(looksLikeGpx(STRAVA)).toBe(true);
    expect(looksLikeGpx(GARMIN)).toBe(true);
  });

  it('rejects something else', () => {
    expect(looksLikeGpx('{"json":true}')).toBe(false);
    expect(looksLikeGpx('<TrainingCenterDatabase/>')).toBe(false);
  });
});

describe('toGpx', () => {
  const points: TrackPoint[] = [
    { lat: 51.5007, lon: -0.1246, t: Date.parse('2026-05-04T06:12:31Z'), ele: 12.4, hr: 142, cadence: 86 },
    { lat: 51.5016, lon: -0.1246, t: Date.parse('2026-05-04T06:12:41Z'), ele: 13.1, hr: 145 },
  ];

  it('writes a document that parses back to the same points', () => {
    const xml = toGpx(points, { name: 'Morning Run', type: 'run' });
    const [track] = parseGpx(xml);
    expect(track!.name).toBe('Morning Run');
    expect(track!.type).toBe('run');
    expect(track!.points).toHaveLength(2);
    expect(track!.points[0]!.lat).toBeCloseTo(51.5007, 6);
    expect(track!.points[0]!.hr).toBe(142);
    expect(track!.points[0]!.cadence).toBe(86);
    expect(track!.points[1]!.cadence).toBeUndefined();
  });

  it('escapes a name that would otherwise break the document', () => {
    const xml = toGpx(points, { name: 'Tom & Jerry\'s <5k>' });
    expect(xml).toContain('Tom &amp; Jerry&apos;s &lt;5k&gt;');
    expect(parseGpx(xml)[0]!.name).toBe("Tom & Jerry's <5k>");
  });

  it('leaves extensions out when asked', () => {
    const xml = toGpx(points, { name: 'x', includeExtensions: false });
    expect(xml).not.toContain('gpxtpx:hr');
    expect(parseGpx(xml)[0]!.points[0]!.hr).toBeUndefined();
  });

  it('drops points that could not be written honestly', () => {
    const dirty: TrackPoint[] = [...points, { lat: Number.NaN, lon: 0, t: 1 }];
    expect(parseGpx(toGpx(dirty, { name: 'x' }))[0]!.points).toHaveLength(2);
  });

  it('produces a document with no track for no points, rather than throwing', () => {
    expect(() => toGpx([], { name: 'Empty' })).not.toThrow();
    expect(parseGpx(toGpx([], { name: 'Empty' }))).toEqual([]);
  });
});

describe('typeFromGpx', () => {
  it('maps the words the common exporters write', () => {
    expect(typeFromGpx('running')).toBe('run');
    expect(typeFromGpx('cycling')).toBe('ride');
    expect(typeFromGpx('Ride')).toBe('ride');
    expect(typeFromGpx('swimming')).toBe('swim');
    expect(typeFromGpx('hiking')).toBe('hike');
    expect(typeFromGpx('walking')).toBe('walk');
  });

  it('defaults to a run rather than to nothing', () => {
    expect(typeFromGpx(null)).toBe('run');
    expect(typeFromGpx('')).toBe('run');
  });

  it('handles the -ing forms exporters actually write', () => {
    expect(typeFromGpx('hiking')).toBe('hike');
    expect(typeFromGpx('biking')).toBe('ride');
    expect(typeFromGpx('paddling')).toBe('row');
  });

  it('gets the sport right when a name contains two of them', () => {
    // "Trail running" is a run; "mountain biking" is a ride, even though
    // "biking" has no wheels in it and "trail" suggests feet.
    expect(typeFromGpx('trail running')).toBe('run');
    expect(typeFromGpx('mountain biking')).toBe('ride');
    expect(typeFromGpx('gravel ride')).toBe('ride');
  });

  it('falls back to other for something it genuinely does not know', () => {
    expect(typeFromGpx('kitesurfing')).toBe('other');
  });
});

describe('candidatesFrom', () => {
  it('turns a file into something that can be reviewed before saving', () => {
    const [c] = candidatesFrom(GARMIN);
    expect(c!.name).toBe('Evening Ride');
    expect(c!.type).toBe('ride');
    expect(c!.date).toBe('2026-05-04');
    expect(c!.distanceM).toBeGreaterThan(4000);
    expect(c!.syntheticTime).toBe(false);
  });

  it('flags a file whose date is really the import date', () => {
    const untimed = STRAVA.replace(/<time>[^<]*<\/time>/g, '').replace(/lat="51\.50(\d)/g, 'lat="51.5$10');
    const [c] = candidatesFrom(untimed);
    if (c) expect(c.syntheticTime).toBe(true);
  });

  it('rejects a file that recorded somebody standing up', () => {
    const still = `<gpx><trk><name>Nothing</name><trkseg>
      ${Array.from({ length: 8 }, (_, i) => `<trkpt lat="51.5" lon="-0.12"><time>2026-05-04T06:00:0${i}Z</time></trkpt>`).join('')}
    </trkseg></trk></gpx>`;
    expect(candidatesFrom(still)).toEqual([]);
  });
});

describe('isDuplicate', () => {
  const candidate = { points: [{ lat: 0, lon: 0, t: 1_700_000_000_000 }], distanceM: 10_000 };

  it('spots the same run exported from two places', () => {
    // Different point counts and slightly different distances, same run.
    const existing = [{ points: [{ t: 1_700_000_030_000 }], distanceM: 10_180 }];
    expect(isDuplicate(candidate, existing)).toBe(true);
  });

  it('does not confuse two runs of the same length on different days', () => {
    expect(isDuplicate(candidate, [{ points: [{ t: 1_700_086_400_000 }], distanceM: 10_000 }])).toBe(false);
  });

  it('does not confuse a warm-up with the session that followed it', () => {
    expect(isDuplicate(candidate, [{ points: [{ t: 1_700_000_000_000 }], distanceM: 2_000 }])).toBe(false);
  });

  it('is false against an empty library', () => {
    expect(isDuplicate(candidate, [])).toBe(false);
  });
});

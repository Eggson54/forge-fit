import type { TrackPoint } from './track';
import { trackStats } from './track';

/**
 * GPX in and out.
 *
 * The reason this earns its place: it is the one way to get years of history
 * out of Garmin, Strava, Wahoo or COROS without any of their APIs, and the
 * one way to get it out of *this* app if somebody decides to leave. Both
 * directions matter. An export you cannot use elsewhere is not an export.
 *
 * Written as a small hand-rolled reader rather than an XML library, because
 * every JavaScript XML parser either weighs more than the rest of the app or
 * pulls in a DOM this runtime does not have. GPX from real devices is a
 * narrow, predictable shape, and the reader below is deliberately forgiving
 * about everything outside that shape — a file from a watch nobody has heard
 * of should give up its coordinates rather than being rejected on a namespace.
 */

export interface GpxTrack {
  name: string | null;
  /** The activity type, when the file says. Garmin and Strava both do. */
  type: string | null;
  points: TrackPoint[];
}

// ------------------------------------------------------------ reading ----

/** Unescape the five XML entities. Numeric escapes too, since some tools emit them. */
function unescapeXml(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Ampersand last, or "&amp;lt;" becomes "<" instead of "&lt;".
    .replace(/&amp;/g, '&');
}

/** The text inside the first `<tag>` of a fragment, or null. */
function tagText(fragment: string, tag: string): string | null {
  // Matches a namespaced tag too: <ns3:hr> as well as <hr>.
  const m = fragment.match(new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([^<]*)</(?:\\w+:)?${tag}>`, 'i'));
  return m ? unescapeXml(m[1]!.trim()) : null;
}

function tagNumber(fragment: string, tag: string): number | undefined {
  const text = tagText(fragment, tag);
  if (text == null) return undefined;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Read every track point in a GPX document.
 *
 * Track points only — `<wpt>` and `<rte>` are waypoints and planned routes,
 * not something that was recorded, and folding them in would invent an
 * activity out of a route somebody drew.
 */
export function parseGpx(xml: string): GpxTrack[] {
  const tracks: GpxTrack[] = [];
  const trkRe = /<(?:\w+:)?trk(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?trk>/gi;

  let trk: RegExpExecArray | null;
  while ((trk = trkRe.exec(xml)) !== null) {
    const body = trk[1]!;
    const points: TrackPoint[] = [];

    const ptRe = /<(?:\w+:)?trkpt\s+([^>]*?)\/?>([\s\S]*?)(?:<\/(?:\w+:)?trkpt>|(?=<(?:\w+:)?trkpt)|$)/gi;
    let pt: RegExpExecArray | null;
    while ((pt = ptRe.exec(body)) !== null) {
      const attrs = pt[1]!;
      const inner = pt[2] ?? '';

      const lat = Number(attrs.match(/\blat\s*=\s*["']([^"']+)["']/i)?.[1]);
      const lon = Number(attrs.match(/\blon\s*=\s*["']([^"']+)["']/i)?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;

      const timeText = tagText(inner, 'time');
      const t = timeText ? Date.parse(timeText) : NaN;

      const point: TrackPoint = {
        lat,
        lon,
        // A file with no timestamps is a drawn route, not a recording. Those
        // are handled after the loop rather than given a fake clock here.
        t: Number.isFinite(t) ? t : Number.NaN,
      };

      const ele = tagNumber(inner, 'ele');
      if (ele !== undefined) point.ele = ele;
      // Heart rate lives in an extension whose namespace differs per vendor;
      // the tag name does not.
      const hr = tagNumber(inner, 'hr');
      if (hr !== undefined && hr > 0) point.hr = hr;
      const cad = tagNumber(inner, 'cad');
      if (cad !== undefined && cad > 0) point.cadence = cad;
      const power = tagNumber(inner, 'power') ?? tagNumber(inner, 'PowerInWatts');
      if (power !== undefined && power >= 0) point.power = power;

      points.push(point);
    }

    if (points.length === 0) continue;

    // A track with no clock at all cannot be an activity: there is no
    // duration and therefore no pace. Rather than reject it, give it a
    // synthetic one-second cadence and let the caller decide — but only when
    // *nothing* had a time, so a file with a few gaps is left alone.
    const anyTimed = points.some((p) => Number.isFinite(p.t));
    if (!anyTimed) {
      const base = Date.now();
      points.forEach((p, i) => { p.t = base + i * 1000; });
    } else {
      // Drop the untimed stragglers rather than guessing where they belong.
      for (let i = points.length - 1; i >= 0; i--) {
        if (!Number.isFinite(points[i]!.t)) points.splice(i, 1);
      }
    }

    tracks.push({
      name: tagText(body, 'name'),
      type: tagText(body, 'type'),
      points,
    });
  }

  return tracks;
}

/** Whether a document is worth handing to `parseGpx` at all. */
export function looksLikeGpx(text: string): boolean {
  return /<(?:\w+:)?gpx[\s>]/i.test(text) || /<(?:\w+:)?trkpt[\s>]/i.test(text);
}

// ------------------------------------------------------------ writing ----

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface GpxExportOptions {
  name: string;
  /** A CardioType. Written so a round trip keeps it. */
  type?: string;
  /** Heart rate and cadence, in the extension shape Garmin and Strava read. */
  includeExtensions?: boolean;
}

/**
 * Write a GPX 1.1 document.
 *
 * The extension namespace is Garmin's TrackPointExtension, which is not a
 * standard so much as the thing every other tool decided to accept. Writing
 * anything else means heart rate silently disappearing on import elsewhere.
 */
export function toGpx(points: TrackPoint[], opts: GpxExportOptions): string {
  const { name, type, includeExtensions = true } = opts;

  const body = points
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Number.isFinite(p.t))
    .map((p) => {
      const parts: string[] = [
        `<trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">`,
      ];
      if (typeof p.ele === 'number') parts.push(`<ele>${p.ele.toFixed(1)}</ele>`);
      parts.push(`<time>${new Date(p.t).toISOString()}</time>`);

      if (includeExtensions && (typeof p.hr === 'number' || typeof p.cadence === 'number')) {
        const inner: string[] = [];
        if (typeof p.hr === 'number') inner.push(`<gpxtpx:hr>${Math.round(p.hr)}</gpxtpx:hr>`);
        if (typeof p.cadence === 'number') inner.push(`<gpxtpx:cad>${Math.round(p.cadence)}</gpxtpx:cad>`);
        parts.push(`<extensions><gpxtpx:TrackPointExtension>${inner.join('')}</gpxtpx:TrackPointExtension></extensions>`);
      }

      parts.push('</trkpt>');
      return `      ${parts.join('')}`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ForgeFit"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata>
    <name>${escapeXml(name)}</name>
    <time>${new Date(points[0]?.t ?? Date.now()).toISOString()}</time>
  </metadata>
  <trk>
    <name>${escapeXml(name)}</name>${type ? `\n    <type>${escapeXml(type)}</type>` : ''}
    <trkseg>
${body}
    </trkseg>
  </trk>
</gpx>
`;
}

// ------------------------------------------------------------- import ----

/** What a GPX file turns into, before anybody decides whether to keep it. */
export interface ImportCandidate {
  name: string;
  type: string;
  points: TrackPoint[];
  date: string;
  distanceM: number;
  minutes: number;
  /** True when the file carried no clock and one was invented. */
  syntheticTime: boolean;
}

/** Map the free text in a GPX `<type>` onto a kind this app knows. */
export function typeFromGpx(raw: string | null): string {
  const t = (raw ?? '').toLowerCase();
  if (!t) return 'run';
  // Stems rather than whole words: exporters write "hiking", "cycling" and
  // "running" as often as the nouns, and matching "hike" missed every file
  // Garmin produces. Wheels are checked first because "trail running" and
  // "mountain biking" both contain a foot sport's stem.
  if (/ride|ridin|cycl|bike|bikin/.test(t)) return 'ride';
  if (/swim/.test(t)) return 'swim';
  if (/row|kayak|canoe|paddl/.test(t)) return 'row';
  if (/hik|trek|backpack/.test(t)) return 'hike';
  if (/walk|hiking/.test(t)) return 'walk';
  if (/run|jog/.test(t)) return 'run';
  return 'other';
}

export function candidatesFrom(xml: string): ImportCandidate[] {
  return parseGpx(xml)
    .map((track) => {
      const stats = trackStats(track.points);
      const first = track.points[0];
      // Untimed files get "now" from the parser; flag it so the UI can say the
      // date is the import date rather than the day it happened.
      const spread = track.points.length > 1
        ? track.points[track.points.length - 1]!.t - track.points[0]!.t
        : 0;
      const syntheticTime = spread === (track.points.length - 1) * 1000;

      return {
        name: track.name?.trim() || 'Imported activity',
        type: typeFromGpx(track.type),
        points: track.points,
        date: new Date(first?.t ?? Date.now()).toISOString().slice(0, 10),
        distanceM: Math.round(stats.distanceM),
        minutes: Math.round((stats.movingS > 0 ? stats.movingS : stats.elapsedS) / 60),
        syntheticTime,
      };
    })
    // Anything under twenty metres is a file that recorded somebody standing
    // up, which is the same floor the recorder itself uses.
    .filter((c) => c.distanceM >= 20 && c.points.length >= 5);
}

/**
 * Whether an import would duplicate something already stored.
 *
 * Matched on start time within a couple of minutes and distance within five
 * per cent, rather than on any identifier: the same run exported from Garmin
 * and from Strava has different ids, slightly different point counts and,
 * because of their different smoothing, slightly different distances.
 */
export function isDuplicate(
  candidate: { points: TrackPoint[]; distanceM: number },
  existing: { points: { t: number }[]; distanceM: number }[],
): boolean {
  const start = candidate.points[0]?.t;
  if (start == null) return false;

  return existing.some((e) => {
    const otherStart = e.points[0]?.t;
    if (otherStart == null) return false;
    const closeInTime = Math.abs(otherStart - start) <= 120_000;
    const closeInDistance =
      candidate.distanceM > 0 && Math.abs(e.distanceM - candidate.distanceM) / candidate.distanceM <= 0.05;
    return closeInTime && closeInDistance;
  });
}

export const GPX_NOTE =
  'GPX is what Garmin, Strava, Wahoo, COROS and almost everything else will hand you if you ask for your data. It needs no API and no account. Exports here are GPX 1.1 with heart rate and cadence in the extension shape those tools actually read.';

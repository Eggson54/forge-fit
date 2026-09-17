/**
 * Ranked search across mixed record types (exercises, foods, routines, the
 * app's own screens). Kept free of any data imports so the caller decides what
 * is searchable and the ranking stays testable on its own.
 */

export type SearchKind = 'exercise' | 'food' | 'routine' | 'screen' | 'protocol';

export interface SearchEntry {
  id: string;
  kind: SearchKind;
  title: string;
  /** Muscle, brand, category — shown under the title and also matched. */
  subtitle?: string;
  /** Extra match terms that are not worth displaying (synonyms, plurals). */
  keywords?: string[];
  href: string;
}

export interface SearchHit extends SearchEntry {
  score: number;
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Scores a single field. A prefix beats a word-boundary hit, which beats a bare
 * substring — so typing "press" puts "Press Machine" above "Bench Press" only
 * when nothing better matched, and typing "bench" still surfaces Bench Press
 * first. Shorter titles win ties because they are the more literal answer.
 */
function fieldScore(field: string, q: string): number {
  if (!field) return 0;
  const f = norm(field);
  if (!f) return 0;
  if (f === q) return 100;
  if (f.startsWith(q)) return 70;
  if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(f)) return 50;
  // A bare substring hit on one or two characters is noise: "bb" lands inside
  // "dumbbell", "db" inside "seated". Short tokens have to start a word.
  if (q.length > 2 && f.includes(q)) return 25;
  return 0;
}

/**
 * Gym shorthand, which nobody types in full. Expanded at query time rather than
 * stamped onto every record, so the exercise library stays a description of
 * exercises instead of a description of how people search for them.
 */
const SYNONYMS: Record<string, string[]> = {
  db: ['dumbbell'],
  dbs: ['dumbbell'],
  bb: ['barbell'],
  kb: ['kettlebell'],
  ohp: ['overhead', 'press', 'shoulder'],
  rdl: ['romanian', 'deadlift'],
  bw: ['bodyweight'],
  abs: ['core'],
  lats: ['back'],
  pecs: ['chest'],
  delts: ['shoulders'],
  quads: ['quads', 'legs'],
  hams: ['hamstrings'],
  cardio: ['conditioning'],
  '1rm': ['one', 'rep', 'max'],
  pr: ['record', 'records'],
  macros: ['nutrition', 'goals', 'targets'],
  weigh: ['weight'],
};

/**
 * Every token in the query has to hit something, so "incline db" finds the
 * incline dumbbell press and "incline squat" finds nothing rather than every
 * incline movement in the library.
 */
function entryScore(entry: SearchEntry, tokens: string[]): number {
  let total = 0;
  for (const t of tokens) {
    // A synonym is a weaker signal than the word the user actually typed, so it
    // never outranks a literal hit on the same entry.
    const variants: { term: string; weight: number }[] = [
      { term: t, weight: 1 },
      ...(SYNONYMS[t] ?? []).map((term) => ({ term, weight: 0.8 })),
    ];
    let best = 0;
    for (const { term, weight } of variants) {
      const hit = Math.max(
        fieldScore(entry.title, term),
        Math.round(fieldScore(entry.subtitle ?? '', term) * 0.6),
        ...(entry.keywords ?? []).map((k) => Math.round(fieldScore(k, term) * 0.5)),
      );
      best = Math.max(best, Math.round(hit * weight));
    }
    if (best === 0) return 0;
    total += best;
  }
  // Prefer the shorter of two otherwise-equal titles.
  return total - Math.min(9, Math.floor(norm(entry.title).length / 6));
}

/** Screens rank above content so "settings" does not return a protein bar. */
const KIND_BONUS: Record<SearchKind, number> = {
  screen: 6,
  routine: 4,
  exercise: 2,
  protocol: 1,
  food: 0,
};

export function searchEntries(query: string, entries: SearchEntry[], limit = 24): SearchHit[] {
  const tokens = norm(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const e of entries) {
    const score = entryScore(e, tokens);
    if (score > 0) hits.push({ ...e, score: score + KIND_BONUS[e.kind] });
  }
  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return hits.slice(0, limit);
}

/** Groups hits by kind, preserving rank order within and between groups. */
export function groupHits(hits: SearchHit[]): { kind: SearchKind; hits: SearchHit[] }[] {
  const order: SearchKind[] = [];
  const map = new Map<SearchKind, SearchHit[]>();
  for (const h of hits) {
    if (!map.has(h.kind)) {
      map.set(h.kind, []);
      order.push(h.kind);
    }
    map.get(h.kind)!.push(h);
  }
  return order.map((kind) => ({ kind, hits: map.get(kind)! }));
}

export const KIND_LABEL: Record<SearchKind, string> = {
  exercise: 'Exercises',
  food: 'Foods',
  routine: 'Routines',
  screen: 'Go to',
  protocol: 'Protocols',
};

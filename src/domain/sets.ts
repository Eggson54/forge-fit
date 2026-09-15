import type { SetEntry, SetKind } from './types';

export const SET_KIND_ORDER: SetKind[] = ['working', 'warmup', 'drop', 'failure'];

export const SET_KIND_LABEL: Record<SetKind, string> = {
  working: 'Working set',
  warmup: 'Warm-up set',
  drop: 'Drop set',
  failure: 'Set to failure',
};

/** Single-letter marker shown in place of the set number. */
export const SET_KIND_MARK: Record<SetKind, string | null> = {
  working: null,
  warmup: 'W',
  drop: 'D',
  failure: 'F',
};

export function setKind(s: SetEntry): SetKind {
  // `isWarmup` predates `kind` and still appears in persisted logs.
  if (s.kind) return s.kind;
  return s.isWarmup ? 'warmup' : 'working';
}

/** Warm-ups are excluded from volume, PRs and progression. Nothing else is. */
export function isWarmupSet(s: SetEntry): boolean {
  return setKind(s) === 'warmup';
}

export function nextSetKind(s: SetEntry): SetKind {
  const i = SET_KIND_ORDER.indexOf(setKind(s));
  return SET_KIND_ORDER[(i + 1) % SET_KIND_ORDER.length]!;
}

import type { CoachIntent } from './coach';

/**
 * Routing for a question typed in the coach's own words.
 *
 * The coach answers from what the app has logged. It is not a clinician and
 * not a pharmacist, so anything reaching for a dose, a compound, a symptom or
 * an injury is refused here rather than answered badly — the refusal is a
 * routing decision, not a judgement about the person asking.
 */
export type QuestionRoute =
  | { kind: 'intent'; intent: CoachIntent }
  /** Out of scope on safety grounds. `topic` only shapes the wording. */
  | { kind: 'refuse'; topic: 'medical' | 'injury' }
  /** In scope but not understood; the coach says what it can answer. */
  | { kind: 'unknown' };

const has = (text: string, words: string[]): boolean =>
  words.some((w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, 'i').test(text));

/**
 * Anything about substances, doses or prescriptions. Deliberately broad: a
 * false positive costs one unhelpful answer, and a false negative has the app
 * dispensing drug advice.
 */
const MEDICAL = [
  'dose', 'doses', 'dosage', 'dosing', 'mg', 'mcg', 'iu', 'ml',
  'inject', 'injection', 'injecting', 'syringe', 'subq', 'im',
  'peptide', 'peptides', 'cycle', 'cycling', 'pct', 'stack',
  'steroid', 'steroids', 'sarm', 'sarms', 'hgh', 'trt', 'test', 'tren',
  'bpc', 'tb500', 'ostarine', 'semaglutide', 'tirzepatide', 'ozempic',
  'clen', 'anavar', 'creatine loading', 'prescription', 'prescribe',
  'medication', 'medications', 'meds', 'drug', 'drugs', 'supplement stack',
];

const INJURY = [
  'pain', 'painful', 'hurts', 'hurting', 'injured', 'injury', 'tear', 'tore', 'torn',
  'sprain', 'sprained', 'strain', 'strained', 'fracture', 'broken',
  'tendonitis', 'tendinitis', 'impingement', 'herniated', 'sciatica',
  'symptom', 'symptoms', 'diagnose', 'diagnosis', 'swollen', 'numb',
];

const WEAKEST = ['slack', 'slacking', 'weak', 'weakest', 'worst', 'behind', 'gap', 'gaps', 'failing', 'struggling', 'lacking', 'missing'];
const PUSH = ['push', 'motivate', 'motivation', 'hype', 'lazy', 'unmotivated', 'tired', 'skip', 'quit', 'give up', 'rough'];
const NEXT = ['next', 'now', 'do first', 'priority', 'quick win', 'easiest', 'should i do'];
const ON_TRACK = ['on track', 'doing', 'going', 'progress', 'well', 'improving', 'working'];

/**
 * Pick the branch a typed question belongs to.
 *
 * Order matters: the safety checks run first, because "what dose should I push
 * to" contains a motivation keyword and is still a drug question.
 */
export function classifyQuestion(raw: string): QuestionRoute {
  const text = raw.trim().toLowerCase();
  if (!text) return { kind: 'unknown' };

  if (has(text, MEDICAL)) return { kind: 'refuse', topic: 'medical' };
  if (has(text, INJURY)) return { kind: 'refuse', topic: 'injury' };

  if (has(text, WEAKEST)) return { kind: 'intent', intent: 'weakest' };
  if (has(text, PUSH)) return { kind: 'intent', intent: 'push' };
  if (has(text, ON_TRACK)) return { kind: 'intent', intent: 'on_track' };
  if (has(text, NEXT)) return { kind: 'intent', intent: 'next_win' };

  return { kind: 'unknown' };
}

/** What the coach says when it will not answer. Plain, once, no lecture. */
export function refusalText(topic: 'medical' | 'injury'): string {
  return topic === 'medical'
    ? "I don't give advice on doses, compounds or medication — that's a conversation for a doctor or pharmacist. The protocol tracker will log whatever you and they decide on."
    : "I can't help with pain or an injury. See a physio or a doctor for that one. I'll still be here for the training and the food.";
}

/** What the coach says when it simply did not follow the question. */
export const UNKNOWN_TEXT =
  "I didn't follow that. I can tell you where you're slacking, what to do next, whether you're on track, or push you into today's session.";

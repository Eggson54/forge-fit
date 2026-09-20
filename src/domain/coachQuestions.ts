import type { CoachIntent } from './coach';
import { compoundAsk, findCompound, type CompoundAsk } from './peptides';

/**
 * Routing for a question typed in the coach's own words.
 *
 * The split this file exists to enforce is between questions of *fact* and
 * questions of *prescription*. "What is BPC-157, and is it banned in tested
 * sport" has an answer that does not depend on who is asking, and refusing it
 * just sends the person to a forum that will answer worse. "How much should I
 * take" depends entirely on who is asking — their history, their bloodwork,
 * their other medications — and this app knows none of that.
 *
 * So: facts are answered from the reference in `peptides.ts`; doses, cycles,
 * stacks, start/stop decisions and where to buy are refused, and the refusal
 * says what the coach *can* tell them instead.
 */

export type RefusalTopic =
  /** How much, how long, what to combine, whether to start or stop. */
  | 'dosing'
  /** Where to buy something, especially something unapproved. */
  | 'sourcing'
  /** Medication and hormone-therapy questions outside the reference. */
  | 'medical'
  /** Pain, injury, symptoms, diagnosis. */
  | 'injury';

export type QuestionRoute =
  | { kind: 'intent'; intent: CoachIntent }
  /** A question of fact about a compound in the reference. */
  | { kind: 'compound'; compoundId: string; ask: CompoundAsk }
  | { kind: 'refuse'; topic: RefusalTopic }
  /** In scope but not understood; the coach says what it can answer. */
  | { kind: 'unknown' };

const has = (text: string, words: string[]): boolean =>
  words.some((w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, 'i').test(text));

/**
 * Asking for a prescription, in any of the ways people phrase it.
 *
 * Checked before anything else, including before the compound reference: "how
 * much BPC-157" names a compound the app can describe and still asks for the
 * one thing it will not say.
 */
const DOSING_PATTERNS: RegExp[] = [
  /\bhow (much|many|often|long)\b/i,
  /\b(dose|doses|dosage|dosing|dosed)\b/i,
  /\b\d+\s?(mg|mcg|ug|iu|ml|units?)\b/i,
  /\b(mg|mcg|iu)\s?\/?\s?(kg|day|week|wk)\b/i,
  /\bshould i (take|use|run|start|stop|try|inject|cycle|add|increase|decrease|drop|come off|get on|keep taking)\b/i,
  /\b(can|could) i (take|use|run|stack|combine|mix)\b/i,
  /\b(stack|stacking|stacked)\b/i,
  /\b(cycle|cycling|cycles)\b/i,
  /\b(pct|taper|titrate|titration|ramp up|front ?load|loading phase)\b/i,
  /\b(protocol|regimen|schedule) for\b/i,
  /\bcombine (it|them|this|that)?\s?with\b/i,
  /\bwhat (should|do) i (take|run|use)\b/i,
];

/** Where to get it. Not a question this app answers, least of all for an unapproved injectable. */
const SOURCING_PATTERNS: RegExp[] = [
  /\bwhere (can|do|should) i (buy|get|order|source|find)\b/i,
  /\b(best|good|legit|trusted|reliable) (source|vendor|supplier|seller|site|lab)\b/i,
  /\b(buy|order|source) (it|them|this|some)\b/i,
];

/**
 * Medication and hormone-therapy topics with no reference entry.
 *
 * Deliberately broad: a false positive costs one unhelpful answer, and a false
 * negative has the app improvising about anabolic steroids.
 */
const MEDICAL = [
  'steroid', 'steroids', 'anabolic', 'sarm', 'sarms', 'ostarine', 'rad140', 'lgd',
  'tren', 'trenbolone', 'anavar', 'winstrol', 'dianabol', 'deca', 'clen', 'clenbuterol',
  'hgh', 'trt', 'testosterone', 'aromatase', 'arimidex', 'nolvadex', 'clomid',
  'prescription', 'prescribe', 'prescribed', 'medication', 'medications', 'meds',
  'antibiotic', 'antibiotics', 'diuretic', 'insulin', 'thyroid', 'ssri', 'adderall',
];

const INJURY = [
  'pain', 'painful', 'hurts', 'hurting', 'injured', 'injury', 'tear', 'tore', 'torn',
  'sprain', 'sprained', 'strain', 'strained', 'fracture', 'fractured', 'broken',
  'tendonitis', 'tendinitis', 'impingement', 'herniated', 'sciatica',
  'symptom', 'symptoms', 'diagnose', 'diagnosis', 'swollen', 'numb', 'numbness',
];

const WEAKEST = ['slack', 'slacking', 'weak', 'weakest', 'worst', 'behind', 'gap', 'gaps', 'failing', 'struggling', 'lacking', 'missing'];
const PUSH = ['push', 'motivate', 'motivation', 'hype', 'lazy', 'unmotivated', 'tired', 'skip', 'quit', 'give up', 'rough'];
const NEXT = ['next', 'now', 'do first', 'priority', 'quick win', 'easiest', 'should i do'];
const ON_TRACK = ['on track', 'doing', 'going', 'progress', 'well', 'improving', 'working'];

/**
 * Pick the branch a typed question belongs to.
 *
 * Order matters and is the whole design:
 *  1. Sourcing and dosing, before anything can make them look answerable.
 *  2. The compound reference, so a question of fact gets a real answer even
 *     when it happens to mention pain or the word "safe".
 *  3. Injury, then medication topics with no reference entry.
 *  4. The ordinary coaching intents.
 */
export function classifyQuestion(raw: string): QuestionRoute {
  const text = raw.trim().toLowerCase();
  if (!text) return { kind: 'unknown' };

  if (SOURCING_PATTERNS.some((p) => p.test(text))) return { kind: 'refuse', topic: 'sourcing' };
  if (DOSING_PATTERNS.some((p) => p.test(text))) return { kind: 'refuse', topic: 'dosing' };

  const compound = findCompound(text);
  if (compound) return { kind: 'compound', compoundId: compound.id, ask: compoundAsk(text) };

  if (has(text, INJURY)) return { kind: 'refuse', topic: 'injury' };
  if (has(text, MEDICAL)) return { kind: 'refuse', topic: 'medical' };

  if (has(text, WEAKEST)) return { kind: 'intent', intent: 'weakest' };
  if (has(text, PUSH)) return { kind: 'intent', intent: 'push' };
  if (has(text, ON_TRACK)) return { kind: 'intent', intent: 'on_track' };
  if (has(text, NEXT)) return { kind: 'intent', intent: 'next_win' };

  return { kind: 'unknown' };
}

/**
 * What the coach says when it will not answer.
 *
 * Every one of these names what it *can* do instead, because a refusal that
 * ends there is the reason people go and ask a forum.
 */
export function refusalText(topic: RefusalTopic, compoundName?: string): string {
  const subject = compoundName ?? 'that';
  switch (topic) {
    case 'dosing':
      return `I won't put a number on that. How much, how long and what to combine depend on your history and your bloodwork, and that is a prescriber's call, not an app's.\n\nAsk me what ${subject} is, what the evidence looks like, what the known risks are, whether it is approved, or whether it is banned in tested sport — I'll answer any of those straight. Then log whatever you and your doctor settle on in the protocol tracker.`;
    case 'sourcing':
      return `I don't point people at sellers. For anything unapproved there is no supply chain worth trusting — independent testing keeps finding vials under-dosed, mislabelled or contaminated.\n\nI'll tell you what ${subject} is, what is known about it and how it is regulated, if that helps.`;
    case 'medical':
      return "That one is outside what I keep a reference on — hormone therapy and prescription medication are a conversation for a doctor or pharmacist, not a training app.\n\nI can talk through the peptides and supplements I do have entries for, and the protocol tracker will log whatever you are already on.";
    case 'injury':
      return "I can't help with pain or an injury. See a physio or a doctor for that one — getting it looked at early is the cheap version.\n\nI'll still be here for the training and the food, and you can log the sessions you can do.";
  }
}

/** What the coach says when it simply did not follow the question. */
export const UNKNOWN_TEXT =
  "I didn't follow that. I can tell you where you're slacking, what to do next, whether you're on track, push you into today's session — or answer questions about a peptide or supplement: what it is, whether it works, the risks, and whether it's banned in tested sport.";

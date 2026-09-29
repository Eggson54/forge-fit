import { UNKNOWN_TEXT, classifyQuestion, refusalText } from './coachQuestions';
import { compoundAnswer, compoundById, findCompound } from './peptides';
import { readingAnswer } from './coachReadings';
import type { CoachIntent } from './coach';
import type { CoachMessageRequest, CoachMessageResult } from '../services/ai/types';

/**
 * Where a coach request goes, decided before anything leaves the phone.
 *
 * This used to live inside the on-device coach, which meant it only ran when
 * there was no backend. Configure the real AI server and every question went
 * to it verbatim — and the server ignored the question, so the chat broke,
 * and nothing on that side knew the rules: no refusing a dosing question, no
 * reference answer about a compound, no computed maintenance figure. The
 * rules the product is built on were a property of the offline mode.
 *
 * Now they are a property of the app. Refusals, compound facts and numbers
 * computed from the athlete's own logs are answered here, identically with
 * or without a server, and never reach a model at all. Only a request that is
 * genuinely asking for coaching prose goes out, and it goes out as an intent
 * — the athlete's own words stay on the device.
 */

export type CoachRoute =
  /** Answered here. The result is final; nothing is sent anywhere. */
  | { kind: 'answered'; result: CoachMessageResult }
  /** Needs coaching prose, for this intent. */
  | { kind: 'coach'; intent: CoachIntent };

export function routeCoachRequest(req: Pick<CoachMessageRequest, 'intent' | 'question' | 'readings'>): CoachRoute {
  // An explicit intent — a prompt chip, or the unprompted daily message —
  // needs no routing.
  if (req.intent) return { kind: 'coach', intent: req.intent };
  if (!req.question) return { kind: 'coach', intent: 'daily' };

  const route = classifyQuestion(req.question);

  switch (route.kind) {
    case 'compound': {
      const compound = compoundById(route.compoundId);
      // The id came from the same reference, so this cannot miss — but a miss
      // must never fall through into coaching about a drug.
      if (!compound) return answered({ text: UNKNOWN_TEXT, tone: 'reflect', declined: 'unknown' });
      return answered({
        text: compoundAnswer(compound, route.ask),
        tone: 'reflect',
        reference: { compoundId: compound.id, title: compound.name },
      });
    }
    case 'refuse': {
      // Name the compound when one was mentioned, so "ask me what it is
      // instead" points at something concrete.
      const named = findCompound(req.question);
      return answered({ text: refusalText(route.topic, named?.name), tone: 'reflect', declined: route.topic });
    }
    case 'unknown':
      return answered({ text: UNKNOWN_TEXT, tone: 'reflect', declined: 'unknown' });
    case 'reading':
      // Computed, never generated: a plausible-sounding calorie figure is the
      // worst kind of wrong answer this app could give. Without the numbers
      // it says it cannot read that yet.
      if (!req.readings) return answered({ text: UNKNOWN_TEXT, tone: 'reflect', declined: 'unknown' });
      return answered({ text: readingAnswer(route.reading, req.readings), tone: 'reflect' });
    case 'intent':
      return { kind: 'coach', intent: route.intent };
  }
}

const answered = (result: CoachMessageResult): CoachRoute => ({ kind: 'answered', result });

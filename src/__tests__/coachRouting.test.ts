import { routeCoachRequest } from '../domain/coachRouting';

/**
 * The property this module exists for: whatever the server does, a question
 * the app will not answer never reaches it. These phrasings come from the
 * classifier's own tests, so they are what it actually recognises.
 */
const NEVER_SENT = [
  // Dosing and plans.
  'how much tren should I run',
  'should I start testosterone',
  'plan my next peptide cycle',
  'what should I stack with CJC-1295',
  'push me to start my next cycle',
  // Sourcing.
  'where do I get ostarine',
  'where can I buy BPC-157',
  'best source for melanotan',
  // Injury.
  'my shoulder hurts on bench',
  'I think I tore something',
  // Reference questions about a compound, answered from the app's own text.
  'what is BPC-157',
  'is TB-500 safe',
  'tell me about tirzepatide',
  // Out of scope entirely.
  'what is the capital of France',
];

describe('routeCoachRequest', () => {
  it.each(NEVER_SENT)('answers "%s" on the device and never sends it', (question) => {
    const route = routeCoachRequest({ question });
    expect(route.kind).toBe('answered');
  });

  it('refuses dosing with the dosing flag, so the UI draws it as a refusal', () => {
    const route = routeCoachRequest({ question: 'how much tren should I run' });
    expect(route.kind === 'answered' && route.result.declined).toBe('dosing');
  });

  it('refuses sourcing with the sourcing flag', () => {
    const route = routeCoachRequest({ question: 'where can I buy BPC-157' });
    expect(route.kind === 'answered' && route.result.declined).toBe('sourcing');
  });

  it('marks a compound answer as a reference, not coaching', () => {
    const route = routeCoachRequest({ question: 'what is BPC-157' });
    expect(route.kind === 'answered' && route.result.reference?.compoundId).toBeTruthy();
    expect(route.kind === 'answered' && route.result.declined).toBeFalsy();
  });

  it('sends a genuine coaching question as an intent', () => {
    expect(routeCoachRequest({ question: 'where am I slacking?' })).toEqual({ kind: 'coach', intent: 'weakest' });
    expect(routeCoachRequest({ question: 'am I on track this week' })).toEqual({ kind: 'coach', intent: 'on_track' });
  });

  it('honours an explicit intent without classifying anything', () => {
    expect(routeCoachRequest({ intent: 'push' })).toEqual({ kind: 'coach', intent: 'push' });
  });

  it('treats no question and no intent as the daily message', () => {
    expect(routeCoachRequest({})).toEqual({ kind: 'coach', intent: 'daily' });
  });

  it('never sends a question the app answers by computing from logs', () => {
    // Asked with no logs assembled, it is declined rather than generated: a
    // plausible-sounding calorie figure is the worst kind of wrong answer.
    const route = routeCoachRequest({ question: 'what are my maintenance calories' });
    expect(route.kind).toBe('answered');
    expect(route.kind === 'answered' && route.result.declined).toBe('unknown');
  });
});

import { UNKNOWN_TEXT, classifyQuestion, refusalText } from '../domain/coachQuestions';

describe('classifyQuestion', () => {
  it('routes the everyday questions to the branch that answers them', () => {
    expect(classifyQuestion('where am I slacking?')).toEqual({ kind: 'intent', intent: 'weakest' });
    expect(classifyQuestion('push me, I really cannot be bothered')).toEqual({ kind: 'intent', intent: 'push' });
    expect(classifyQuestion('am I on track this week')).toEqual({ kind: 'intent', intent: 'on_track' });
    expect(classifyQuestion('what should I do next')).toEqual({ kind: 'intent', intent: 'next_win' });
  });

  it('refuses anything reaching for a dose or a compound', () => {
    for (const q of [
      'how much BPC should I take',
      'what dose of semaglutide',
      'should I start TRT',
      'is 500mg a week fine',
      'plan my next peptide cycle',
    ]) {
      expect(classifyQuestion(q)).toEqual({ kind: 'refuse', topic: 'medical' });
    }
  });

  it('refuses a drug question even when it is dressed as motivation', () => {
    // 'push' would otherwise match first.
    expect(classifyQuestion('push me to start my next cycle')).toEqual({ kind: 'refuse', topic: 'medical' });
  });

  it('refuses pain and injury questions', () => {
    expect(classifyQuestion('my shoulder hurts on bench')).toEqual({ kind: 'refuse', topic: 'injury' });
    expect(classifyQuestion('I think I tore something')).toEqual({ kind: 'refuse', topic: 'injury' });
  });

  it('does not match a keyword buried inside another word', () => {
    // "testing" contains "test"; "mgmt" contains "mg".
    expect(classifyQuestion('am I testing myself hard enough')).not.toMatchObject({ kind: 'refuse' });
  });

  it('says so plainly rather than guessing', () => {
    expect(classifyQuestion('what is the capital of France')).toEqual({ kind: 'unknown' });
    expect(classifyQuestion('   ')).toEqual({ kind: 'unknown' });
  });
});

describe('refusal wording', () => {
  it('names who to ask instead, and never a dose', () => {
    const medical = refusalText('medical');
    expect(medical).toMatch(/doctor|pharmacist/i);
    expect(medical).not.toMatch(/\d+\s?(mg|mcg|iu)/i);
    expect(refusalText('injury')).toMatch(/physio|doctor/i);
  });

  it('offers what it can do when it did not understand', () => {
    expect(UNKNOWN_TEXT).toMatch(/slacking/);
  });
});

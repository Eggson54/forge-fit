import { UNKNOWN_TEXT, classifyQuestion, refusalText } from '../domain/coachQuestions';
import {
  CLINICIAN_LINE,
  COMPOUNDS,
  compoundAnswer,
  compoundAsk,
  compoundById,
  findCompound,
} from '../domain/peptides';

describe('classifyQuestion — coaching', () => {
  it('routes the everyday questions to the branch that answers them', () => {
    expect(classifyQuestion('where am I slacking?')).toEqual({ kind: 'intent', intent: 'weakest' });
    expect(classifyQuestion('push me, I really cannot be bothered')).toEqual({ kind: 'intent', intent: 'push' });
    expect(classifyQuestion('am I on track this week')).toEqual({ kind: 'intent', intent: 'on_track' });
  });

  it('says so plainly rather than guessing', () => {
    expect(classifyQuestion('what is the capital of France')).toEqual({ kind: 'unknown' });
    expect(classifyQuestion('   ')).toEqual({ kind: 'unknown' });
  });
});

describe('classifyQuestion — questions of fact about a compound', () => {
  it('answers what something is instead of refusing', () => {
    expect(classifyQuestion('what is BPC-157')).toEqual({ kind: 'compound', compoundId: 'bpc157', ask: 'what' });
    expect(classifyQuestion('tell me about tirzepatide')).toEqual({ kind: 'compound', compoundId: 'tirzepatide', ask: 'what' });
  });

  it('picks the facet the question reaches for', () => {
    expect(classifyQuestion('is TB-500 safe')).toMatchObject({ compoundId: 'tb500', ask: 'risks' });
    expect(classifyQuestion('does BPC 157 actually work')).toMatchObject({ compoundId: 'bpc157', ask: 'evidence' });
    expect(classifyQuestion('is ipamorelin legal')).toMatchObject({ compoundId: 'ipamorelin', ask: 'legal' });
    expect(classifyQuestion('is creatine banned by WADA')).toMatchObject({ compoundId: 'creatine', ask: 'sport' });
    expect(classifyQuestion('semaglutide')).toMatchObject({ compoundId: 'semaglutide', ask: 'overview' });
  });

  it('answers a compound question that happens to mention pain', () => {
    // The injury guard must not swallow a question of fact.
    expect(classifyQuestion('is BPC-157 studied for tendon pain')).toMatchObject({ kind: 'compound', compoundId: 'bpc157' });
  });

  it('answers factual questions about steroids, SARMs and TRT rather than stonewalling', () => {
    expect(classifyQuestion('is trenbolone worth it')).toMatchObject({ kind: 'compound', compoundId: 'aas' });
    expect(classifyQuestion('what about ostarine')).toMatchObject({ kind: 'compound', compoundId: 'sarms' });
    expect(classifyQuestion('what is TRT')).toMatchObject({ kind: 'compound', compoundId: 'testosterone' });
    expect(classifyQuestion('is HGH banned')).toMatchObject({ kind: 'compound', compoundId: 'hgh', ask: 'sport' });
  });

  it('still refuses the prescribing question about them', () => {
    expect(classifyQuestion('how much tren should I run')).toEqual({ kind: 'refuse', topic: 'dosing' });
    expect(classifyQuestion('should I start testosterone')).toEqual({ kind: 'refuse', topic: 'dosing' });
    expect(classifyQuestion('where do I get ostarine')).toEqual({ kind: 'refuse', topic: 'sourcing' });
  });
});

describe('classifyQuestion — the line it will not cross', () => {
  it('refuses a dose even when it knows the compound', () => {
    for (const q of [
      'how much BPC-157 should I take',
      'what dose of semaglutide',
      'is 500mg a week fine',
      'should I start TRT',
      'how long should I run ipamorelin for',
      'can I take tirzepatide with creatine',
    ]) {
      expect(classifyQuestion(q)).toEqual({ kind: 'refuse', topic: 'dosing' });
    }
  });

  it('refuses a cycle or a stack', () => {
    expect(classifyQuestion('plan my next peptide cycle')).toEqual({ kind: 'refuse', topic: 'dosing' });
    expect(classifyQuestion('what should I stack with CJC-1295')).toEqual({ kind: 'refuse', topic: 'dosing' });
  });

  it('refuses a dosing question dressed as motivation', () => {
    expect(classifyQuestion('push me to start my next cycle')).toEqual({ kind: 'refuse', topic: 'dosing' });
  });

  it('refuses to point at a seller', () => {
    expect(classifyQuestion('where can I buy BPC-157')).toEqual({ kind: 'refuse', topic: 'sourcing' });
    expect(classifyQuestion('best source for melanotan')).toEqual({ kind: 'refuse', topic: 'sourcing' });
  });

  it('refuses medication it keeps no reference on', () => {
    expect(classifyQuestion('what about clenbuterol')).toEqual({ kind: 'refuse', topic: 'medical' });
    expect(classifyQuestion('should nolvadex be part of it')).toEqual({ kind: 'refuse', topic: 'medical' });
  });

  it('refuses pain and injury questions', () => {
    expect(classifyQuestion('my shoulder hurts on bench')).toEqual({ kind: 'refuse', topic: 'injury' });
    expect(classifyQuestion('I think I tore something')).toEqual({ kind: 'refuse', topic: 'injury' });
  });

  it('does not match a keyword buried inside another word', () => {
    expect(classifyQuestion('am I testing myself hard enough')).not.toMatchObject({ kind: 'refuse' });
  });
});

describe('findCompound', () => {
  it('prefers the longest alias, so a specific name is not swallowed by a general one', () => {
    expect(findCompound('melanotan ii')!.id).toBe('melanotan2');
    expect(findCompound('collagen peptides')!.id).toBe('collagen');
  });

  it('matches on word boundaries rather than substrings', () => {
    expect(findCompound('I did 500 reps of tb work')).toBeNull();
    expect(findCompound('creatinine came back high')).toBeNull();
  });

  it('finds nothing in an ordinary training question', () => {
    expect(findCompound('should I squat today')).toBeNull();
  });
});

describe('compoundAnswer', () => {
  it('always ends by handing the personal decision back', () => {
    for (const c of COMPOUNDS) {
      for (const ask of ['what', 'evidence', 'risks', 'legal', 'sport', 'overview'] as const) {
        expect(compoundAnswer(c, ask).endsWith(CLINICIAN_LINE)).toBe(true);
      }
    }
  });

  it('never states a dose', () => {
    // A number followed by a unit of mass or volume is the one thing that must
    // not appear anywhere in the reference, in any facet.
    const dose = /\b\d+(\.\d+)?\s?(mg|mcg|ug|iu|ml)\b/i;
    for (const c of COMPOUNDS) {
      expect(compoundAnswer(c, 'overview')).not.toMatch(dose);
    }
  });

  it('reports the evidence honestly where it is thin', () => {
    const bpc = compoundById('bpc157')!;
    expect(compoundAnswer(bpc, 'evidence')).toMatch(/no published randomised human trials/i);
    expect(compoundAnswer(bpc, 'legal')).toMatch(/not approved/i);
  });

  it('does not flatten a well-evidenced drug into the same warning as a research chemical', () => {
    expect(compoundAnswer(compoundById('semaglutide')!, 'evidence')).toMatch(/strong/i);
    expect(compoundAnswer(compoundById('creatine')!, 'evidence')).toMatch(/randomised trials/i);
  });

  it('gives the sport answer a date and a caveat, because the list changes yearly', () => {
    const answer = compoundAnswer(compoundById('tb500')!, 'sport');
    expect(answer).toMatch(/banned in tested sport/i);
    expect(answer).toMatch(/revised every year/i);
  });

  it('does not print the status label and then restate it', () => {
    // "Not on the prohibited list. Not on the WADA prohibited list." shipped
    // once. The note has to add to the label, not repeat it.
    for (const c of COMPOUNDS) {
      const answer = compoundAnswer(c, 'sport');
      const sentences = answer.split('\n\n')[0]!.split('. ').map((x) => x.trim().replace(/\.$/, '').toLowerCase());
      expect(new Set(sentences).size).toBe(sentences.length);
      expect(c.sportNote.toLowerCase()).not.toContain('not on the wada prohibited list');
    }
  });
});

describe('compoundAsk', () => {
  it('reads "is it safe" as a question about risk, not about existence', () => {
    expect(compoundAsk('is it safe')).toBe('risks');
  });

  it('falls back to an overview when nothing specific is asked', () => {
    expect(compoundAsk('bpc157')).toBe('overview');
  });
});

describe('refusal wording', () => {
  it('names what it can do instead, and never a dose', () => {
    const dosing = refusalText('dosing', 'BPC-157');
    expect(dosing).toMatch(/BPC-157/);
    expect(dosing).toMatch(/evidence|risks|approved|banned/i);
    expect(dosing).not.toMatch(/\d+\s?(mg|mcg|iu)/i);

    expect(refusalText('sourcing')).toMatch(/don't point people at sellers/i);
    expect(refusalText('medical')).toMatch(/doctor or pharmacist/i);
    expect(refusalText('injury')).toMatch(/physio|doctor/i);
  });

  it('offers the reference when the question did not name a compound', () => {
    expect(refusalText('dosing')).toContain('that');
  });

  it('says what it can answer when it did not understand', () => {
    expect(UNKNOWN_TEXT).toMatch(/slacking/);
    expect(UNKNOWN_TEXT).toMatch(/compound/);
    // And says which questions it will not take, so the offer is not a bait.
    expect(UNKNOWN_TEXT).toMatch(/doses/i);
  });
});

describe('the reference as a whole', () => {
  it('has no duplicate ids or aliases that would make a lookup ambiguous', () => {
    const ids = COMPOUNDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);

    const seen = new Map<string, string>();
    for (const c of COMPOUNDS) {
      for (const alias of c.aliases) {
        expect(seen.has(alias)).toBe(false);
        seen.set(alias, c.id);
      }
    }
  });

  it('gives every entry a status note and at least one risk', () => {
    for (const c of COMPOUNDS) {
      expect(c.statusNote.length).toBeGreaterThan(20);
      expect(c.risks.length).toBeGreaterThan(0);
      expect(c.sportNote.length).toBeGreaterThan(10);
    }
  });
});

describe('classifyQuestion — readings the logs can answer', () => {
  const reading = (q: string) => {
    const r = classifyQuestion(q);
    return r.kind === 'reading' ? r.reading : r.kind;
  };

  it('answers an ordinary calorie question instead of refusing it', () => {
    // "How many" opens the dosing refusal. It used to swallow this one whole.
    expect(reading('how many calories should I eat')).toBe('energy');
    expect(reading("what's my maintenance")).toBe('energy');
    expect(reading('how much protein do I need')).toBe('energy');
    expect(reading('am I in a deficit')).toBe('energy');
  });

  it('routes recovery questions', () => {
    expect(reading('am I recovered')).toBe('recovery');
    expect(reading('what should I train today')).toBe('recovery');
    expect(reading('should I take a rest day')).toBe('recovery');
  });

  it('routes body composition questions', () => {
    expect(reading('what is my body fat')).toBe('composition');
    expect(reading('how much lean mass do I have')).toBe('composition');
  });

  it('still refuses a dose even when the question mentions calories', () => {
    // A compound was named, so the reading check never runs.
    expect(classifyQuestion('how much tren should I take to cut calories')).toEqual({
      kind: 'refuse',
      topic: 'dosing',
    });
  });

  it('still refuses anything medical that happens to mention a macro', () => {
    expect(classifyQuestion('should I take clen to cut calories')).toEqual({
      kind: 'refuse',
      topic: 'dosing',
    });
    expect(classifyQuestion('my thyroid medication and my calories')).toEqual({
      kind: 'refuse',
      topic: 'medical',
    });
  });

  it('still refuses a sourcing question above everything', () => {
    expect(classifyQuestion('where can I buy something for my body fat')).toEqual({
      kind: 'refuse',
      topic: 'sourcing',
    });
  });

  it('leaves the ordinary coaching intents alone', () => {
    expect(classifyQuestion('where am I slacking')).toEqual({ kind: 'intent', intent: 'weakest' });
    expect(classifyQuestion('push me')).toEqual({ kind: 'intent', intent: 'push' });
  });
});

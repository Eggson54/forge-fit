import { ageProblem, heightProblem, weightProblem } from '../domain/bodyInputs';

describe('ageProblem', () => {
  it('allows the step to be skipped', () => {
    expect(ageProblem('')).toBeNull();
    expect(ageProblem('   ')).toBeNull();
  });

  it('accepts an ordinary age', () => {
    expect(ageProblem('30')).toBeNull();
    expect(ageProblem('13')).toBeNull();
    expect(ageProblem('92')).toBeNull();
  });

  it('refuses under thirteen and says why', () => {
    expect(ageProblem('12')).toMatch(/13 and over/);
  });

  it('catches the implausible and the malformed', () => {
    expect(ageProblem('300')).toMatch(/typo/);
    expect(ageProblem('thirty')).toMatch(/whole years/);
    expect(ageProblem('30.5')).toMatch(/whole years/);
  });
});

describe('heightProblem, imperial', () => {
  it('accepts an ordinary height', () => {
    expect(heightProblem({ ft: '5', inches: '10' })).toBeNull();
    expect(heightProblem({ ft: '6', inches: '' })).toBeNull();
  });

  it('refuses the thirty-foot person this was written for', () => {
    expect(heightProblem({ ft: '30', inches: '30' })).not.toBeNull();
  });

  it('recognises centimetres typed into the feet box', () => {
    // The single most likely mistake on this screen.
    expect(heightProblem({ ft: '180', inches: '' })).toMatch(/looks like centimetres/);
  });

  it('refuses twelve inches or more', () => {
    expect(heightProblem({ ft: '5', inches: '14' })).toMatch(/another foot/);
  });

  it('accepts heights at both ends of a real range', () => {
    // Somebody short or tall exists and is using a fitness app. The bounds
    // are for numbers that cannot be a person.
    expect(heightProblem({ ft: '4', inches: '0' })).toBeNull();
    expect(heightProblem({ ft: '7', inches: '4' })).toBeNull();
  });

  it('refuses something that is not a number', () => {
    expect(heightProblem({ ft: 'five', inches: '' })).toMatch(/as numbers/);
  });
});

describe('heightProblem, metric', () => {
  it('accepts an ordinary height', () => {
    expect(heightProblem({ cm: '178' })).toBeNull();
    expect(heightProblem({ cm: '178,5' })).toBeNull();
  });

  it('recognises feet typed into the centimetre box', () => {
    expect(heightProblem({ cm: '5.8' })).toMatch(/looks like feet/);
  });

  it('catches the implausible', () => {
    expect(heightProblem({ cm: '1780' })).toMatch(/typo/);
    expect(heightProblem({ cm: '30' })).toMatch(/typo/);
    expect(heightProblem({ cm: '' })).toMatch(/as a number/);
  });
});

describe('weightProblem', () => {
  it('accepts an ordinary weight in either unit', () => {
    expect(weightProblem('185', 'imperial')).toBeNull();
    expect(weightProblem('84', 'metric')).toBeNull();
  });

  it('refuses the thirty-pound adult who was told to eat 29 g of protein', () => {
    expect(weightProblem('30', 'imperial')).not.toBeNull();
  });

  it('suggests kilograms when a pounds figure is too light to be pounds', () => {
    // 45 "lb" is 20 kg, which is not an adult — but 45 kg is.
    expect(weightProblem('45', 'imperial')).toMatch(/might be kilograms/);
  });

  it('catches the implausible and the malformed', () => {
    expect(weightProblem('2000', 'imperial')).toMatch(/typo/);
    expect(weightProblem('abc', 'metric')).toMatch(/as a number/);
    expect(weightProblem('-80', 'metric')).toMatch(/as a number/);
  });

  it('is required for the current weight and optional for the target', () => {
    expect(weightProblem('', 'metric')).toMatch(/Enter a weight/);
    expect(weightProblem('', 'metric', { optional: true })).toBeNull();
  });

  it('accepts weights at both ends of a real range', () => {
    expect(weightProblem('80', 'imperial')).toBeNull();
    expect(weightProblem('600', 'imperial')).toBeNull();
  });
});

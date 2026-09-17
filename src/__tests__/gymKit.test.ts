import {
  barsAt,
  describeKit,
  emptyKit,
  isStandardKit,
  platesAt,
  smallestJump,
  type GymKit,
} from '../domain/gymKit';
import { planPlates } from '../domain/plates';

const kit = (over: Partial<GymKit> = {}): GymKit => ({ plates: [], bars: [], unit: 'metric', ...over });

describe('platesAt', () => {
  it('prefers the gym inventory over the profile default', () => {
    expect(platesAt('metric', kit({ plates: [20, 10] }), [25, 20, 15])).toEqual([20, 10]);
  });

  it('falls back to the profile default, then to standard', () => {
    expect(platesAt('metric', kit(), [20, 10])).toEqual([20, 10]);
    expect(platesAt('metric', undefined, undefined)).toEqual([25, 20, 15, 10, 5, 2.5, 1.25]);
  });

  it('treats an unfilled gym as unrecorded, not as a gym with no plates', () => {
    // An empty array cannot distinguish "I have not filled this in" from "this
    // gym owns no plates", and only one of those is ever true.
    expect(platesAt('imperial', kit({ plates: [] }), undefined).length).toBeGreaterThan(0);
  });

  it('sorts heaviest first, which the greedy loader depends on', () => {
    const p = platesAt('imperial', kit({ plates: [5, 45, 25] }));
    expect(p).toEqual([45, 25, 5]);
  });

  it('drops nonsense denominations', () => {
    expect(platesAt('metric', kit({ plates: [20, 0, -5, 10] }))).toEqual([20, 10]);
  });
});

describe('barsAt', () => {
  it('uses the gym bars when set, standard otherwise', () => {
    expect(barsAt('metric', kit({ bars: [20, 15] }))).toEqual([20, 15]);
    expect(barsAt('metric', kit())).toEqual([20, 15, 10, 7, 0]);
  });

  it('keeps a zero bar, which means a machine or a loading pin', () => {
    expect(barsAt('imperial', kit({ bars: [0, 45] }))).toEqual([45, 0]);
  });
});

describe('smallestJump', () => {
  it('is twice the lightest plate, because a bar loads both sides', () => {
    expect(smallestJump('metric', kit({ plates: [20, 10, 5, 1.25] }))).toBe(2.5);
    expect(smallestJump('imperial', kit({ plates: [45, 25, 10] }))).toBe(20);
  });

  it('decides whether "add a little next time" is advice or fantasy', () => {
    // A gym whose lightest plate is a 10 cannot make a 5 lb jump at all.
    const spartan = smallestJump('imperial', kit({ plates: [45, 25, 10] }));
    expect(spartan).toBeGreaterThan(5);
  });
});

describe('the calculator at a real gym', () => {
  it('reports the shortfall when the gym cannot make the number', () => {
    // 102.5 kg needs a 1.25 per side; this gym's lightest is a 5.
    const plates = platesAt('metric', kit({ plates: [25, 20, 15, 10, 5] }));
    const plan = planPlates(102.5, 20, 'metric', plates);
    expect(plan.achievable).toBe(100);
    expect(plan.delta).toBe(-2.5);
  });

  it('hits it exactly when the gym has the plate', () => {
    const plates = platesAt('metric', kit({ plates: [25, 20, 15, 10, 5, 2.5, 1.25] }));
    const plan = planPlates(102.5, 20, 'metric', plates);
    expect(plan.achievable).toBe(102.5);
    expect(plan.delta).toBe(0);
  });
});

describe('describeKit', () => {
  it('says standard when nothing is recorded', () => {
    expect(describeKit(undefined, 'metric')).toBe('Standard plates and bars');
    expect(describeKit(emptyKit('metric'), 'metric')).toBe('Standard plates and bars');
    expect(isStandardKit(emptyKit('imperial'))).toBe(true);
  });

  it('lists plates heaviest first, with the bar when there is one', () => {
    expect(describeKit(kit({ plates: [10, 45, 25], unit: 'imperial' }), 'imperial')).toBe('45 · 25 · 10 lb');
    expect(describeKit(kit({ plates: [20, 10], bars: [20], unit: 'metric' }), 'metric')).toBe(
      '20 · 10 kg · 20 kg bar',
    );
  });

  it('handles a gym where only the bar is unusual', () => {
    expect(describeKit(kit({ plates: [], bars: [15], unit: 'metric' }), 'metric')).toBe(
      'standard plates · 15 kg bar',
    );
  });
});

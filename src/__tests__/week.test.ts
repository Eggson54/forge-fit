import { daysStillAvailable, weekPace, type WeekDay } from '../domain/week';

const day = (date: string, o: Partial<WeekDay> = {}): WeekDay => ({
  date,
  trained: false,
  isToday: false,
  isFuture: false,
  ...o,
});

describe('daysStillAvailable', () => {
  it('counts today and the future, not the past', () => {
    const days = [
      day('2026-09-20', { trained: true }),
      day('2026-09-21'),
      day('2026-09-22', { isToday: true }),
      day('2026-09-23', { isFuture: true }),
      day('2026-09-24', { isFuture: true }),
    ];
    expect(daysStillAvailable(days)).toBe(3);
  });

  it('does not offer a day that has already been trained', () => {
    const days = [day('2026-09-22', { isToday: true, trained: true }), day('2026-09-23', { isFuture: true })];
    expect(daysStillAvailable(days)).toBe(1);
  });
});

describe('weekPace', () => {
  it('celebrates a finished week', () => {
    expect(weekPace(5, 5, 2)).toEqual({ text: "Week's work is done — 5 of 5.", tone: 'good' });
  });

  it('treats beating the target as finished, not as a fraction over one', () => {
    expect(weekPace(6, 5, 1).tone).toBe('good');
  });

  it('names the new ceiling once the target is out of reach', () => {
    const { text, tone } = weekPace(1, 5, 2);
    expect(tone).toBe('warn');
    expect(text).toContain('3 of 5 is the ceiling now');
  });

  it('says the week is over rather than naming an impossible ceiling', () => {
    expect(weekPace(2, 5, 0)).toEqual({ text: "Week's over. 2 of 5 logged.", tone: 'warn' });
  });

  it('warns when every remaining day has to be a training day', () => {
    const { text, tone } = weekPace(3, 5, 2);
    expect(tone).toBe('warn');
    expect(text).toContain('No slack');
  });

  it('is calm while there is slack left', () => {
    expect(weekPace(0, 5, 7)).toEqual({ text: '5 to go, 7 days to choose from.', tone: 'neutral' });
  });

  it('gets its singulars right on the last day', () => {
    expect(weekPace(4, 5, 1).text).toBe('1 left and 1 day to do it in. No slack.');
  });
});

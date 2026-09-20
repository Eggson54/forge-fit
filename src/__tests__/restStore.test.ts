import { useRestStore } from '../stores/useRestStore';

describe('rest timer store', () => {
  beforeEach(() => useRestStore.getState().dismiss());

  it('starts a rest that ends in the future', () => {
    const before = Date.now();
    useRestStore.getState().start(90, 'Set 1 · Bench');
    const s = useRestStore.getState();
    expect(s.totalSeconds).toBe(90);
    expect(s.label).toBe('Set 1 · Bench');
    expect(s.endsAt).not.toBeNull();
    expect(s.endsAt! - before).toBeGreaterThanOrEqual(89_000);
  });

  it('refuses a zero-length rest, which would render as a finished one', () => {
    useRestStore.getState().start(0, 'x');
    expect(useRestStore.getState().totalSeconds).toBe(1);
  });

  it('adjusts both the deadline and the denominator together', () => {
    useRestStore.getState().start(120, 'x');
    const first = useRestStore.getState().endsAt!;
    useRestStore.getState().adjust(15);
    expect(useRestStore.getState().endsAt).toBe(first + 15_000);
    expect(useRestStore.getState().totalSeconds).toBe(135);
  });

  it('never pushes the deadline into the past', () => {
    useRestStore.getState().start(10, 'x');
    useRestStore.getState().adjust(-60);
    expect(useRestStore.getState().endsAt!).toBeGreaterThan(Date.now());
    expect(useRestStore.getState().totalSeconds).toBeGreaterThanOrEqual(1);
  });

  it('ignores adjustments when nothing is running', () => {
    useRestStore.getState().adjust(15);
    expect(useRestStore.getState().endsAt).toBeNull();
  });

  it('clears the label on dismiss, so a stale set name cannot resurface', () => {
    useRestStore.getState().start(60, 'Set 3 · Squat');
    useRestStore.getState().dismiss();
    expect(useRestStore.getState()).toMatchObject({ endsAt: null, totalSeconds: 0, label: '' });
  });
});

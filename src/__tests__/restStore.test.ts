import { resetRestAlerts, setRestAlerts } from '../stores/restAlerts';
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

describe('rest timer alerts', () => {
  const scheduled: { seconds: number; label: string }[] = [];
  const cancelled: string[] = [];
  let nextId = 0;

  beforeEach(() => {
    scheduled.length = 0;
    cancelled.length = 0;
    nextId = 0;
    setRestAlerts({
      schedule: async (seconds, label) => {
        scheduled.push({ seconds, label });
        return `n${++nextId}`;
      },
      cancel: (id) => cancelled.push(id),
    });
    useRestStore.getState().dismiss();
    cancelled.length = 0;
  });

  afterAll(() => resetRestAlerts());

  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('queues an alert for the end of the rest', async () => {
    useRestStore.getState().start(90, 'Set 2 · Squat');
    await settle();
    expect(scheduled).toEqual([{ seconds: 90, label: 'Set 2 · Squat' }]);
    expect(useRestStore.getState().notificationId).toBe('n1');
  });

  it('cancels the queued alert when the rest is skipped', async () => {
    useRestStore.getState().start(90, 'x');
    await settle();
    useRestStore.getState().dismiss();
    expect(cancelled).toContain('n1');
    expect(useRestStore.getState().notificationId).toBeNull();
  });

  it('re-queues on an adjustment so the buzz follows the new deadline', async () => {
    useRestStore.getState().start(90, 'x');
    await settle();
    useRestStore.getState().adjust(15);
    await settle();
    expect(cancelled).toContain('n1');
    expect(scheduled).toHaveLength(2);
    expect(scheduled[1]!.seconds).toBeGreaterThan(100);
  });

  it('does not leave an orphan alert when a rest is restarted mid-flight', async () => {
    useRestStore.getState().start(90, 'first');
    useRestStore.getState().start(60, 'second');
    await settle();
    // The first schedule resolves after the second rest began; its alert points
    // at a deadline that no longer exists and must be cancelled, not stored.
    expect(useRestStore.getState().notificationId).not.toBe('n1');
    expect(cancelled).toContain('n1');
  });

  it('survives an adapter that refuses to schedule', async () => {
    setRestAlerts({ schedule: async () => null, cancel: () => {} });
    useRestStore.getState().start(60, 'x');
    await settle();
    expect(useRestStore.getState().endsAt).not.toBeNull();
    expect(useRestStore.getState().notificationId).toBeNull();
  });
});

import {
  EMPTY_SYNC,
  PROVIDER_LABEL,
  capabilityFor,
  classifyHttpFailure,
  describeStatus,
  isLive,
  mergeSync,
  producesData,
  sinceLabel,
  summariseSync,
  syncDue,
  tokenExpired,
  type ProviderStatus,
} from '../domain/integrations';

const NOW = new Date('2026-09-21T12:00:00.000Z');
const status = (over: Partial<ProviderStatus> = {}): ProviderStatus => ({
  id: 'strava',
  state: 'disconnected',
  ...over,
});

describe('capabilityFor', () => {
  const ios = { platform: 'ios' as const, hasNativeModule: true, backendConfigured: true };

  it('lets a fully-equipped iOS build connect everything', () => {
    for (const id of ['apple_health', 'apple_watch', 'strava'] as const) {
      expect(capabilityFor(id, ios).supported).toBe(true);
    }
  });

  it('names the development build as the missing piece, not just "unavailable"', () => {
    const cap = capabilityFor('apple_health', { ...ios, hasNativeModule: false });
    expect(cap.supported).toBe(false);
    expect(cap.reason).toMatch(/development build/i);
    expect(cap.reason).toMatch(/Expo Go/);
  });

  it('refuses Strava without a configured backend, and says why', () => {
    const cap = capabilityFor('strava', { ...ios, backendConfigured: false });
    expect(cap.supported).toBe(false);
    // The secret is the whole reason a server is involved.
    expect(cap.reason).toMatch(/secret/i);
  });

  it('does not offer Apple anything on Android or the web', () => {
    expect(capabilityFor('apple_watch', { ...ios, platform: 'android' }).supported).toBe(false);
    expect(capabilityFor('apple_health', { ...ios, platform: 'android' }).reason).toMatch(/Health Connect/);
    expect(capabilityFor('apple_health', { ...ios, platform: 'web' }).supported).toBe(false);
  });

  it('points Strava at the mobile app from the web', () => {
    expect(capabilityFor('strava', { ...ios, platform: 'web' }).reason).toMatch(/iOS or Android app/);
  });

  it('has a label for every provider it can describe', () => {
    for (const id of ['apple_health', 'apple_watch', 'strava'] as const) {
      expect(PROVIDER_LABEL[id]).toBeTruthy();
    }
  });
});

describe('what counts as connected', () => {
  it('does not call demo data a live connection', () => {
    expect(isLive(status({ state: 'demo' }))).toBe(false);
    expect(isLive(status({ state: 'connected' }))).toBe(true);
  });

  it('still lets a demo produce data, so the preview has something to show', () => {
    expect(producesData(status({ state: 'demo' }))).toBe(true);
    expect(producesData(status({ state: 'unavailable' }))).toBe(false);
    expect(producesData(status({ state: 'error' }))).toBe(false);
  });
});

describe('describeStatus', () => {
  it('names the account and when it last synced', () => {
    const line = describeStatus(
      status({ state: 'connected', account: 'Sam', lastSyncedAt: '2026-09-21T11:30:00.000Z' }),
      NOW,
    );
    expect(line).toBe('Connected as Sam · synced 30 minutes ago');
  });

  it('drops the sync clause when nothing has synced yet', () => {
    expect(describeStatus(status({ state: 'connected', account: 'Sam' }), NOW)).toBe('Connected as Sam');
  });

  it('shows the error rather than a generic failure', () => {
    expect(describeStatus(status({ state: 'error', error: 'Strava declined: access_denied.' }))).toBe(
      'Strava declined: access_denied.',
    );
  });

  it('keeps the unavailable line short, since the reason is shown beneath it', () => {
    const line = describeStatus(status({ state: 'unavailable', error: 'A long specific explanation.' }));
    expect(line).toBe('Not available on this build.');
    expect(line).not.toContain('long specific');
  });

  it('says out loud when it is showing sample data', () => {
    expect(describeStatus(status({ state: 'demo' }))).toMatch(/not your real numbers/);
  });
});

describe('sinceLabel', () => {
  it('reads like a person would say it', () => {
    expect(sinceLabel('2026-09-21T11:59:30.000Z', NOW)).toBe('just now');
    expect(sinceLabel('2026-09-21T11:30:00.000Z', NOW)).toBe('30 minutes ago');
    expect(sinceLabel('2026-09-21T09:00:00.000Z', NOW)).toBe('3 hours ago');
    expect(sinceLabel('2026-09-20T12:00:00.000Z', NOW)).toBe('yesterday');
    expect(sinceLabel('2026-09-17T12:00:00.000Z', NOW)).toBe('4 days ago');
  });

  it('says nothing rather than "NaN ago"', () => {
    expect(sinceLabel(null, NOW)).toBeNull();
    expect(sinceLabel('not a date', NOW)).toBeNull();
  });

  it('does not report a clock skew as a sync from the future', () => {
    expect(sinceLabel('2026-09-21T12:05:00.000Z', NOW)).toBe('just now');
  });
});

describe('syncDue', () => {
  it('is due when nothing has ever synced', () => {
    expect(syncDue(null, 30, NOW)).toBe(true);
    expect(syncDue('nonsense', 30, NOW)).toBe(true);
  });

  it('waits out the interval', () => {
    expect(syncDue('2026-09-21T11:50:00.000Z', 30, NOW)).toBe(false);
    expect(syncDue('2026-09-21T11:20:00.000Z', 30, NOW)).toBe(true);
  });
});

describe('summariseSync', () => {
  it('says nothing happened when nothing happened', () => {
    expect(summariseSync(EMPTY_SYNC)).toBe('Nothing new to bring in.');
  });

  it('counts what came in and what was already there', () => {
    expect(summariseSync({ imported: 3, skipped: 0, errors: [] })).toBe('Brought in 3 activities.');
    expect(summariseSync({ imported: 1, skipped: 2, errors: [] })).toBe(
      'Brought in 1 activity; 2 were already here.',
    );
    expect(summariseSync({ imported: 0, skipped: 4, errors: [] })).toBe(
      'Up to date — 4 activities were already here.',
    );
  });

  it('leads with the error when nothing came in', () => {
    expect(summariseSync({ imported: 0, skipped: 0, errors: ['Strava is rate-limiting.'] })).toBe(
      'Strava is rate-limiting.',
    );
  });

  it('does not bury a partial success behind an error', () => {
    expect(summariseSync({ imported: 2, skipped: 0, errors: ['page 3 failed'] })).toMatch(/Brought in 2/);
  });

  it('adds up across providers', () => {
    expect(mergeSync({ imported: 1, skipped: 1, errors: ['a'] }, { imported: 2, skipped: 0, errors: ['b'] })).toEqual({
      imported: 3,
      skipped: 1,
      errors: ['a', 'b'],
    });
  });
});

describe('classifyHttpFailure', () => {
  it('only disconnects on a real sign-out', () => {
    expect(classifyHttpFailure(401).disconnects).toBe(true);
    expect(classifyHttpFailure(403).disconnects).toBe(true);
  });

  it('does not make someone reconnect over a rate limit or an outage', () => {
    // Treating these as a sign-out is how apps nag people to reconnect an
    // account that was never disconnected.
    expect(classifyHttpFailure(429).disconnects).toBe(false);
    expect(classifyHttpFailure(429).retryable).toBe(true);
    expect(classifyHttpFailure(503).disconnects).toBe(false);
    expect(classifyHttpFailure(503).retryable).toBe(true);
  });

  it('reports an unexpected status with its code rather than swallowing it', () => {
    expect(classifyHttpFailure(418).message).toMatch(/418/);
    expect(classifyHttpFailure(418).retryable).toBe(false);
  });
});

describe('tokenExpired', () => {
  const now = new Date('2026-09-21T12:00:00.000Z');
  const epoch = Math.floor(now.getTime() / 1000);

  it('refreshes before the token actually dies, not after', () => {
    // A token valid for another minute will not survive the round trip.
    expect(tokenExpired(epoch + 60, now)).toBe(true);
    expect(tokenExpired(epoch + 600, now)).toBe(false);
  });

  it('treats a missing expiry as expired', () => {
    expect(tokenExpired(null, now)).toBe(true);
    expect(tokenExpired(undefined, now)).toBe(true);
    expect(tokenExpired(0, now)).toBe(true);
  });
});

import { EMPTY_CALLBACK_MESSAGE, readOAuthCallback } from '../domain/oauthCallback';

const REDIRECT = 'forgefit://auth-callback';

describe('readOAuthCallback', () => {
  it('reads the PKCE code out of the query string', () => {
    expect(readOAuthCallback(`${REDIRECT}?code=abc123`)).toEqual({ kind: 'code', code: 'abc123' });
  });

  it('reads an implicit session out of the fragment', () => {
    // This is the case that made Google sign-in impossible: supabase-js
    // defaults to the implicit flow, the session comes back in the fragment,
    // and a handler looking only for ?code= found nothing and reported
    // failure every single time.
    const url = `${REDIRECT}#access_token=at-1&refresh_token=rt-1&expires_in=3600&token_type=bearer`;
    expect(readOAuthCallback(url)).toEqual({
      kind: 'session',
      accessToken: 'at-1',
      refreshToken: 'rt-1',
    });
  });

  it('prefers the code when a redirect somehow carries both', () => {
    const url = `${REDIRECT}?code=abc#access_token=at&refresh_token=rt`;
    expect(readOAuthCallback(url)).toEqual({ kind: 'code', code: 'abc' });
  });

  it('does not mistake half a session for a session', () => {
    expect(readOAuthCallback(`${REDIRECT}#access_token=at-only`).kind).toBe('empty');
    expect(readOAuthCallback(`${REDIRECT}#refresh_token=rt-only`).kind).toBe('empty');
  });

  it('surfaces a refusal from the query string', () => {
    const r = readOAuthCallback(`${REDIRECT}?error=access_denied&error_description=User+said+no`);
    expect(r).toEqual({ kind: 'denied', reason: 'User said no' });
  });

  it('surfaces a refusal from the fragment', () => {
    const r = readOAuthCallback(`${REDIRECT}#error=access_denied&error_description=Nope`);
    expect(r).toEqual({ kind: 'denied', reason: 'Nope' });
  });

  it('falls back to the bare error code when there is no description', () => {
    expect(readOAuthCallback(`${REDIRECT}?error=server_error`)).toEqual({
      kind: 'denied',
      reason: 'server_error',
    });
  });

  it('decodes percent-encoding and plus-for-space', () => {
    const r = readOAuthCallback(`${REDIRECT}?error_description=Token%20expired+already`);
    expect(r).toEqual({ kind: 'denied', reason: 'Token expired already' });
  });

  it('does not throw on a percent sign that is not an escape', () => {
    const r = readOAuthCallback(`${REDIRECT}?error_description=100%25+failed`);
    expect(r.kind).toBe('denied');
  });

  it('calls a bare redirect empty rather than throwing', () => {
    expect(readOAuthCallback(REDIRECT).kind).toBe('empty');
    expect(readOAuthCallback('').kind).toBe('empty');
    expect(readOAuthCallback('not a url at all').kind).toBe('empty');
  });

  it('has a message that says where to look, not just that it failed', () => {
    expect(EMPTY_CALLBACK_MESSAGE).toMatch(/redirect URL/i);
    expect(EMPTY_CALLBACK_MESSAGE).toMatch(/Supabase/);
  });
});

/**
 * Reading a session out of an OAuth redirect.
 *
 * Pulled out of the auth service so it can be tested without a Supabase
 * client, a browser or a device — the failure that made Google sign-in
 * impossible lived entirely in this parsing, and it was invisible because
 * nothing could exercise it.
 */

export type CallbackResult =
  /** PKCE: exchange this for a session. */
  | { kind: 'code'; code: string }
  /** Implicit: set the session from these directly. */
  | { kind: 'session'; accessToken: string; refreshToken: string }
  /** The provider said no, and said why. */
  | { kind: 'denied'; reason: string }
  /** Nothing usable came back. */
  | { kind: 'empty' };

/**
 * Both flows, because which one arrives depends on the Supabase project's
 * setting rather than on anything the app controls. PKCE puts a code in the
 * query string; the implicit flow puts the whole session in the fragment —
 * and a fragment never reaches `exchangeCodeForSession`.
 */
export function readOAuthCallback(callbackUrl: string): CallbackResult {
  let url: URL;
  try {
    url = new URL(callbackUrl);
  } catch {
    return { kind: 'empty' };
  }

  const code = url.searchParams.get('code');
  if (code) return { kind: 'code', code };

  const queryError = url.searchParams.get('error_description') ?? url.searchParams.get('error');
  if (queryError) return { kind: 'denied', reason: decode(queryError) };

  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
  const accessToken = fragment.get('access_token');
  const refreshToken = fragment.get('refresh_token');
  if (accessToken && refreshToken) return { kind: 'session', accessToken, refreshToken };

  const fragmentError = fragment.get('error_description') ?? fragment.get('error');
  if (fragmentError) return { kind: 'denied', reason: decode(fragmentError) };

  return { kind: 'empty' };
}

function decode(value: string): string {
  try {
    // Providers send these percent-encoded and with + for spaces.
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

export const EMPTY_CALLBACK_MESSAGE =
  'The sign-in redirect carried neither a code nor a session. Check that this app’s redirect URL is listed in your Supabase auth settings.';

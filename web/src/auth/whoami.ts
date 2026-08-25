// Pre-flight access verification against the agent backend's
// `/api/agent/whoami` endpoint.
//
// Why: the login screen → chat transition can't be purely client-side.
// Google sign-in only proves the user has a Google account — it does
// NOT prove they're on our allowlist. We must ask our backend before
// mounting the chat tree. If the backend is unreachable (cold start,
// network blip, outage) we fail closed to a RETRYABLE state — NOT to
// "signed out" — to avoid creating a sign-in loop the user can't
// escape.
//
// Retry policy:
//   - Up to 3 attempts total.
//   - Exponential backoff: 300 ms → 900 ms → 1800 ms.
//   - AbortController timeout per attempt: 8 s.
//   - Retry only TRANSIENT failures: network errors, timeouts, 408,
//     429, and 5xx.
//   - NEVER retry 401 — that's a definitive rejection.
//
// Output: a discriminated union the caller pattern-matches on.

export type VerifyAccessOk = {
  status: 'ok';
  mode: 'authenticated' | 'bypassed';
  email?: string;
  name?: string;
  lang?: 'en' | 'he';
};

export type VerifyAccessForbidden = {
  status: 'forbidden';
  reason: string;
  email?: string;
};

export type VerifyAccessUnavailableCause =
  | 'network'
  | 'timeout'
  | 'http_5xx'
  | 'http_429'
  | 'http_408';

export type VerifyAccessUnavailable = {
  status: 'unavailable';
  cause: VerifyAccessUnavailableCause;
  httpStatus?: number;
};

export type VerifyAccessResult =
  | VerifyAccessOk
  | VerifyAccessForbidden
  | VerifyAccessUnavailable;

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [300, 900, 1800];
const ATTEMPT_TIMEOUT_MS = 8000;

function whoamiUrl(runtimeUrl: string): string {
  // Replace the final path segment so
  // `https://host/api/agent/copilotkit` → `https://host/api/agent/whoami`.
  // We do this with URL semantics rather than string concat so that an
  // unexpected trailing slash / query string in RUNTIME_URL doesn't
  // produce a broken target like `/api/agent/copilotkit/whoami`.
  try {
    const parsed = new URL(runtimeUrl, 'http://placeholder.invalid');
    const segments = parsed.pathname.split('/');
    if (segments.length === 0 || segments[segments.length - 1] === '') {
      segments.push('whoami');
    } else {
      segments[segments.length - 1] = 'whoami';
    }
    parsed.pathname = segments.join('/');
    parsed.search = '';
    parsed.hash = '';
    return parsed.host === 'placeholder.invalid'
      ? parsed.pathname
      : parsed.toString();
  } catch {
    return runtimeUrl.replace(/[^/]*$/, 'whoami');
  }
}

function classifyTransient(status: number):
  | 'http_5xx'
  | 'http_429'
  | 'http_408'
  | null {
  if (status === 408) return 'http_408';
  if (status === 429) return 'http_429';
  if (status >= 500 && status < 600) return 'http_5xx';
  return null;
}

async function attemptVerifyAccess(
  idToken: string | null,
  url: string,
  signal: AbortSignal,
): Promise<VerifyAccessResult | { retry: VerifyAccessUnavailableCause }> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;

  let response: Response;
  try {
    response = await fetch(url, { method: 'GET', headers, signal });
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      return { retry: 'timeout' };
    }
    return { retry: 'network' };
  }

  if (response.status === 401) {
    // Definitive rejection — do NOT retry.
    let body: { reason?: string; email?: string } = {};
    try {
      body = await response.json();
    } catch {
      // Non-JSON body — fall through with empty fields.
    }
    return {
      status: 'forbidden',
      reason: body.reason || 'unauthorized',
      email: body.email,
    };
  }

  if (response.ok) {
    let body: {
      status?: string;
      mode?: 'authenticated' | 'bypassed';
      email?: string;
      name?: string;
      lang?: 'en' | 'he';
    } = {};
    try {
      body = await response.json();
    } catch {
      // Unexpected: 200 but non-JSON. Treat as transient.
      return { retry: 'http_5xx' };
    }
    if (body.status === 'ok' && (body.mode === 'authenticated' || body.mode === 'bypassed')) {
      const result: VerifyAccessOk = {
        status: 'ok',
        mode: body.mode,
        lang: body.lang === 'he' ? 'he' : 'en',
      };
      if (body.email) result.email = body.email;
      if (body.name) result.name = body.name;
      return result;
    }
    return { retry: 'http_5xx' };
  }

  const transient = classifyTransient(response.status);
  if (transient) {
    return { retry: transient };
  }

  // Some other 4xx (other than 401 which we handled above). Treat as
  // "unavailable" to avoid signing the user out for a misconfigured
  // server — but DO NOT retry.
  return {
    status: 'unavailable',
    cause: 'http_5xx',
    httpStatus: response.status,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Probe the backend's /whoami endpoint, retrying transient failures
 * with exponential backoff. Always resolves — never throws — so the
 * caller can pattern-match on the result.
 */
export async function verifyAccess(
  idToken: string | null,
  runtimeUrl: string,
): Promise<VerifyAccessResult> {
  const url = whoamiUrl(runtimeUrl);
  let lastCause: VerifyAccessUnavailableCause = 'network';

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
    try {
      const result = await attemptVerifyAccess(idToken, url, controller.signal);
      if ('status' in result) {
        return result;
      }
      lastCause = result.retry;
    } finally {
      clearTimeout(timer);
    }

    const isLast = attempt === MAX_ATTEMPTS - 1;
    if (isLast) break;
    await sleep(BACKOFF_MS[attempt]);
  }

  return {
    status: 'unavailable',
    cause: lastCause,
  };
}

export const __testing = { whoamiUrl, BACKOFF_MS, ATTEMPT_TIMEOUT_MS, MAX_ATTEMPTS };

// Global fetch interceptor that detects 401s from the agent webhook
// and bounces the user back to the login screen.
//
// Why a fetch override (vs CopilotKit's onError):
// - CopilotKit surfaces its own error codes (AGENT_CONNECT_FAILED, etc.)
//   that don't expose the underlying HTTP status cleanly. We need the
//   raw 401 + the JSON body so we can show the user "your email is not
//   allowlisted" vs "session expired".
// - The override is scoped to URLs that start with the agent runtime
//   URL — every other fetch on the page passes through untouched.
// - We only install the override ONCE; multiple <AuthBoundary>
//   re-renders are a no-op.
//
// On 401:
//   - parses the JSON body to read the server's `reason` and `email`,
//   - sets the AuthContext rejection (so the login screen can render
//     a meaningful error),
//   - calls signOut() so the gated chat UI immediately unmounts.

import { useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';

type AuthErrorBody = {
  error?: string;
  reason?: string;
  email?: string;
};

function isAgentResponse(input: RequestInfo | URL, runtimeUrl: string): boolean {
  try {
    const requestUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (!requestUrl) return false;
    return requestUrl.startsWith(runtimeUrl);
  } catch {
    return false;
  }
}

export function useAuthFetchInterceptor(runtimeUrl: string): void {
  const { signOut, setRejection } = useAuth();
  const installedRef = useRef(false);

  useEffect(() => {
    if (installedRef.current) return;
    installedRef.current = true;

    const original = window.fetch.bind(window);

    async function wrapped(
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      const response = await original(input, init);

      if (response.status === 401 && isAgentResponse(input, runtimeUrl)) {
        // Clone before reading so the consumer can still consume the body.
        let body: AuthErrorBody = {};
        try {
          body = (await response.clone().json()) as AuthErrorBody;
        } catch {
          // Non-JSON body — fall through with empty fields.
        }
        setRejection({
          reason: body.reason || 'unauthorized',
          email: body.email,
        });
        signOut();
      }

      return response;
    }

    (window as unknown as { fetch: typeof window.fetch }).fetch = wrapped;

    return () => {
      (window as unknown as { fetch: typeof window.fetch }).fetch = original;
      installedRef.current = false;
    };
  }, [runtimeUrl, signOut, setRejection]);
}

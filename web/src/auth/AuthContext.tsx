// Google sign-in state for the F1 Fantasy web-chat agent.
//
// Holds the ID token returned by Google Identity Services (via
// @react-oauth/google's <GoogleLogin /> button) plus the decoded
// `email`, `name`, `picture`, and `sub` claims for UI display. The
// token is cached in `sessionStorage` (NOT `localStorage`) so closing
// the tab logs the user out — a low-cost mitigation for shared
// browsers.
//
// The token is read by `<CopilotKit>` via a custom transport that
// adds `Authorization: Bearer ${idToken}` to every backend request.
// The backend verifies the token + allowlists the email on EVERY
// request; the frontend treats the token as opaque (we only decode
// it for display) and bounces to the login screen on any 401.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'f1-fantasy-agent-id-token';

type IdTokenClaims = {
  email: string;
  name?: string;
  picture?: string;
  sub: string;
  exp: number;
};

type AuthSession = {
  idToken: string;
  claims: IdTokenClaims;
};

type AuthContextValue = {
  session: AuthSession | null;
  signIn: (idToken: string) => void;
  signOut: () => void;
  rejection: { reason: string; email?: string } | null;
  setRejection: (rejection: { reason: string; email?: string } | null) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Minimal JWT payload decoder. We do NOT verify the signature here —
// the backend does that. Decoding is only for UI display (email,
// name, etc.) and for scoping localStorage keys by `sub`. If the
// token is malformed we treat it as "not signed in".
//
// `atob` is a browser builtin in every environment Vite targets, so
// no Node `Buffer` fallback is needed.
function base64UrlDecode(input: string): string {
  const padding = '='.repeat((4 - (input.length % 4)) % 4);
  const base64 = (input + padding).replace(/-/g, '+').replace(/_/g, '/');
  return atob(base64);
}

export function decodeIdTokenClaims(token: string): IdTokenClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    if (typeof payload.email !== 'string') return null;
    if (typeof payload.sub !== 'string') return null;
    return {
      email: payload.email,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      picture:
        typeof payload.picture === 'string' ? payload.picture : undefined,
      sub: payload.sub,
      exp: typeof payload.exp === 'number' ? payload.exp : 0,
    };
  } catch {
    return null;
  }
}

function readStoredToken(): AuthSession | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const claims = decodeIdTokenClaims(raw);
    if (!claims) return null;
    if (claims.exp && claims.exp * 1000 <= Date.now()) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return { idToken: raw, claims };
  } catch {
    return null;
  }
}

function persistToken(token: string | null) {
  try {
    if (token === null) {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(STORAGE_KEY, token);
    }
  } catch {
    // sessionStorage may be unavailable (private mode); ignore.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() =>
    readStoredToken(),
  );
  const [rejection, setRejection] = useState<
    { reason: string; email?: string } | null
  >(null);

  const signIn = useCallback((idToken: string) => {
    const claims = decodeIdTokenClaims(idToken);
    if (!claims) {
      setRejection({ reason: 'invalid_token' });
      return;
    }
    persistToken(idToken);
    setSession({ idToken, claims });
    setRejection(null);
  }, []);

  const signOut = useCallback(() => {
    persistToken(null);
    setSession(null);
  }, []);

  useEffect(() => {
    if (!session) return;
    const expMs = session.claims.exp * 1000;
    const delay = expMs - Date.now();
    if (delay <= 0) {
      signOut();
      setRejection({ reason: 'session_expired' });
      return;
    }
    const timer = window.setTimeout(() => {
      signOut();
      setRejection({ reason: 'session_expired' });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [session, signOut]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, signIn, signOut, rejection, setRejection }),
    [session, signIn, signOut, rejection],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}

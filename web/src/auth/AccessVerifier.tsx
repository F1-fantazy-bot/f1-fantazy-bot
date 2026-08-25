// Gate the chat tree on a successful pre-flight against the backend's
// /api/agent/whoami endpoint. Mounted INSIDE <AuthProvider>.
//
// State machine:
//   verifying    → render <Spinner> ; chat tree NOT mounted
//   ok           → render children (chat tree)
//   forbidden    → signOut() + setRejection() ; parent renders LoginScreen
//   unavailable  → render "Agent unavailable" retry card ; session preserved
//
// Failing closed to "unavailable" rather than "signed out" is the key
// rule: if the user can't reach the backend, they MUST NOT see the
// chat, but they also MUSTN'T be bounced into a sign-in loop on a
// cold-start blip.

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { verifyAccess, type VerifyAccessOk } from './whoami';
import { UiLanguageProvider, type UiLanguage } from '../components/uiLanguage';

type VerifyState =
  | { kind: 'verifying' }
  | { kind: 'ok'; mode: VerifyAccessOk['mode']; lang: UiLanguage }
  | { kind: 'unavailable'; cause: string };

export function AccessVerifier({
  runtimeUrl,
  children,
}: {
  runtimeUrl: string;
  children: ReactNode;
}) {
  const { session, signOut, setRejection } = useAuth();
  const [state, setState] = useState<VerifyState>({ kind: 'verifying' });
  const [retryToken, setRetryToken] = useState(0);

  const idToken = session?.idToken ?? null;

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'verifying' });

    verifyAccess(idToken, runtimeUrl).then((result) => {
      if (cancelled) return;

      if (result.status === 'ok') {
        setState({
          kind: 'ok',
          mode: result.mode,
          lang: result.lang === 'he' ? 'he' : 'en',
        });
        return;
      }

      if (result.status === 'forbidden') {
        // 401 from the backend → definitive rejection.
        setRejection({ reason: result.reason, email: result.email });
        signOut({ disableGoogleAutoSelect: true });
        // The parent will re-render with no session → LoginScreen.
        return;
      }

      // status === 'unavailable' → keep session, show retry UI.
      setState({ kind: 'unavailable', cause: result.cause });
    });

    return () => {
      cancelled = true;
    };
  }, [idToken, runtimeUrl, retryToken, signOut, setRejection]);

  const onRetry = useCallback(() => {
    setRetryToken((n) => n + 1);
  }, []);

  if (state.kind === 'verifying') {
    return <VerifyingSpinner />;
  }

  if (state.kind === 'unavailable') {
    return <UnavailableCard cause={state.cause} onRetry={onRetry} />;
  }

  return (
    <UiLanguageProvider initialLanguage={state.lang}>
      {children}
    </UiLanguageProvider>
  );
}

function VerifyingSpinner() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: 16,
        color: 'var(--app-muted)',
        fontSize: 14,
      }}
    >
      <div
        aria-hidden
        style={{
          width: 36,
          height: 36,
          border: '3px solid var(--app-control-border)',
          borderTopColor: 'var(--app-control-text)',
          borderRadius: '50%',
          animation: 'f1-spin 0.8s linear infinite',
        }}
      />
      <span>Verifying access…</span>
      <style>{`@keyframes f1-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function UnavailableCard({
  cause,
  onRetry,
}: {
  cause: string;
  onRetry: () => void;
}) {
  const message = useMemo(() => describeCause(cause), [cause]);

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: 16,
        padding: '32px 16px',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700 }}>
          🏎️ Agent unavailable
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: 'var(--app-muted)',
            lineHeight: 1.45,
          }}
        >
          {message}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: '10px 18px',
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--app-primary-contrast)',
          background: 'var(--app-primary)',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
        }}
      >
        Retry
      </button>
    </div>
  );
}

function describeCause(cause: string): string {
  switch (cause) {
    case 'network':
      return "We couldn't reach the F1 Fantasy Agent. Check your connection and retry.";
    case 'timeout':
      return 'The F1 Fantasy Agent took too long to respond. This often happens on a cold start — retry in a moment.';
    case 'http_429':
      return 'The F1 Fantasy Agent is rate-limited right now. Please retry in a moment.';
    case 'http_408':
      return 'The F1 Fantasy Agent timed out the request. Please retry.';
    case 'http_5xx':
    default:
      return 'The F1 Fantasy Agent returned a server error. Please retry; if it persists, contact the admin on Telegram.';
  }
}

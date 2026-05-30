// Login screen shown to anonymous visitors.
//
// Renders just a Google sign-in button + a one-line headline + an
// optional banner explaining why the previous sign-in attempt was
// rejected. NO chat UI is mounted until the user has a valid token.

import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../auth/AuthContext';

const REJECTION_MESSAGES: Record<string, string> = {
  email_not_allowlisted:
    'This Google account is not allowed on the F1 Fantasy Agent. Please contact the admin via Telegram if you believe this is a mistake.',
  invalid_token:
    'Your sign-in token could not be verified. Please sign in again.',
  session_expired: 'Your session has expired. Please sign in again.',
  unauthorized: 'Sign-in is required to use the F1 Fantasy Agent.',
  allowlist_lookup_failed:
    'A temporary problem prevented us from verifying your access. Please try again in a moment.',
};

function formatRejection(rejection: {
  reason: string;
  email?: string;
}): string {
  const base =
    REJECTION_MESSAGES[rejection.reason] ?? REJECTION_MESSAGES.unauthorized;
  if (rejection.email && rejection.reason === 'email_not_allowlisted') {
    return `${rejection.email}: ${base}`;
  }
  return base;
}

export function LoginScreen() {
  const { signIn, rejection, setRejection } = useAuth();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: 24,
        padding: '32px 16px',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <h1
          style={{
            margin: '0 0 12px',
            fontSize: 28,
            fontWeight: 700,
            color: '#1a1a1a',
          }}
        >
          🏎️ F1 Fantasy Agent
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: 15,
            color: '#444',
            lineHeight: 1.45,
          }}
        >
          Sign in with Google to chat with the agent. Access is invitation
          only — ask the admin on Telegram if you'd like to be allowlisted.
        </p>
      </div>

      {rejection ? (
        <div
          role="alert"
          style={{
            maxWidth: 420,
            padding: '12px 16px',
            background: '#fff4f4',
            border: '1px solid #f5c2c2',
            borderRadius: 8,
            color: '#7a1f1f',
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          {formatRejection(rejection)}
        </div>
      ) : null}

      <div
        style={{
          padding: 24,
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <GoogleLogin
          onSuccess={(credentialResponse) => {
            if (credentialResponse.credential) {
              signIn(credentialResponse.credential);
            } else {
              setRejection({ reason: 'invalid_token' });
            }
          }}
          onError={() => {
            setRejection({ reason: 'invalid_token' });
          }}
          theme="filled_blue"
          size="large"
          shape="rectangular"
          useOneTap
          auto_select
        />
      </div>
    </div>
  );
}

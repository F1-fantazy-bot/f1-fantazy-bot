// Signed-in indicator + Sign out button.
//
// Renders next to <ClearHistoryButton /> in the header. Shows the
// user's name (falling back to email) plus a small avatar from the
// Google profile picture if available. The sign-out button clears
// both the auth session AND the chat history — shared-browser users
// should never see each other's conversation.

import { useAuth } from '../auth/AuthContext';
import { clear as clearChatHistory } from '../lib/chatHistoryStore';

export function SignedInBadge() {
  const { session, signOut } = useAuth();

  if (!session) return null;
  const { claims } = session;
  const display = claims.name || claims.email;

  const onSignOut = () => {
    // Wipe local history so a different user signing in on the
    // same browser doesn't see the previous conversation.
    clearChatHistory();
    signOut({ disableGoogleAutoSelect: true });
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontSize: 13,
        color: 'var(--app-control-text)',
      }}
    >
      {claims.picture ? (
        <img
          src={claims.picture}
          alt=""
          width={28}
          height={28}
          referrerPolicy="no-referrer"
          style={{ borderRadius: '50%' }}
        />
      ) : null}
      <span title={claims.email}>{display}</span>
      <button
        type="button"
        onClick={onSignOut}
        style={{
          padding: '6px 10px',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--app-control-text)',
          background: 'var(--app-control-bg)',
          border: '1px solid var(--app-control-border)',
          borderRadius: 6,
          cursor: 'pointer',
        }}
        aria-label="Sign out"
      >
        Sign out
      </button>
    </div>
  );
}

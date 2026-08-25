import { useState } from 'react';
import { useCopilotChat } from '@copilotkit/react-core';
import { Role, TextMessage } from '@copilotkit/runtime-client-gql';
import { useWriteDecision } from './WriteDecisionContext';

// Result envelope the backend returns from a write-tool *propose* call.
// Lives here (rather than in writeToolHelpers) to keep the frontend
// type surface explicit.
export type WriteConfirmationRequired = {
  status: 'confirmation_required';
  tool: string;
  writeNonce: string;
  summary: string;
  uiLang?: string;
  args?: Record<string, unknown>;
};

export function isConfirmationRequired(
  value: unknown,
): value is WriteConfirmationRequired {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.status === 'confirmation_required' &&
    typeof v.tool === 'string' &&
    typeof v.writeNonce === 'string' &&
    typeof v.summary === 'string'
  );
}

// Card rendered immediately after a write-tool propose call returns.
// The card prompts the user with a Yes / No choice. The click is first
// recorded through the authenticated `/write-decision` endpoint, which the
// model cannot call. Only after the server marks the intent approved do we
// append a message containing the nonce for `confirm_write`. Cancel deletes
// the intent server-side immediately.
export function WriteConfirmCard({
  result,
}: {
  result: WriteConfirmationRequired;
}) {
  const { appendMessage } = useCopilotChat();
  const { decide } = useWriteDecision();
  const isHebrew = result.uiLang === 'he';
  const labels = isHebrew
    ? {
        title: 'אישור שינוי',
        yes: 'כן, בצע',
        confirmed: 'אושר…',
        submitting: 'שומר החלטה…',
        cancel: 'ביטול',
        cancelled: 'בוטל',
        details: 'מה יקרה',
        detailsBody: (
          <>
            לחיצה על כן שומרת אישור מאומת לפני שהסוכן יכול לקרוא ל־
            <code>confirm_write</code>. ביטול מוחק מיד את האסימון החד־פעמי
            מבלי לבצע את השינוי.
          </>
        ),
        approveMessage: `כן — אישרתי את השינוי. השתמש ב-writeNonce ${result.writeNonce} עם confirm_write.`,
        cancelMessage: 'לא — ביטלתי את השינוי.',
        approveError: 'לא ניתן לאשר את השינוי. נסה שוב.',
        cancelError: 'לא ניתן לבטל את השינוי. נסה שוב.',
      }
    : {
        title: 'Confirm change',
        yes: 'Yes, do it',
        confirmed: 'Confirmed…',
        submitting: 'Saving decision…',
        cancel: 'Cancel',
        cancelled: 'Cancelled',
        details: 'What will happen',
        detailsBody: (
          <>
            Yes records an authenticated approval before the agent can call{' '}
            <code>confirm_write</code>. Cancel deletes the one-time token
            immediately without performing the change.
          </>
        ),
        approveMessage: `Yes — I approved this change. Use writeNonce ${result.writeNonce} with confirm_write.`,
        cancelMessage: 'No — I cancelled that change.',
        approveError: 'Unable to approve this change. Please try again.',
        cancelError: 'Unable to cancel this change. Please try again.',
      };
  const [decision, setDecision] = useState<
    'pending' | 'submitting' | 'confirmed' | 'cancelled' | 'error'
  >('pending');
  const [errorMessage, setErrorMessage] = useState('');

  async function send(content: string) {
    await appendMessage(
      new TextMessage({ role: Role.User, content }),
    );
  }

  async function onConfirm() {
    if (decision !== 'pending' && decision !== 'error') return;
    setDecision('submitting');
    setErrorMessage('');
    try {
      await decide(result.writeNonce, 'approve');
      await send(labels.approveMessage);
      setDecision('confirmed');
    } catch (err) {
      setErrorMessage(
        !isHebrew && err instanceof Error
          ? err.message
          : labels.approveError,
      );
      setDecision('error');
    }
  }

  async function onCancel() {
    if (decision !== 'pending' && decision !== 'error') return;
    setDecision('submitting');
    setErrorMessage('');
    try {
      await decide(result.writeNonce, 'cancel');
      await send(labels.cancelMessage);
      setDecision('cancelled');
    } catch (err) {
      setErrorMessage(
        !isHebrew && err instanceof Error
          ? err.message
          : labels.cancelError,
      );
      setDecision('error');
    }
  }

  const disabled =
    decision === 'submitting' ||
    decision === 'confirmed' ||
    decision === 'cancelled';

  return (
    <div
      role="dialog"
      aria-label={`${labels.title}: ${result.tool}`}
      dir={isHebrew ? 'rtl' : 'ltr'}
      style={{
        padding: '12px 14px',
        background: '#f0f6ff',
        border: '1px solid #c4d9f5',
        borderRadius: 8,
        color: '#1f3a66',
        margin: '6px 0',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        ❓ {labels.title}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.4, marginBottom: 10 }}>
        {result.summary}
      </div>
      {errorMessage ? (
        <div
          role="alert"
          style={{ color: '#8a1f1f', fontSize: 12, marginBottom: 8 }}
        >
          {errorMessage}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onConfirm}
          disabled={disabled}
          style={{
            background: decision === 'confirmed' ? '#3d6b32' : '#2f6f3a',
            color: '#fff',
            border: 0,
            padding: '6px 14px',
            borderRadius: 6,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled && decision !== 'confirmed' ? 0.6 : 1,
            fontWeight: 600,
          }}
        >
          {decision === 'confirmed'
            ? labels.confirmed
            : decision === 'submitting'
              ? labels.submitting
              : labels.yes}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          style={{
            background: '#fff',
            color: '#1f3a66',
            border: '1px solid #c4d9f5',
            padding: '6px 14px',
            borderRadius: 6,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled && decision !== 'cancelled' ? 0.6 : 1,
            fontWeight: 600,
          }}
        >
          {decision === 'cancelled' ? labels.cancelled : labels.cancel}
        </button>
      </div>
      <details style={{ marginTop: 8, fontSize: 11, opacity: 0.7 }}>
        <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
          {labels.details}
        </summary>
        <div style={{ marginTop: 4 }}>{labels.detailsBody}</div>
      </details>
    </div>
  );
}

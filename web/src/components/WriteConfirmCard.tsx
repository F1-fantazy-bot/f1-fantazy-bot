import { useState } from 'react';
import { useAgent, useCopilotKit } from '@copilotkit/react-core/v2';
import { useWriteDecision } from './WriteDecisionContext';
import { isWriteResult, type WriteResult } from './WriteResultCard';

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
  directConfirm = false,
  directConfirmErrorMessage,
  onSettled,
}: {
  result: WriteConfirmationRequired;
  directConfirm?: boolean;
  directConfirmErrorMessage?: string;
  onSettled?: (
    outcome: 'confirmed' | 'cancelled' | 'error',
    message?: string,
    finalResult?: WriteResult,
  ) => void;
}) {
  const { agent } = useAgent({ agentId: 'default' });
  const { copilotkit } = useCopilotKit();
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
        approvalRecoveryError:
          'האישור נשמר, אך לא ניתן היה להשלים או לבטל את השינוי. נסה שוב לפני בחירת שינוי אחר.',
        directConfirmError:
          'לא ניתן לאמת אם השינוי הושלם. רענן את רשימת הקבוצות לפני ניסיון נוסף.',
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
        approvalRecoveryError:
          'Approval was saved, but the change could not be completed or revoked. Retry before selecting another change.',
        directConfirmError:
          'The final status could not be verified. Refresh the team list before trying again.',
      };
  const [decision, setDecision] = useState<
    | 'pending'
    | 'submitting'
    | 'confirmed'
    | 'cancelled'
    | 'error'
    | 'blocked'
    | 'revoked'
  >('pending');
  const [errorMessage, setErrorMessage] = useState('');

  async function send(
    content: string,
    role: 'user' | 'developer' = 'user',
  ) {
    agent.addMessage({
      id: crypto.randomUUID(),
      role,
      content,
    });
    // Use the coordinated CopilotKit runner with the SAME agent that received
    // the message. It detaches any still-active proposal run before starting
    // the confirmation turn, avoiding overlap and provisional-agent mismatch.
    await copilotkit.runAgent({ agent });
  }

  async function onConfirm() {
    if (decision !== 'pending' && decision !== 'error') return;
    setDecision('submitting');
    setErrorMessage('');
    let approved = false;
    try {
      if (directConfirm) {
        const finalResult = await decide(
          result.writeNonce,
          'approve_and_confirm',
        );
        if (!isWriteResult(finalResult)) {
          throw new Error('Direct confirmation returned no final result');
        }
        setDecision('confirmed');
        onSettled?.('confirmed', undefined, finalResult);

        return;
      }

      await decide(result.writeNonce, 'approve');
      approved = true;
      // The nonce is control-plane data for the model, not user-facing chat
      // content. CopilotKit passes developer messages to the agent but its
      // chat renderer intentionally renders only user/assistant roles.
      await send(labels.approveMessage, 'developer');
      setDecision('confirmed');
      onSettled?.('confirmed');
    } catch (err) {
      if (directConfirm) {
        setErrorMessage(
          directConfirmErrorMessage || labels.directConfirmError,
        );
        setDecision('blocked');

        return;
      }
      if (approved) {
        try {
          // `send()` adds the developer nonce before running the agent. If
          // that run fails, delete the approved row before the parent may
          // unlock another proposal; any queued stale message is then inert.
          await decide(result.writeNonce, 'revoke');
        } catch {
          setErrorMessage(labels.approvalRecoveryError);
          setDecision('blocked');

          return;
        }
        const message =
          !isHebrew && err instanceof Error
            ? err.message
            : labels.approveError;
        setErrorMessage(message);
        setDecision('revoked');
        onSettled?.('error', message);

        return;
      }
      const message =
        !isHebrew && err instanceof Error
          ? err.message
          : labels.approveError;
      setErrorMessage(message);
      setDecision('error');
      onSettled?.('error', message);
    }
  }

  async function onCancel() {
    if (decision !== 'pending' && decision !== 'error') return;
    setDecision('submitting');
    setErrorMessage('');
    try {
      await decide(result.writeNonce, 'cancel');
      if (!directConfirm) {
        await send(labels.cancelMessage);
      }
      setDecision('cancelled');
      onSettled?.('cancelled');
    } catch (err) {
      const message =
        !isHebrew && err instanceof Error
          ? err.message
          : labels.cancelError;
      setErrorMessage(message);
      setDecision('error');
      onSettled?.('error', message);
    }
  }

  const disabled =
    decision === 'submitting' ||
    decision === 'confirmed' ||
    decision === 'cancelled' ||
    decision === 'blocked' ||
    decision === 'revoked';

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

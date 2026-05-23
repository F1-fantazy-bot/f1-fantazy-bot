import { useState } from 'react';
import { useCopilotChat } from '@copilotkit/react-core';
import { Role, TextMessage } from '@copilotkit/runtime-client-gql';

// Result envelope the backend returns from a write-tool *propose* call.
// Lives here (rather than in writeToolHelpers) to keep the frontend
// type surface explicit.
export type WriteConfirmationRequired = {
  status: 'confirmation_required';
  tool: string;
  writeNonce: string;
  summary: string;
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
// The card prompts the user with a Yes / No choice. On Yes we send a
// chat message containing the writeNonce so the LLM can call
// `confirm_write({ writeNonce })`. On No we send a cancel message so
// the conversation logs the user's decision; the staged intent then
// just expires server-side.
export function WriteConfirmCard({
  result,
}: {
  result: WriteConfirmationRequired;
}) {
  const { appendMessage } = useCopilotChat();
  const [decision, setDecision] = useState<'pending' | 'confirmed' | 'cancelled'>(
    'pending',
  );

  async function send(content: string) {
    await appendMessage(
      new TextMessage({ role: Role.User, content }),
    );
  }

  async function onConfirm() {
    if (decision !== 'pending') return;
    setDecision('confirmed');
    await send(
      `Yes — please proceed. Use writeNonce ${result.writeNonce} with confirm_write.`,
    );
  }

  async function onCancel() {
    if (decision !== 'pending') return;
    setDecision('cancelled');
    await send('No — cancel that change. Do not call confirm_write.');
  }

  const disabled = decision !== 'pending';

  return (
    <div
      role="dialog"
      aria-label={`Confirm ${result.tool}`}
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
        ❓ Confirm change
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.4, marginBottom: 10 }}>
        {result.summary}
      </div>
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
          {decision === 'confirmed' ? 'Confirmed…' : 'Yes, do it'}
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
          {decision === 'cancelled' ? 'Cancelled' : 'Cancel'}
        </button>
      </div>
      <details style={{ marginTop: 8, fontSize: 11, opacity: 0.7 }}>
        <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
          What will happen
        </summary>
        <div style={{ marginTop: 4 }}>
          The agent will call <code>confirm_write</code> with a one-time
          token (writeNonce). Clicking Cancel discards the token without
          performing the change.
        </div>
      </details>
    </div>
  );
}

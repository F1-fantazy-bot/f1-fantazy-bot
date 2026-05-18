// Phase 6.5 — clear chat history button.
//
// Small button rendered in the page header. On click:
//   1. Wipe the localStorage key (`clear()`).
//   2. Call `agent.setMessages([])` to immediately reset the
//      in-memory chat — no reload required.

import { useAgent } from '@copilotkit/react-core/v2';
import { clear } from '../lib/chatHistoryStore';

export function ClearHistoryButton() {
  const { agent } = useAgent({ agentId: 'default' });

  const onClick = (): void => {
    clear();
    agent?.setMessages([]);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 12px',
        fontSize: 12,
        fontWeight: 600,
        color: '#37404f',
        background: '#f1f3f7',
        border: '1px solid #d8dde6',
        borderRadius: 6,
        cursor: 'pointer',
      }}
      aria-label="Clear chat history"
    >
      Clear chat history
    </button>
  );
}

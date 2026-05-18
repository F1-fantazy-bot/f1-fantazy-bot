// Phase 6.5 — chat history restore + auto-save.
//
// Mounted INSIDE <CopilotKit>. Uses `useAgent` to grab the live
// AbstractAgent instance, then:
//
//   1. On first mount with a real agent: load persisted history
//      from localStorage and `agent.setMessages()` it. This is
//      gated by `restoredAgentRef` so we re-run if CopilotKit
//      swaps the agent instance (stub → real) but never restore
//      twice on the same instance.
//
//   2. After hydration: subscribe to message / run-status changes
//      via the `useAgent({ updates: [...] })` config, debounce
//      500 ms, and persist the current messages — but ONLY when
//      `agent.isRunning === false`. Mid-stream saves would persist
//      half-formed assistant replies that the user would see on
//      reload as truncated text. The `OnRunStatusChanged` update
//      guarantees this effect re-runs (and saves) the moment the
//      stream completes.
//
// The hook returns `null` — it's a side-effect-only mount.
//
// See `src/lib/chatHistoryStore.ts` for the persistence contract.

import { useEffect, useRef, useState } from 'react';
import {
  UseAgentUpdate,
  useAgent,
} from '@copilotkit/react-core/v2';
import type { AbstractAgent } from '@ag-ui/client';
import type { Message } from '@ag-ui/core';
import {
  load,
  save,
  toStoredMessages,
  toAgUiMessages,
} from '../lib/chatHistoryStore';

// Cheap fingerprint over the message array so React re-runs the
// save effect when something visible actually changes. `length`
// catches new messages; the trailing id + content-length tail
// catches the streaming-delta case. Using deep equality / the raw
// array reference would either miss in-place mutations or churn
// every render.
function fingerprint(messages: Message[] | undefined): string {
  if (!messages || messages.length === 0) return '';
  const last = messages[messages.length - 1];
  const content = (last as { content?: unknown }).content;
  let tail: string;
  if (typeof content === 'string') {
    tail = String(content.length);
  } else if (Array.isArray(content)) {
    tail = `block:${content.length}`;
  } else {
    tail = '0';
  }
  return `${messages.length}:${last.id ?? ''}:${tail}`;
}

export function HistoryRestorer(): null {
  const { agent } = useAgent({
    agentId: 'default',
    updates: [
      UseAgentUpdate.OnMessagesChanged,
      UseAgentUpdate.OnRunStatusChanged,
    ],
  });

  const restoredAgentRef = useRef<AbstractAgent | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);

  // 1) ONE-SHOT restore per agent instance.
  useEffect(() => {
    if (!agent || restoredAgentRef.current === agent) return;
    const stored = load();
    if (stored.length > 0) {
      agent.setMessages(toAgUiMessages(stored));
    }
    restoredAgentRef.current = agent;
    // Defer flipping `hydrated` so the restored messages settle
    // (and OnMessagesChanged fires for them) before the save effect
    // arms. Without this microtask, the very first OnMessagesChanged
    // could observe the pre-restore empty array and persist [].
    queueMicrotask(() => setHydrated(true));
  }, [agent]);

  // 2) Debounced auto-save, gated on `hydrated` AND `!isRunning`.
  const fp = fingerprint(agent?.messages);
  const isRunning = agent?.isRunning ?? false;

  useEffect(() => {
    if (!hydrated || !agent) return;
    if (isRunning) return;
    if (saveTimer.current !== undefined) {
      window.clearTimeout(saveTimer.current);
    }
    saveTimer.current = window.setTimeout(() => {
      save(toStoredMessages(agent.messages));
    }, 500);
    return () => {
      if (saveTimer.current !== undefined) {
        window.clearTimeout(saveTimer.current);
      }
    };
  }, [hydrated, agent, fp, isRunning]);

  return null;
}

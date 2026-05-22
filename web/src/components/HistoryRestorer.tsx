// Phase 6.5 — chat history restore + auto-save.
//
// Mounted INSIDE <CopilotKit>. Uses `useAgent` to grab the live
// AbstractAgent instance and reconciles its `messages` array with the
// per-user localStorage payload.
//
// Why this is more than a one-shot restore:
//
//   CopilotKit v2 (`@copilotkit/react-core/v2`) hands us a
//   `ProxiedCopilotRuntimeAgent` instance in "pending" mode while the
//   runtime is still connecting. Once the runtime connects, the agent
//   syncs its initial state from the server — and our agent webhook
//   runs in single-route mode without server-side `/threads`
//   persistence (the harmless 405 in the console). So the runtime
//   ALWAYS emits an initial `onMessagesChanged({ messages: [] })`
//   event AFTER we mount, which clobbers any `setMessages(stored)`
//   we did on first paint.
//
//   Treating restore as a one-shot per agent instance loses the
//   user's history on every page reload because the save effect then
//   fires with `agent.messages === []` and overwrites localStorage.
//
// Reconciliation invariant (the one rule that matters):
//
//   * RESTORE only into an empty, idle agent. Never overwrite a
//     non-empty `agent.messages` — that's either the user's live
//     conversation or messages we just applied ourselves.
//   * SAVE only when the resulting payload would be a strict
//     improvement: never write `[]` over a non-empty stored payload.
//     Explicit clears go through `clear()` first, which empties
//     localStorage before `agent.setMessages([])` fires, so this
//     guard never blocks the legitimate "user clicked Clear" path.
//
// We subscribe to the agent's `onMessagesChanged` event directly and
// drive a small `messageVersion` reducer so both effects re-run on
// EVERY messages mutation — including in-place mutations that a
// length+last-id fingerprint would miss. The `fp` fingerprint is
// retained only as a save-debounce key.
//
// A tiny restore-fuse (`restoreCountRef`) bounds the self-heal to
// avoid an unbounded restore ↔ runtime-clobber ping-pong if a future
// CopilotKit version starts re-syncing repeatedly. After the fuse
// trips we fall back to the save guard alone to prevent data loss.
//
// See `src/lib/chatHistoryStore.ts` for the persistence contract.

import { useEffect, useReducer, useRef, useState } from 'react';
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

// Used as a save-debounce dedupe key — NOT as the canonical
// change-detection signal (`messageVersion` is). Cheap fingerprint so
// rapid identical-payload renders don't all schedule a save.
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

// Bounds the self-heal restore loop. If the runtime keeps emitting
// `messages: []` after we re-apply, we stop after this many tries and
// rely on the save guard to keep localStorage intact.
const MAX_RESTORE_ATTEMPTS_PER_AGENT = 5;

export function HistoryRestorer(): null {
  const { agent } = useAgent({
    agentId: 'default',
    updates: [
      UseAgentUpdate.OnMessagesChanged,
      UseAgentUpdate.OnRunStatusChanged,
    ],
  });

  // Per-agent restore counter — resets when the agent instance
  // changes (provisional → real swap counts as a new agent and gets
  // its own budget).
  const restoredAgentRef = useRef<AbstractAgent | null>(null);
  const restoreCountRef = useRef(0);
  const [hydrated, setHydrated] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);

  // Direct subscription so we react to EVERY `onMessagesChanged`
  // event — including in-place mutations that the `useAgent`-level
  // `OnMessagesChanged` flag would force-render for but whose
  // resulting `agent.messages` might still hash to the same `fp`.
  const [messageVersion, bumpMessageVersion] = useReducer(
    (x: number) => x + 1,
    0,
  );
  useEffect(() => {
    if (!agent) return;
    const sub = agent.subscribe({
      onMessagesChanged: () => {
        bumpMessageVersion();
      },
    });
    return () => sub.unsubscribe();
  }, [agent]);

  const isRunning = agent?.isRunning ?? false;
  const fp = fingerprint(agent?.messages);

  // 1) Restore / self-heal. Runs on every messages mutation (via
  //    `messageVersion`) and on every agent swap. Idempotent: only
  //    acts when `agent.messages` is empty and stored is non-empty.
  useEffect(() => {
    if (!agent) return;
    // Don't touch messages mid-conversation. The user's live message
    // (and the agent's incoming reply) must not be overwritten.
    if (isRunning) {
      if (restoredAgentRef.current !== agent) {
        restoredAgentRef.current = agent;
        restoreCountRef.current = 0;
      }
      if (!hydrated) {
        queueMicrotask(() => setHydrated(true));
      }
      return;
    }

    if (restoredAgentRef.current !== agent) {
      restoredAgentRef.current = agent;
      restoreCountRef.current = 0;
    }

    const stored = load();
    const agentMessageCount = agent.messages?.length ?? 0;

    if (
      stored.length > 0 &&
      agentMessageCount === 0 &&
      restoreCountRef.current < MAX_RESTORE_ATTEMPTS_PER_AGENT
    ) {
      restoreCountRef.current += 1;
      agent.setMessages(toAgUiMessages(stored));
    }

    if (!hydrated) {
      // Microtask defers the save effect's first arming until after
      // any synchronous `setMessages` notifications have settled —
      // prevents a `messageVersion` change between commits from
      // racing the very first save schedule.
      queueMicrotask(() => setHydrated(true));
    }
  }, [agent, messageVersion, isRunning, hydrated]);

  // 2) Debounced auto-save.
  //
  //    Defensive empty-save guard: if `agent.messages` is transiently
  //    empty but localStorage still has content, refuse to overwrite.
  //    The clear-history button removes the localStorage key BEFORE
  //    calling `agent.setMessages([])`, so the legitimate clear path
  //    sees `load().length === 0` and proceeds with `save([])` (a
  //    no-op since the key is already gone).
  useEffect(() => {
    if (!hydrated || !agent) return;
    if (isRunning) return;
    if (saveTimer.current !== undefined) {
      window.clearTimeout(saveTimer.current);
    }
    saveTimer.current = window.setTimeout(() => {
      const next = toStoredMessages(agent.messages);
      if (next.length === 0 && load().length > 0) {
        // Transient clobber. Leave stored history alone — the
        // restore effect on the next render will re-apply it.
        return;
      }
      save(next);
    }, 500);
    return () => {
      if (saveTimer.current !== undefined) {
        window.clearTimeout(saveTimer.current);
      }
    };
  }, [hydrated, agent, fp, messageVersion, isRunning]);

  return null;
}

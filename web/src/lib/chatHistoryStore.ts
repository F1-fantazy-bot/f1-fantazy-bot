// Browser-only chat history persistence for the F1 Fantasy web-chat
// agent.
//
// Persists ONLY the last N user-or-assistant text messages of the
// current conversation in `localStorage`. Phase 6.5.
//
// Why text-only:
// - Tool calls / tool results / large blobs (`availableTeams`,
//   leaderboard rows, live-score breakdowns) are NEVER persisted.
//   Reloading must not let stale data re-enter the LLM context and
//   must not bloat localStorage past the per-origin quota.
// - The 12 React tool-render components do NOT reappear after a
//   reload — only the user's question + the assistant's final text
//   reply. This is the intentional v1 behavior. The persistence
//   layer is for VISUAL CONTINUITY, not for context-passing
//   efficiency.
//
// Failure modes handled:
// - Missing key, corrupt JSON, version mismatch, non-array messages,
//   or any item failing per-field validation → whole payload
//   discarded, `load()` returns `[]`.
// - `QuotaExceededError` (or any other `setItem` throw) → `clear()` +
//   swallow. The chat keeps working with no history.
// - `getItem` throws (private-browsing mode in some browsers,
//   restricted iframe contexts) → treat as missing key.
// - Duplicate ids inside the stored payload → de-duplicated on load
//   to avoid React-key collisions.

import type { Message } from '@ag-ui/core';

// Localstorage key — scoped per-Google-sub at runtime so multiple
// users on the same browser don't see each other's history.
const BASE_STORAGE_KEY = 'f1-fantasy-agent-history';
let activeScope: string | null = null;

function storageKey(): string {
  return activeScope ? `${BASE_STORAGE_KEY}::${activeScope}` : BASE_STORAGE_KEY;
}

/**
 * Bind chat history to a per-user scope. Call with the Google `sub`
 * after sign-in; call with `null` after sign-out to detach (so a
 * brief render between sign-out and unmount doesn't accidentally
 * touch the previous user's blob).
 */
export function setHistoryScope(scope: string | null): void {
  activeScope = scope;
}

const SCHEMA_VERSION = 1;
const MAX_MESSAGES = 20;
const MAX_BYTES = 100 * 1024;
// Per-message content cap. Defends against a single pathological
// message blowing the byte budget.
const MAX_CONTENT_LEN = 8 * 1024;

export type StoredMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type StoredPayload = {
  version: number;
  savedAt: string;
  messages: StoredMessage[];
};

function isValidStoredMessage(value: unknown): value is StoredMessage {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || v.id.length === 0) return false;
  if (v.role !== 'user' && v.role !== 'assistant') return false;
  if (typeof v.content !== 'string') return false;
  if (v.content.length > MAX_CONTENT_LEN) return false;
  return true;
}

function dedupeById(messages: StoredMessage[]): StoredMessage[] {
  const seen = new Set<string>();
  const out: StoredMessage[] = [];
  for (const m of messages) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

export function load(): StoredMessage[] {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(storageKey());
  } catch {
    // Private mode / restricted context — treat as no history.
    return [];
  }
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object') return [];

  const payload = parsed as Record<string, unknown>;
  if (payload.version !== SCHEMA_VERSION) return [];
  if (!Array.isArray(payload.messages)) return [];

  const validated: StoredMessage[] = [];
  for (const item of payload.messages) {
    if (!isValidStoredMessage(item)) {
      // Whole-payload reject: safer to start fresh than to splice
      // in a partially-valid history that confuses React keys.
      return [];
    }
    validated.push(item);
  }

  return dedupeById(validated);
}

function trimToBudget(messages: StoredMessage[]): StoredMessage[] {
  let trimmed = messages;
  if (trimmed.length > MAX_MESSAGES) {
    trimmed = trimmed.slice(-MAX_MESSAGES);
  }
  // Byte cap: drop oldest until the serialized payload fits.
  while (trimmed.length > 0) {
    const payload: StoredPayload = {
      version: SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      messages: trimmed,
    };
    if (JSON.stringify(payload).length <= MAX_BYTES) break;
    trimmed = trimmed.slice(1);
  }
  return trimmed;
}

export function save(messages: StoredMessage[]): void {
  const trimmed = trimToBudget(messages);
  const payload: StoredPayload = {
    version: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    messages: trimmed,
  };
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(payload));
  } catch {
    // Quota exceeded or any other storage failure — clear and move
    // on. Better to lose history than to leak the failure into the
    // chat experience.
    clear();
  }
}

export function clear(): void {
  try {
    window.localStorage.removeItem(storageKey());
  } catch {
    // Nothing to do — storage isn't writeable in this context.
  }
}

// Flatten the AG-UI `Message.content` into a plain string. Strict
// allowlist: only blocks with `type === 'text'` and a string `.text`
// survive. Image / audio / tool-content blocks are dropped entirely.
function flattenContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const out: string[] = [];
  for (const block of content) {
    if (
      block &&
      typeof block === 'object' &&
      (block as { type?: unknown }).type === 'text' &&
      typeof (block as { text?: unknown }).text === 'string'
    ) {
      out.push((block as { text: string }).text);
    }
  }
  return out.join('');
}

// Convert the live `agent.messages` array into the persistence shape.
// Drops `tool` + `developer` rows. Drops user/assistant rows whose
// flattened content is empty or exceeds the per-message cap. Drops
// rows without an id (defensive — AG-UI always sets one, but TS
// allows undefined fields on union narrowing).
export function toStoredMessages(messages: Message[]): StoredMessage[] {
  const out: StoredMessage[] = [];
  for (const msg of messages) {
    if (msg.role !== 'user' && msg.role !== 'assistant') continue;
    if (typeof msg.id !== 'string' || msg.id.length === 0) continue;
    const content = flattenContent((msg as { content?: unknown }).content);
    if (content.length === 0 || content.length > MAX_CONTENT_LEN) continue;
    out.push({ id: msg.id, role: msg.role, content });
  }
  return out;
}

// Convert the persistence shape back into AG-UI `Message`s with the
// right discriminated-union narrowing. Explicit construction avoids
// the `as unknown as Message[]` cast that would hide future shape
// drift.
export function toAgUiMessages(stored: StoredMessage[]): Message[] {
  return stored.map((m): Message => {
    if (m.role === 'user') {
      return { id: m.id, role: 'user', content: m.content };
    }
    return { id: m.id, role: 'assistant', content: m.content };
  });
}

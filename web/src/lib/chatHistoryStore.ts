// Browser-only chat history persistence for the F1 Fantasy web-chat
// agent.
//
// Persists the last N user-or-assistant text messages of the current
// conversation, plus a separate bounded display cache for read cards.
//
// Only text is restored to agent.messages. Tool calls/results, internal
// instructions and large blobs never re-enter the LLM context. Completed,
// allowlisted read cards use the display-only cache below, rendered in their
// original turns by ReadCardHistoryProvider without changing model context.
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
  try { window.localStorage.removeItem(`${storageKey()}::read-cards`); } catch { /* Optional display cache. */ }
  window.dispatchEvent(new Event(READ_CARDS_CHANGED_EVENT));
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

// Display-only cutoff; never changes server approval or workflow state.
export const HISTORY_CLEARED_EVENT = 'f1-history-cleared';
const clearedMemory = new Map<string, number>();
export function workflowHistoryCutoff(): number {
  const key = `${storageKey()}::workflow-cutoff`;
  try { return Number(window.localStorage.getItem(key)) || clearedMemory.get(key) || 0; }
  catch { return clearedMemory.get(key) || 0; }
}
export function clearWorkflowHistory(): void {
  const key = `${storageKey()}::workflow-cutoff`;
  const now = Date.now();
  clearedMemory.set(key, now);
  try { window.localStorage.setItem(key, String(now)); } catch { /* Memory fallback. */ }
  try { window.localStorage.removeItem(`${storageKey()}::workflow-prompts`); } catch { /* Optional display metadata. */ }
  window.dispatchEvent(new Event(HISTORY_CLEARED_EVENT));
}

// Display-only links to persisted user-message IDs. Never store tool payloads or
// inject workflow cards into the agent's messages. Keep the metadata bounded.
export function loadWorkflowPromptIds(): Record<string, string> {
  try {
    const value = JSON.parse(window.localStorage.getItem(`${storageKey()}::workflow-prompts`) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value)
      .filter(([id, prompt]) => id.length <= 200 && typeof prompt === 'string' && prompt.length <= 200)
      .slice(-40)) as Record<string, string>;
  } catch { return {}; }
}

export function saveWorkflowPromptIds(ids: Record<string, string>): void {
  try {
    window.localStorage.setItem(`${storageKey()}::workflow-prompts`, JSON.stringify(Object.fromEntries(Object.entries(ids).slice(-40))));
  } catch { /* Optional display metadata; chat and durable workflows still work. */ }
}

// Completed informational cards are display snapshots, separate from text
// history. Never restore tool calls/results, choices or approval nonces to the
// agent. Bound this cache independently and retain only visible prompt IDs.
export const READ_CARDS_CHANGED_EVENT = 'f1-read-cards-changed';
const READ_CARD_TOOLS = new Set([
  'get_next_race_info', 'get_next_races', 'get_race_weather', 'get_deadline',
  'get_current_team', 'get_best_teams', 'get_best_team_scenarios',
  'get_best_team_changes', 'get_leaderboard', 'get_live_score_for_team',
  'get_live_score_leaderboard', 'get_league_changes', 'get_league_graph',
  'get_race_summary', 'get_whats_new', 'get_simulation_status',
  'get_data_status', 'get_agent_guide',
  'list_followed_teams', 'list_user_teams',
]);
export type StoredReadCard = {
  id: string;
  promptId: string;
  tool: string;
  result: Record<string, unknown>;
};

function isReadCard(value: unknown): value is StoredReadCard {
  if (!value || typeof value !== 'object') return false;
  const card = value as StoredReadCard;
  return typeof card.id === 'string' && card.id.length > 0 && card.id.length <= 200
    && typeof card.promptId === 'string' && card.promptId.length > 0 && card.promptId.length <= 200
    && READ_CARD_TOOLS.has(card.tool) && !!card.result
    && typeof card.result === 'object' && !Array.isArray(card.result)
    && card.result.selectionMode === undefined && card.result.mode === undefined
    && (card.result.status === 'ok'
      || (card.tool === 'list_followed_teams' && card.result.status === 'empty')
      // This tool returns { teams, lang }, without a status field.
      || (card.tool === 'list_user_teams' && card.result.status === undefined
        && Array.isArray(card.result.teams)));
}

export function loadReadCards(): StoredReadCard[] {
  try {
    const raw = window.localStorage.getItem(`${storageKey()}::read-cards`);
    if (!raw || new Blob([raw]).size > MAX_BYTES) return [];
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !Array.isArray(value.cards)
      || value.cards.length > MAX_MESSAGES || !value.cards.every(isReadCard)) return [];
    return [...new Map<string, StoredReadCard>(value.cards.map((card: StoredReadCard) => [card.id, card])).values()];
  } catch { return []; }
}

export function saveReadCards(messages: Message[]): void {
  const visiblePrompts = new Set(toStoredMessages(messages).slice(-MAX_MESSAGES)
    .filter((message) => message.role === 'user').map((message) => message.id));
  const cards = new Map(loadReadCards().filter((card) => visiblePrompts.has(card.promptId))
    .map((card) => [card.id, card]));
  const calls = new Map<string, { tool: string; promptId: string }>();
  let promptId: string | undefined;
  for (const message of messages) {
    if (message.role === 'user') promptId = message.id;
    if (message.role === 'assistant' && promptId) {
      for (const call of message.toolCalls || []) {
        calls.set(call.id, { tool: call.function.name, promptId });
      }
    }
    if (message.role !== 'tool') continue;
    const call = calls.get(message.toolCallId);
    if (!call || !visiblePrompts.has(call.promptId) || !READ_CARD_TOOLS.has(call.tool)) continue;
    try {
      const card = { id: message.toolCallId, ...call, result: JSON.parse(message.content) };
      if (isReadCard(card) && new Blob([JSON.stringify(card)]).size <= MAX_BYTES) cards.set(card.id, card);
    } catch { /* Ignore incomplete/malformed results while streaming. */ }
  }
  const next = [...cards.values()].slice(-MAX_MESSAGES);
  let payload = JSON.stringify({ version: 1, cards: next });
  while (next.length && new Blob([payload]).size > MAX_BYTES) {
    next.shift();
    payload = JSON.stringify({ version: 1, cards: next });
  }
  try {
    const key = `${storageKey()}::read-cards`;
    if (window.localStorage.getItem(key) === payload) return;
    window.localStorage.setItem(key, payload);
    window.dispatchEvent(new Event(READ_CARDS_CHANGED_EVENT));
  } catch { /* Display caching failures must not affect chat or text history. */ }
}

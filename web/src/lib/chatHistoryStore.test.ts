import { afterEach, describe, expect, test } from 'vitest';
import type { Message } from '@ag-ui/core';
import {
  clearWorkflowHistory,
  loadWorkflowPromptIds,
  saveWorkflowPromptIds,
  setHistoryScope,
  toStoredMessages,
  clear,
  loadReadCards,
  saveReadCards,
} from './chatHistoryStore';

describe('chatHistoryStore internal-message filtering', () => {
  test('drops developer nonce instructions while retaining visible chat text', () => {
    const messages: Message[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'Change my language to English',
      },
      {
        id: 'internal-1',
        role: 'developer',
        content:
          'Use writeNonce secret-nonce with confirm_write.',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Language changed to English.',
      },
    ];

    expect(toStoredMessages(messages)).toEqual([
      {
        id: 'user-1',
        role: 'user',
        content: 'Change my language to English',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Language changed to English.',
      },
    ]);
  });
});

describe('read-card display persistence', () => {
  const conversation = (name = 'get_next_race_info', result: unknown = { status: 'ok', raceName: 'Singapore' }): Message[] => [
    { id: 'prompt', role: 'user', content: 'Next race' },
    { id: 'call', role: 'assistant', toolCalls: [{ id: 'tool-call', type: 'function', function: { name, arguments: '{}' } }] },
    { id: 'result', role: 'tool', toolCallId: 'tool-call', content: JSON.stringify(result) },
  ];
  afterEach(() => { setHistoryScope(null); window.localStorage.clear(); });

  test('stores only completed allowlisted informational cards and excludes write approvals, choices and errors', () => {
    for (const name of ['confirm_write', 'activate_chip', 'get_action_choices', 'propose_workflow', 'list_web_users']) {
      saveReadCards(conversation(name, { status: 'ok', writeNonce: 'secret' }));
      expect(loadReadCards()).toEqual([]);
    }
    for (const status of ['confirmation_required', 'tool_error', 'selection_required']) {
      saveReadCards(conversation('get_next_race_info', { status }));
      expect(loadReadCards()).toEqual([]);
    }
    saveReadCards(conversation());
    expect(loadReadCards()).toEqual([{ id: 'tool-call', promptId: 'prompt', tool: 'get_next_race_info', result: { status: 'ok', raceName: 'Singapore' } }]);
  });

  test('preserves snapshots after restoring text and isolates accounts and clear/sign-out', () => {
    setHistoryScope('first');
    saveReadCards(conversation());
    saveReadCards(conversation().slice(0, 1));
    expect(loadReadCards()).toHaveLength(1);
    setHistoryScope('second');
    expect(loadReadCards()).toEqual([]);
    setHistoryScope('first');
    expect(loadReadCards()).toHaveLength(1);
    clear();
    expect(loadReadCards()).toEqual([]);
  });

  test('drops snapshots whose originating prompt was trimmed and rejects malformed or oversized caches', () => {
    saveReadCards(conversation());
    saveReadCards(Array.from({ length: 21 }, (_, i) => ({ id: `prompt-${i}`, role: 'user', content: 'Next race' })));
    expect(loadReadCards()).toEqual([]);
    saveReadCards(conversation('get_next_race_info', { status: 'ok', text: 'א'.repeat(60_000) }));
    expect(loadReadCards()).toEqual([]);
    window.localStorage.setItem('f1-fantasy-agent-history::read-cards', '{broken');
    expect(loadReadCards()).toEqual([]);
    window.localStorage.setItem('f1-fantasy-agent-history::read-cards', JSON.stringify({ version: 1, cards: [{ id: 'id' }] }));
    expect(loadReadCards()).toEqual([]);
  });
});

describe('workflow display links', () => {
  afterEach(() => {
    setHistoryScope(null);
    window.localStorage.clear();
  });

  test('isolates accounts and removes links when history is cleared', () => {
    setHistoryScope('first-account');
    saveWorkflowPromptIds({ workflow: 'first-prompt' });
    setHistoryScope('second-account');
    expect(loadWorkflowPromptIds()).toEqual({});
    saveWorkflowPromptIds({ workflow: 'second-prompt' });
    clearWorkflowHistory();
    expect(loadWorkflowPromptIds()).toEqual({});
    setHistoryScope('first-account');
    expect(loadWorkflowPromptIds()).toEqual({ workflow: 'first-prompt' });
  });

  test('bounds retained links and safely ignores malformed storage', () => {
    saveWorkflowPromptIds(Object.fromEntries(Array.from({ length: 60 }, (_, index) => [`flow-${index}`, `prompt-${index}`])));
    expect(Object.keys(loadWorkflowPromptIds())).toHaveLength(40);
    expect(loadWorkflowPromptIds()['flow-0']).toBeUndefined();
    window.localStorage.setItem('f1-fantasy-agent-history::workflow-prompts', '{broken');
    expect(loadWorkflowPromptIds()).toEqual({});
  });
});

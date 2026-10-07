import { afterEach, describe, expect, test } from 'vitest';
import type { Message } from '@ag-ui/core';
import {
  clearWorkflowHistory,
  loadWorkflowPromptIds,
  saveWorkflowPromptIds,
  setHistoryScope,
  toStoredMessages,
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

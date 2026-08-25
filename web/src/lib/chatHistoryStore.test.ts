import { describe, expect, test } from 'vitest';
import type { Message } from '@ag-ui/core';
import { toStoredMessages } from './chatHistoryStore';

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

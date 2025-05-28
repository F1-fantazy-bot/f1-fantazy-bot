const {
  KILZI_CHAT_ID,
  CHIP_CALLBACK_TYPE,
  EXTRA_DRS_CHIP,
  LIMITLESS_CHIP,
  WILDCARD_CHIP,
  WITHOUT_CHIP,
} = require('../constants');

const { handleChipsMessage } = require('./chipsHandler');

describe('handleChipsMessage', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should send chip selection message with inline keyboard', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      message_id: 12345,
      text: '/chips',
    };

    await handleChipsMessage(botMock, msgMock);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'which chip do you want to use?',
      {
        reply_to_message_id: 12345,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Extra DRS',
                callback_data: `${CHIP_CALLBACK_TYPE}:${EXTRA_DRS_CHIP}`,
              },
              {
                text: 'Limitless',
                callback_data: `${CHIP_CALLBACK_TYPE}:${LIMITLESS_CHIP}`,
              },
              {
                text: 'Wildcard',
                callback_data: `${CHIP_CALLBACK_TYPE}:${WILDCARD_CHIP}`,
              },
              {
                text: 'Without Chip',
                callback_data: `${CHIP_CALLBACK_TYPE}:${WITHOUT_CHIP}`,
              },
            ],
          ],
        },
      }
    );
  });

  it('should include all chip options in the inline keyboard', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      message_id: 123,
      text: '/chips',
    };

    await handleChipsMessage(botMock, msgMock);

    const sentMessage = botMock.sendMessage.mock.calls[0];
    const inlineKeyboard = sentMessage[2].reply_markup.inline_keyboard[0];

    // Verify all chip options are present
    expect(inlineKeyboard).toHaveLength(4);

    const chipTexts = inlineKeyboard.map((button) => button.text);
    expect(chipTexts).toContain('Extra DRS');
    expect(chipTexts).toContain('Limitless');
    expect(chipTexts).toContain('Wildcard');
    expect(chipTexts).toContain('Without Chip');
  });

  it('should generate correct callback data for each chip', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      message_id: 123,
      text: '/chips',
    };

    await handleChipsMessage(botMock, msgMock);

    const sentMessage = botMock.sendMessage.mock.calls[0];
    const inlineKeyboard = sentMessage[2].reply_markup.inline_keyboard[0];

    // Check callback data for each button
    const extraDrsButton = inlineKeyboard.find(
      (btn) => btn.text === 'Extra DRS'
    );
    expect(extraDrsButton.callback_data).toBe(
      `${CHIP_CALLBACK_TYPE}:${EXTRA_DRS_CHIP}`
    );

    const limitlessButton = inlineKeyboard.find(
      (btn) => btn.text === 'Limitless'
    );
    expect(limitlessButton.callback_data).toBe(
      `${CHIP_CALLBACK_TYPE}:${LIMITLESS_CHIP}`
    );

    const wildcardButton = inlineKeyboard.find(
      (btn) => btn.text === 'Wildcard'
    );
    expect(wildcardButton.callback_data).toBe(
      `${CHIP_CALLBACK_TYPE}:${WILDCARD_CHIP}`
    );

    const withoutChipButton = inlineKeyboard.find(
      (btn) => btn.text === 'Without Chip'
    );
    expect(withoutChipButton.callback_data).toBe(
      `${CHIP_CALLBACK_TYPE}:${WITHOUT_CHIP}`
    );
  });

  it('should reply to the original message', async () => {
    const originalMessageId = 98765;
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      message_id: originalMessageId,
      text: '/chips',
    };

    await handleChipsMessage(botMock, msgMock);

    const sentMessage = botMock.sendMessage.mock.calls[0];
    expect(sentMessage[2].reply_to_message_id).toBe(originalMessageId);
  });

  it('should propagate sendMessage errors', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      message_id: 123,
      text: '/chips',
    };

    botMock.sendMessage.mockRejectedValueOnce(new Error('Network error'));

    // Should propagate the error since there's no error handling
    await expect(handleChipsMessage(botMock, msgMock)).rejects.toThrow(
      'Network error'
    );

    expect(botMock.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('should work with different chat IDs and message IDs', async () => {
    const differentChatId = 'different_chat_123';
    const differentMessageId = 555;

    const msgMock = {
      chat: { id: differentChatId },
      message_id: differentMessageId,
      text: '/chips',
    };

    await handleChipsMessage(botMock, msgMock);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      differentChatId,
      'which chip do you want to use?',
      expect.objectContaining({
        reply_to_message_id: differentMessageId,
      })
    );
  });
});

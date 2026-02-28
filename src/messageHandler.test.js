const { KILZI_CHAT_ID } = require('./constants');

const mockIsAllowedUser = jest.fn((msg) => msg.chat.id === KILZI_CHAT_ID);

jest.mock('./utils/utils', () => ({
  getChatName: jest.fn().mockReturnValue('Unknown'),
  sendLogMessage: jest.fn(),
  isMessageFromAllowedUser: mockIsAllowedUser,
}));

jest.mock('./pendingReplyManager', () => ({
  getPendingReply: jest.fn().mockResolvedValue(undefined),
  clearPendingReply: jest.fn().mockResolvedValue(),
}));

jest.mock('./textMessageHandler', () => ({
  handleTextMessage: jest.fn().mockResolvedValue(),
}));

jest.mock('./photoMessageHandler', () => ({
  handlePhotoMessage: jest.fn().mockResolvedValue(),
}));

const { handleMessage } = require('./messageHandler');
const { sendLogMessage } = require('./utils/utils');
const { getPendingReply, clearPendingReply } = require('./pendingReplyManager');
const { handleTextMessage } = require('./textMessageHandler');
const { handlePhotoMessage } = require('./photoMessageHandler');

describe('handleMessage', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getPendingReply.mockResolvedValue(undefined);
  });

  it('when got message from unknown sender, dont handle the message', async () => {
    const msgMock = {
      chat: {
        id: 123456,
      },
      text: 'Hello',
    };

    await handleMessage(botMock, msgMock);
    expect(botMock.sendMessage).not.toHaveBeenCalledWith(
      msgMock.chat.id,
      expect.any(String)
    );
    expect(sendLogMessage).toHaveBeenCalledTimes(1);
    expect(sendLogMessage).toHaveBeenCalledWith(
      botMock,
      'Message from unknown chat: Unknown (123456)'
    );
  });

  it('when got unsupported message', async () => {
    const msgMock = {
      chat: {
        id: KILZI_CHAT_ID,
      },
      unsupportedField: 'Unsupported',
    };
    await handleMessage(botMock, msgMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      msgMock.chat.id,
      'Sorry, I only support text and image messages.'
    );
    expect(sendLogMessage).toHaveBeenCalledTimes(2);
    expect(sendLogMessage).toHaveBeenCalledWith(
      botMock,
      `Received a message from Unknown (${KILZI_CHAT_ID})`
    );
    expect(sendLogMessage).toHaveBeenCalledWith(
      botMock,
      `Received unsupported message type from Unknown (${KILZI_CHAT_ID}).`
    );
  });

  it('should intercept pending reply for text messages', async () => {
    const mockHandler = jest.fn().mockResolvedValue();
    getPendingReply.mockResolvedValue({ handler: mockHandler, validate: null, resendPromptIfNotValid: null });

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: 'my reply text',
    };

    await handleMessage(botMock, msgMock);

    expect(getPendingReply).toHaveBeenCalledWith(KILZI_CHAT_ID);
    expect(clearPendingReply).toHaveBeenCalledWith(KILZI_CHAT_ID);
    expect(mockHandler).toHaveBeenCalledWith(botMock, msgMock);
    // Should not proceed to normal text handling
    expect(botMock.sendMessage).not.toHaveBeenCalled();
  });

  it('should intercept pending reply for photo messages', async () => {
    const mockHandler = jest.fn().mockResolvedValue();
    getPendingReply.mockResolvedValue({ handler: mockHandler, validate: null, resendPromptIfNotValid: null });

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      photo: [{ file_id: 'photo123' }],
    };

    await handleMessage(botMock, msgMock);

    expect(getPendingReply).toHaveBeenCalledWith(KILZI_CHAT_ID);
    expect(clearPendingReply).toHaveBeenCalledWith(KILZI_CHAT_ID);
    expect(mockHandler).toHaveBeenCalledWith(botMock, msgMock);
    // Should not proceed to normal photo handling
    expect(botMock.sendMessage).not.toHaveBeenCalled();
  });

  it('should not intercept when no pending reply exists for text', async () => {
    getPendingReply.mockResolvedValue(undefined);

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: 'hello',
    };

    await handleMessage(botMock, msgMock);

    expect(getPendingReply).toHaveBeenCalledWith(KILZI_CHAT_ID);
    expect(clearPendingReply).not.toHaveBeenCalled();
    expect(handleTextMessage).toHaveBeenCalledWith(botMock, msgMock);
  });

  it('should not intercept when no pending reply exists for photo', async () => {
    getPendingReply.mockResolvedValue(undefined);

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      photo: [{ file_id: 'photo456' }],
    };

    await handleMessage(botMock, msgMock);

    expect(getPendingReply).toHaveBeenCalledWith(KILZI_CHAT_ID);
    expect(clearPendingReply).not.toHaveBeenCalled();
    expect(handlePhotoMessage).toHaveBeenCalledWith(botMock, msgMock);
  });

  it('should re-send custom prompt when validation fails with resendPromptIfNotValid', async () => {
    const mockHandler = jest.fn().mockResolvedValue();
    const mockValidate = jest.fn().mockReturnValue(false);
    getPendingReply.mockResolvedValue({
      handler: mockHandler,
      validate: mockValidate,
      resendPromptIfNotValid: 'Please send text only',
    });

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      photo: [{ file_id: 'photo789' }],
    };

    await handleMessage(botMock, msgMock);

    expect(mockValidate).toHaveBeenCalledWith(msgMock);
    expect(clearPendingReply).not.toHaveBeenCalled();
    expect(mockHandler).not.toHaveBeenCalled();
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Please send text only',
      { reply_markup: { force_reply: true } },
    );
  });

  it('should re-send default prompt when validation fails and no resendPromptIfNotValid', async () => {
    const mockHandler = jest.fn().mockResolvedValue();
    const mockValidate = jest.fn().mockReturnValue(false);
    getPendingReply.mockResolvedValue({
      handler: mockHandler,
      validate: mockValidate,
      resendPromptIfNotValid: null,
    });

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      photo: [{ file_id: 'photo789' }],
    };

    await handleMessage(botMock, msgMock);

    expect(mockValidate).toHaveBeenCalledWith(msgMock);
    expect(clearPendingReply).not.toHaveBeenCalled();
    expect(mockHandler).not.toHaveBeenCalled();
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Invalid reply. Please try again.',
      { reply_markup: { force_reply: true } },
    );
  });

  it('should clear and execute handler when validation passes', async () => {
    const mockHandler = jest.fn().mockResolvedValue();
    const mockValidate = jest.fn().mockReturnValue(true);
    getPendingReply.mockResolvedValue({
      handler: mockHandler,
      validate: mockValidate,
      resendPromptIfNotValid: 'Please send text only',
    });

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: 'valid text reply',
    };

    await handleMessage(botMock, msgMock);

    expect(mockValidate).toHaveBeenCalledWith(msgMock);
    expect(clearPendingReply).toHaveBeenCalledWith(KILZI_CHAT_ID);
    expect(mockHandler).toHaveBeenCalledWith(botMock, msgMock);
  });
});

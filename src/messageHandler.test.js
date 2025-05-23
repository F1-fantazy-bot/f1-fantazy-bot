const { KILZI_CHAT_ID } = require('./constants');

const mockIsAdmin = jest.fn((msg) => msg.chat.id === KILZI_CHAT_ID);

jest.mock('./utils/utils', () => ({
  getChatName: jest.fn().mockReturnValue('Unknown'),
  sendLogMessage: jest.fn(),
  isAdminMessage: mockIsAdmin,
}));

const { handleMessage } = require('./messageHandler');
const { sendLogMessage } = require('./utils/utils');

jest.mock('openai', () => ({
  AzureOpenAI: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: 'Mocked response',
              },
            },
          ],
        }),
      },
    },
  })),
}));

describe('handleMessage', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
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
});

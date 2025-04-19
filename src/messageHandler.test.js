const { handleMessage } = require('./messageHandler');
const { KILZI_CHAT_ID } = require('./constants');
jest.mock('./utils', () => ({
  getChatName: jest.fn().mockReturnValue('Unknown'),
  sendLogMessage: jest.fn(),
}));
const { sendLogMessage } = require('./utils');

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

  it('when got message from unknown sender, dont handle the message', () => {
    const msgMock = {
      chat: {
        id: 123456,
      },
      text: 'Hello',
    };

    handleMessage(botMock, msgMock);
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

  it('when got unsupported message', () => {
    const msgMock = {
      chat: {
        id: KILZI_CHAT_ID,
      },
      unsupportedField: 'Unsupported',
    };
    handleMessage(botMock, msgMock);
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

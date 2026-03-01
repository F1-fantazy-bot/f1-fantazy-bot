const { KILZI_CHAT_ID } = require('../constants');

jest.mock('openai', () => {
  const createMock = jest.fn();

  return {
    AzureOpenAI: jest.fn().mockImplementation(() => ({
      chat: {
        completions: { create: createMock },
      },
    })),
    __createMock: createMock,
  };
});

const { __createMock } = require('openai');

jest.mock('../utils', () => ({
  sendLogMessage: jest.fn().mockResolvedValue(),
  isAdminMessage: jest.fn(),
}));

jest.mock('./bestTeamsHandler', () => ({
  handleBestTeamsMessage: jest.fn(),
}));
jest.mock('./numberInputHandler', () => ({
  handleNumberMessage: jest.fn(),
}));

const { isAdminMessage } = require('../utils');
const { handleBestTeamsMessage } = require('./bestTeamsHandler');
const { handleNumberMessage } = require('./numberInputHandler');
const { handleAskCommand } = require('./askHandler');
const { buildAskSystemPrompt } = require('../prompts');

describe('handleAskCommand', () => {
  const botMock = { sendMessage: jest.fn().mockResolvedValue() };

  beforeEach(() => {
    jest.clearAllMocks();
    isAdminMessage.mockReturnValue(false);
  });

  it('should call AzureOpenAI and execute returned commands', async () => {
    isAdminMessage.mockReturnValue(true);
    const msgMock = { chat: { id: KILZI_CHAT_ID }, text: 'best teams' };
    const mockResponse = {
      choices: [{ message: { content: '["/best_teams","1"]' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    };
    __createMock.mockResolvedValue(mockResponse);

    await handleAskCommand(botMock, msgMock);

    expect(__createMock).toHaveBeenCalled();
    expect(handleBestTeamsMessage).toHaveBeenCalledWith(botMock, KILZI_CHAT_ID);
    expect(handleNumberMessage).toHaveBeenCalledWith(botMock, KILZI_CHAT_ID, '1');
  });

  it('should notify when no text provided', async () => {
    const msgMock = { chat: { id: KILZI_CHAT_ID }, text: '' };

    await handleAskCommand(botMock, msgMock);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Please provide a question.'
    );
  });

  it('should use admin prompt for admin users', async () => {
    isAdminMessage.mockReturnValue(true);
    const msgMock = { chat: { id: KILZI_CHAT_ID }, text: 'question' };
    const mockResponse = {
      choices: [{ message: { content: '[]' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    };
    __createMock.mockResolvedValue(mockResponse);

    await handleAskCommand(botMock, msgMock);

    expect(isAdminMessage).toHaveBeenCalledWith(msgMock);
    expect(__createMock).toHaveBeenCalledWith({
      model: undefined,
      messages: [
        { role: 'system', content: buildAskSystemPrompt(true) },
        { role: 'user', content: 'question' },
      ],
    });
  });

  it('should use non-admin prompt for regular users', async () => {
    isAdminMessage.mockReturnValue(false);
    const msgMock = { chat: { id: 999 }, text: 'question' };
    const mockResponse = {
      choices: [{ message: { content: '[]' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    };
    __createMock.mockResolvedValue(mockResponse);

    await handleAskCommand(botMock, msgMock);

    expect(isAdminMessage).toHaveBeenCalledWith(msgMock);
    expect(__createMock).toHaveBeenCalledWith({
      model: undefined,
      messages: [
        { role: 'system', content: buildAskSystemPrompt(false) },
        { role: 'user', content: 'question' },
      ],
    });
  });
});

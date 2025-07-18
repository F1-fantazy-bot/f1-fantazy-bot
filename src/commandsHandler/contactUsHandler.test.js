const {
  handleContactUsCommand,
  processContactUsResponse,
  awaitingContactMessages,
} = require('./contactUsHandler');
const { sendMessageToAdmins, getChatName } = require('../utils');

jest.mock('../utils', () => ({
  sendMessageToAdmins: jest.fn(),
  getChatName: jest.fn().mockReturnValue('User'),
}));

describe('contactUsHandler', () => {
  const botMock = { sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }) };

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(awaitingContactMessages).forEach((key) => delete awaitingContactMessages[key]);
  });

  it('handleContactUsCommand sends prompt and stores message id', async () => {
    const msg = { chat: { id: 123 } };

    await handleContactUsCommand(botMock, msg);

    expect(botMock.sendMessage).toHaveBeenCalledWith(123, expect.any(String), {
      reply_markup: { force_reply: true },
    });
    expect(awaitingContactMessages[123]).toBe(1);
  });

  it('processContactUsResponse forwards message when reply matches', async () => {
    awaitingContactMessages[123] = 1;
    const msg = { chat: { id: 123 }, text: 'hi', reply_to_message: { message_id: 1 } };

    const res = await processContactUsResponse(botMock, msg);

    expect(res).toBe(true);
    expect(sendMessageToAdmins).toHaveBeenCalledWith(
      botMock,
      expect.stringContaining('hi')
    );
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      123,
      expect.any(String)
    );
    expect(awaitingContactMessages[123]).toBeUndefined();
  });

  it('processContactUsResponse returns false for non matching reply', async () => {
    awaitingContactMessages[123] = 2;
    const msg = { chat: { id: 123 }, text: 'no', reply_to_message: { message_id: 1 } };

    const res = await processContactUsResponse(botMock, msg);

    expect(res).toBe(false);
    expect(sendMessageToAdmins).not.toHaveBeenCalled();
  });
});

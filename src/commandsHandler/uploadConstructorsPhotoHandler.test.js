const {
  handleUploadConstructorsPhotoCommand,
} = require('./uploadConstructorsPhotoHandler');

jest.mock('../i18n', () => ({
  t: jest.fn((key) => key),
}));

jest.mock('../utils/utils', () => ({
  isAdminMessage: jest.fn(),
}));

jest.mock('../pendingReplyManager', () => ({
  registerPendingReply: jest.fn().mockResolvedValue(),
}));

const { isAdminMessage } = require('../utils/utils');
const { registerPendingReply } = require('../pendingReplyManager');

describe('uploadConstructorsPhotoHandler', () => {
  let botMock;

  beforeEach(() => {
    jest.clearAllMocks();
    botMock = {
      sendMessage: jest.fn().mockResolvedValue(),
    };
  });

  it('should reject non-admin users', async () => {
    isAdminMessage.mockReturnValue(false);
    const msg = { chat: { id: 999 } };

    await handleUploadConstructorsPhotoCommand(botMock, msg);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      999,
      'Sorry, only admins can use this command.',
    );
    expect(registerPendingReply).not.toHaveBeenCalled();
  });

  it('should register pending reply for admin users', async () => {
    isAdminMessage.mockReturnValue(true);
    const msg = { chat: { id: 123 } };

    await handleUploadConstructorsPhotoCommand(botMock, msg);

    expect(registerPendingReply).toHaveBeenCalledWith(
      123,
      'upload_constructors_photo',
    );
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      123,
      'Please send a constructors screenshot.',
      { reply_markup: { force_reply: true } },
    );
  });
});

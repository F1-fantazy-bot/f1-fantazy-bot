const { handlePhotoMessage } = require('./photoMessageHandler');
const { CURRENT_TEAM_PHOTO_TYPE } = require('./constants');
const { processPhotoByType } = require('./photoProcessingService');

jest.mock('./photoProcessingService', () => ({
  processPhotoByType: jest.fn().mockResolvedValue(),
}));

describe('handlePhotoMessage', () => {
  let bot;
  let msg;

  beforeEach(() => {
    bot = {
      getFile: jest.fn(),
      sendMessage: jest.fn(() => Promise.resolve()),
    };
    msg = {
      chat: { id: 123 },
      message_id: 456,
      photo: [
        { file_id: 'small', file_unique_id: 'unique1' },
        { file_id: 'large', file_unique_id: 'unique2' },
      ],
    };
  });

  it('should select the largest photo (last in array)', async () => {
    bot.getFile.mockResolvedValue({ file_size: 1000 });

    await handlePhotoMessage(bot, msg);

    expect(processPhotoByType).toHaveBeenCalledWith(
      bot,
      123,
      CURRENT_TEAM_PHOTO_TYPE,
      'large',
      'unique2',
    );
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it('should process admin standalone photos as current team too', async () => {
    msg.chat.id = 454873194;

    await handlePhotoMessage(bot, msg);

    expect(processPhotoByType).toHaveBeenCalledWith(
      bot,
      454873194,
      CURRENT_TEAM_PHOTO_TYPE,
      'large',
      'unique2',
    );
  });
});

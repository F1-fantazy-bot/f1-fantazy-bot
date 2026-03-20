const { handlePhotoMessage } = require('./photoMessageHandler');
const {
  DRIVERS_PHOTO_TYPE,
  CONSTRUCTORS_PHOTO_TYPE,
  CURRENT_TEAM_PHOTO_TYPE,
  PHOTO_CALLBACK_TYPE,
} = require('./constants');
const { photoCache } = require('./cache');
const { isAdminMessage } = require('./utils/utils');
const { processPhotoByType } = require('./photoProcessingService');

jest.mock('./cache', () => ({
  photoCache: {},
  userCache: {},
}));

jest.mock('./utils/utils', () => ({
  isAdminMessage: jest.fn(),
}));

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
    // Clear cache before each test
    for (const key in photoCache) {
      delete photoCache[key];
    }
  });

  it('should send inline buttons', async () => {
    isAdminMessage.mockReturnValue(true);
    bot.getFile.mockResolvedValue({ file_size: 2048 });

    await handlePhotoMessage(bot, msg);

    // Should cache the photo
    expect(photoCache['unique2']).toEqual({
      fileId: 'large',
      chatId: 123,
      messageId: 456,
    });

    // Should send inline keyboard
    expect(bot.sendMessage).toHaveBeenCalledWith(
      123,
      'What type is this photo?',
      expect.objectContaining({
        reply_to_message_id: 456,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Drivers',
                callback_data: `${PHOTO_CALLBACK_TYPE}:${DRIVERS_PHOTO_TYPE}:unique2`,
              },
              {
                text: 'Constructors',
                callback_data: `${PHOTO_CALLBACK_TYPE}:${CONSTRUCTORS_PHOTO_TYPE}:unique2`,
              },
              {
                text: 'Current Team',
                callback_data: `${PHOTO_CALLBACK_TYPE}:${CURRENT_TEAM_PHOTO_TYPE}:unique2`,
              },
            ],
          ],
        },
      })
    );
  });

  it('should select the largest photo (last in array)', async () => {
    isAdminMessage.mockReturnValue(true);
    bot.getFile.mockResolvedValue({ file_size: 1000 });

    await handlePhotoMessage(bot, msg);

    // The cached fileId should be 'large', not 'small'
    expect(photoCache['unique2'].fileId).toBe('large');
  });

  it('should auto-process non-admin photos as current team', async () => {
    isAdminMessage.mockReturnValue(false);

    await handlePhotoMessage(bot, msg);

    expect(processPhotoByType).toHaveBeenCalledWith(
      bot,
      123,
      CURRENT_TEAM_PHOTO_TYPE,
      'large',
      'unique2',
    );
    expect(bot.sendMessage).not.toHaveBeenCalledWith(
      123,
      'What type is this photo?',
      expect.anything(),
    );
    expect(photoCache.unique2).toBeUndefined();
  });
});

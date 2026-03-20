const { handlePhotoMessage } = require('./photoMessageHandler');
const { CURRENT_TEAM_PHOTO_TYPE } = require('./constants');
const { processPhotoByType } = require('./photoProcessingService');

jest.mock('./photoProcessingService', () => ({
  processPhotoByType: jest.fn().mockResolvedValue(),
}));

describe('handlePhotoMessage', () => {
  it('should always process uploaded photo as current team', async () => {
    const bot = {};
    const msg = {
      chat: { id: 123 },
      photo: [
        { file_id: 'small', file_unique_id: 'unique1' },
        { file_id: 'large', file_unique_id: 'unique2' },
      ],
    };

    await handlePhotoMessage(bot, msg);

    expect(processPhotoByType).toHaveBeenCalledWith(
      bot,
      123,
      CURRENT_TEAM_PHOTO_TYPE,
      'large',
      'unique2',
    );
  });
});

const mockIsAdminMessage = jest.fn();
const mockTriggerManualJob = jest.fn();

jest.mock('../utils', () => ({
  isAdminMessage: mockIsAdminMessage,
}));

jest.mock('../manualTriggerService', () => ({
  triggerManualJob: mockTriggerManualJob,
}));

const {
  handleManualTriggerCommand,
  handleTriggerScrapingCommand,
  handleTriggerApiDataCommand,
  handleTriggerApiDataLockedCommand,
  handleTriggerNextRaceInfoCommand,
  handleTriggerLiveScoreSchedulerCommand,
} = require('./manualTriggersHandler');

describe('manualTriggersHandler', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };
  const msgMock = {
    chat: { id: 123 },
    text: '/trigger_api_data',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAdminMessage.mockReturnValue(true);
    mockTriggerManualJob.mockResolvedValue({ success: true });
  });

  it('denies trigger execution for non-admins', async () => {
    mockIsAdminMessage.mockReturnValue(false);

    await handleManualTriggerCommand(botMock, msgMock, 'api_data');

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      123,
      'Sorry, only admins can trigger manual jobs.',
    );
    expect(mockTriggerManualJob).not.toHaveBeenCalled();
  });

  it('triggers API data successfully', async () => {
    await handleTriggerApiDataCommand(botMock, msgMock);

    expect(mockTriggerManualJob).toHaveBeenCalledWith('api_data');
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      123,
      'API data trigger started successfully.',
    );
  });

  it('triggers scraping successfully', async () => {
    await handleTriggerScrapingCommand(botMock, msgMock);

    expect(mockTriggerManualJob).toHaveBeenCalledWith('scraper');
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      123,
      'Web scraping triggered successfully.',
    );
  });

  it('triggers API data locked successfully', async () => {
    await handleTriggerApiDataLockedCommand(botMock, msgMock);

    expect(mockTriggerManualJob).toHaveBeenCalledWith('api_data_locked');
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      123,
      'API data locked trigger started successfully.',
    );
  });

  it('triggers next race info scheduler successfully', async () => {
    await handleTriggerNextRaceInfoCommand(botMock, msgMock);

    expect(mockTriggerManualJob).toHaveBeenCalledWith('next_race_info');
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      123,
      'Next race info scheduler started successfully.',
    );
  });

  it('triggers live score scheduler successfully', async () => {
    await handleTriggerLiveScoreSchedulerCommand(botMock, msgMock);

    expect(mockTriggerManualJob).toHaveBeenCalledWith('live_score_scheduler');
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      123,
      'Live score scheduler started successfully.',
    );
  });

  it('reports trigger failures', async () => {
    mockTriggerManualJob.mockResolvedValue({
      success: false,
      error: 'Forbidden',
    });

    await handleTriggerApiDataCommand(botMock, msgMock);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      123,
      'Failed to trigger API data: Forbidden',
    );
  });
});

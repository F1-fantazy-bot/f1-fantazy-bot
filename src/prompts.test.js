const {
  buildAskSystemPrompt,
  buildRaceSummarySystemPrompt,
  getAskCommands,
  EXTRA_ASK_COMMANDS,
} = require('./prompts');

const { MENU_CATEGORIES } = require('./constants');

describe('buildAskSystemPrompt', () => {
  it('should include only user commands for non-admin users', () => {
    const prompt = buildAskSystemPrompt(false);
    const { userCommands, adminCommands } = getAskCommands();

    for (const cmd of userCommands) {
      expect(prompt).toContain(cmd);
    }

    for (const cmd of adminCommands) {
      expect(prompt).not.toContain(cmd);
    }
  });

  it('should include both user and admin commands for admin users', () => {
    const prompt = buildAskSystemPrompt(true);
    const { userCommands, adminCommands } = getAskCommands();

    for (const cmd of userCommands) {
      expect(prompt).toContain(cmd);
    }

    for (const cmd of adminCommands) {
      expect(prompt).toContain(cmd);
    }
  });

  it('should include /list_users in admin commands', () => {
    const { adminCommands } = getAskCommands();
    expect(adminCommands).toContain('/list_users');

    const adminPrompt = buildAskSystemPrompt(true);
    expect(adminPrompt).toContain('/list_users');

    const userPrompt = buildAskSystemPrompt(false);
    expect(userPrompt).not.toContain('/list_users');
  });

  it('should not include admin commands like /trigger_scraping for non-admin users', () => {
    const prompt = buildAskSystemPrompt(false);

    expect(prompt).not.toContain('/trigger_scraping');
    expect(prompt).not.toContain('/get_botfather_commands');
    expect(prompt).not.toContain('/billing_stats');
    expect(prompt).not.toContain('/version');
    expect(prompt).not.toContain('/list_users');
  });

  it('should contain the standard instructions in both variants', () => {
    const userPrompt = buildAskSystemPrompt(false);
    const adminPrompt = buildAskSystemPrompt(true);

    const expectedPhrases = [
      'You are an assistant for a Telegram bot',
      'Respond only with a JSON array of commands',
      'Numbers may be used to request team details after /best_teams',
      'place the chip command before /best_teams',
      'place /reset_chip before /best_teams',
    ];

    for (const phrase of expectedPhrases) {
      expect(userPrompt).toContain(phrase);
      expect(adminPrompt).toContain(phrase);
    }
  });

  it('should derive user commands from non-admin MENU_CATEGORIES plus EXTRA_ASK_COMMANDS', () => {
    const { userCommands } = getAskCommands();

    // Verify all non-admin menu category commands are included
    Object.values(MENU_CATEGORIES).forEach((category) => {
      if (!category.adminOnly) {
        category.commands.forEach((cmd) => {
          expect(userCommands).toContain(cmd.constant);
        });
      }
    });

    // Verify extra commands are included
    for (const cmd of EXTRA_ASK_COMMANDS) {
      expect(userCommands).toContain(cmd);
    }
  });

  it('should derive admin commands from admin-only MENU_CATEGORIES', () => {
    const { adminCommands } = getAskCommands();

    Object.values(MENU_CATEGORIES).forEach((category) => {
      if (category.adminOnly) {
        category.commands.forEach((cmd) => {
          expect(adminCommands).toContain(cmd.constant);
        });
      }
    });
  });
});

describe('buildRaceSummarySystemPrompt', () => {
  test.each([
    ['en', 'English', 'Latin letters'],
    ['he', 'Hebrew', 'Hebrew letters'],
  ])('preserves the controlled %s recap policy', (language, name, alphabet) => {
    const prompt = buildRaceSummarySystemPrompt(language);

    expect(prompt).toContain(`entirely in ${name}`);
    expect(prompt).toContain(`into ${alphabet}`);
    expect(prompt).toContain('exactly four sections');
    expect(prompt).toContain('keyTeamDifferences');
    expect(prompt).toContain('seasonRankChange');
    expect(prompt).toContain('Treat roster differences as correlation');
    expect(prompt).toContain('stay under 3000 characters');
  });

  test('adds Hebrew-specific RTL and language-quality policy', () => {
    const prompt = buildRaceSummarySystemPrompt('he');

    expect(prompt).toContain('never begin a sentence or prose paragraph');
    expect(prompt).toContain('natural modern Israeli Hebrew');
    expect(prompt).toContain('always use masculine grammatical forms');
  });
});

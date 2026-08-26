import { describe, expect, test, vi } from 'vitest';

vi.mock('@copilotkit/react-core/v2', () => ({
  useAgent: vi.fn(),
  useCopilotKit: vi.fn(),
}));

import { requestTeamSelection } from './UserTeamsAction';
import type { UserTeam } from './UserTeamsList';

const team: UserTeam = {
  teamId: 'Doron-Kilzi_2',
  teamName: 'Kilzid 2',
  isLeague: true,
  isSelected: false,
  chip: null,
  drivers: ['VER'],
  constructors: ['MCL'],
  boost: 'VER',
  freeTransfers: 2,
  costCapRemaining: 1.2,
};

describe('requestTeamSelection', () => {
  test('retries an empty agent run without duplicating the user message', async () => {
    const addMessage = vi.fn();
    const runAgent = vi
      .fn()
      .mockResolvedValueOnce({ newMessages: [] })
      .mockResolvedValueOnce({ newMessages: [{ role: 'assistant' }] });
    const pendingMessageIds = new Map<string, string>();

    await expect(
      requestTeamSelection({
        team,
        lang: 'he',
        agent: { addMessage },
        runAgent,
        pendingMessageIds,
      }),
    ).rejects.toThrow('Agent run did not produce a response');
    expect(addMessage).toHaveBeenCalledTimes(1);
    expect(addMessage.mock.calls[0][0]).toMatchObject({
      role: 'user',
      content:
        'בחר את "Kilzid 2" (teamId: Doron-Kilzi_2) כקבוצה הפעילה שלי.',
    });

    await requestTeamSelection({
      team,
      lang: 'he',
      agent: { addMessage },
      runAgent,
      pendingMessageIds,
    });
    expect(addMessage).toHaveBeenCalledTimes(1);
    expect(runAgent).toHaveBeenCalledTimes(2);
    expect(pendingMessageIds.has(team.teamId)).toBe(false);
  });
});

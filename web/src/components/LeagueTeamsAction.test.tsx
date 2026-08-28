import { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { InteractiveLeagueTeams } from './LeagueTeamsAction';
import { WriteDecisionProvider } from './WriteDecisionContext';

const agent = { addMessage: vi.fn() };

vi.mock('@copilotkit/react-core/v2', () => ({
  useAgent: () => ({ agent }),
  useCopilotKit: () => ({ copilotkit: { runAgent: vi.fn() } }),
}));

beforeAll(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderTeams(selectionMode?: 'follow_team') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <WriteDecisionProvider
        runtimeUrl="https://agent.example.com/api/agent/copilotkit"
        idToken="google-token"
      >
        <InteractiveLeagueTeams
          result={{
            status: 'ok',
            leagueCode: 'ABC123',
            leagueName: 'Friends League',
            lang: 'en',
            selectionMode,
            teams: [
              {
                teamId: 'Owner_1',
                teamName: 'Fast Friends',
                position: 2,
              },
              {
                teamId: 'Tracked_2',
                teamName: 'Tracked Team',
                position: 3,
                isFollowed: true,
              },
            ],
          }}
        />
      </WriteDecisionProvider>,
    );
  });

  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('InteractiveLeagueTeams', () => {
  test('stages the clicked team with canonical league and team IDs', async () => {
    const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'confirmation_required',
          tool: 'follow_team',
          writeNonce: 'nonce-team',
          summary: 'Follow Fast Friends.',
          uiLang: 'en',
        }),
        { status: 200 },
      ),
    );
    const rendered = renderTeams('follow_team');
    const teamButton = rendered.container.querySelector('button');

    await act(async () => {
      teamButton?.click();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://agent.example.com/api/agent/write-proposal',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          tool: 'follow_team',
          args: {
            action: 'add',
            leagueCode: 'ABC123',
            teamId: 'Owner_1',
          },
        }),
      }),
    );
    expect(
      rendered.container.querySelector(
        '[role="dialog"][aria-label="Confirm change: follow_team"]',
      ),
    ).not.toBeNull();
    rendered.cleanup();
  });

  test('keeps team cards read-only outside follow_team selection mode', () => {
    const rendered = renderTeams();

    expect(rendered.container.querySelector('button')).toBeNull();
    expect(rendered.container.textContent).toContain('Fast Friends');
    rendered.cleanup();
  });

  test('marks and disables teams that are already followed', () => {
    const rendered = renderTeams('follow_team');
    const trackedButton = Array.from(
      rendered.container.querySelectorAll('button'),
    ).find((button) => button.textContent?.includes('Tracked Team'));

    expect(trackedButton?.disabled).toBe(true);
    expect(trackedButton?.textContent).toContain('ALREADY FOLLOWED');
    rendered.cleanup();
  });

  test('keeps unfollowed cards selectable after a rejected proposal', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'limit_exceeded',
          tool: 'follow_team',
          summary: 'Remove a followed team first.',
          uiLang: 'en',
        }),
        { status: 200 },
      ),
    );
    const rendered = renderTeams('follow_team');
    const availableButton = Array.from(
      rendered.container.querySelectorAll('button'),
    ).find((button) => button.textContent?.includes('Fast Friends'));

    await act(async () => {
      availableButton?.click();
    });

    expect(availableButton?.disabled).toBe(false);
    expect(rendered.container.textContent).toContain(
      'Remove a followed team first.',
    );
    rendered.cleanup();
  });
});

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
import {
  FollowedTeamsGrid,
  InteractiveFollowedTeams,
  type ListFollowedTeamsResult,
} from './FollowedTeamsGrid';
import { WriteDecisionProvider } from './WriteDecisionContext';

const agent = { addMessage: vi.fn() };

vi.mock('@copilotkit/react-core/v2', () => ({
  useAgent: () => ({ agent }),
  useCopilotKit: () => ({ copilotkit: { runAgent: vi.fn() } }),
}));

const result: ListFollowedTeamsResult = {
  lang: 'en',
  status: 'ok',
  selectionMode: 'unfollow_team',
  teams: [
    {
      teamId: 'Owner_1',
      teamName: 'Fast Friends',
      isSelected: true,
      leagues: [
        {
          leagueCode: 'ABC123',
          leagueName: 'Friends League',
          position: 1,
        },
      ],
    },
    {
      teamId: 'Other_2',
      teamName: 'Other Team',
      isSelected: false,
      leagues: [],
    },
  ],
};

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

function renderInteractive() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <WriteDecisionProvider
        runtimeUrl="https://agent.example.com/api/agent/copilotkit"
        idToken="google-token"
      >
        <InteractiveFollowedTeams result={result} />
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

describe('InteractiveFollowedTeams', () => {
  test('keeps regular tracked-team results read-only', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <FollowedTeamsGrid
          result={{ ...result, selectionMode: undefined }}
        />,
      );
    });

    expect(container.querySelector('button')).toBeNull();
    act(() => root.unmount());
  });

  test('stages canonical removal without requiring a league or typed name', async () => {
    const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'confirmation_required',
          tool: 'follow_team',
          writeNonce: 'nonce-remove',
          summary: 'Stop following Fast Friends.',
          uiLang: 'en',
        }),
        { status: 200 },
      ),
    );
    const rendered = renderInteractive();

    await act(async () => {
      Array.from(rendered.container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Stop tracking')
        ?.click();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://agent.example.com/api/agent/write-proposal',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          tool: 'follow_team',
          args: {
            action: 'remove',
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

  test('removes the confirmed card and updates the active fallback', async () => {
    vi.spyOn(window, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'confirmation_required',
            tool: 'follow_team',
            writeNonce: 'nonce-remove',
            summary: 'Stop following Fast Friends.',
            uiLang: 'en',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'ok',
            tool: 'follow_team',
            summary: 'Stopped following Fast Friends.',
            teamId: 'Owner_1',
            fallbackSelectedTeam: 'Other_2',
            uiLang: 'en',
          }),
          { status: 200 },
        ),
      );
    const rendered = renderInteractive();

    await act(async () => {
      Array.from(rendered.container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Stop tracking')
        ?.click();
    });
    await act(async () => {
      Array.from(rendered.container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Yes, do it')
        ?.click();
    });

    expect(
      Array.from(rendered.container.querySelectorAll('button')).some(
        (button) =>
          button.getAttribute('aria-label') ===
          'Stop tracking: Fast Friends',
      ),
    ).toBe(false);
    expect(rendered.container.textContent).toContain('Other Team');
    expect(rendered.container.textContent).toContain('ACTIVE');
    rendered.cleanup();
  });

  test('keeps every confirmed removal hidden in one picker session', async () => {
    const proposal = (nonce: string, teamName: string) =>
      new Response(
        JSON.stringify({
          status: 'confirmation_required',
          tool: 'follow_team',
          writeNonce: nonce,
          summary: `Stop following ${teamName}.`,
          uiLang: 'en',
        }),
        { status: 200 },
      );
    const success = (
      teamId: string,
      teamName: string,
      fallbackSelectedTeam: string | null,
    ) =>
      new Response(
        JSON.stringify({
          status: 'ok',
          tool: 'follow_team',
          summary: `Stopped following ${teamName}.`,
          teamId,
          fallbackSelectedTeam,
          uiLang: 'en',
        }),
        { status: 200 },
      );
    vi.spyOn(window, 'fetch')
      .mockResolvedValueOnce(proposal('nonce-one', 'Fast Friends'))
      .mockResolvedValueOnce(success('Owner_1', 'Fast Friends', 'Other_2'))
      .mockResolvedValueOnce(proposal('nonce-two', 'Other Team'))
      .mockResolvedValueOnce(success('Other_2', 'Other Team', null));
    const rendered = renderInteractive();

    for (const teamName of ['Fast Friends', 'Other Team']) {
      await act(async () => {
        Array.from(rendered.container.querySelectorAll('button'))
          .find(
            (button) =>
              button.getAttribute('aria-label') ===
              `Stop tracking: ${teamName}`,
          )
          ?.click();
      });
      await act(async () => {
        Array.from(rendered.container.querySelectorAll('button'))
          .find((button) => button.textContent === 'Yes, do it')
          ?.click();
      });
    }

    expect(
      rendered.container.querySelectorAll(
        'button[aria-label^="Stop tracking:"]',
      ),
    ).toHaveLength(0);
    expect(rendered.container.textContent).toContain(
      'No tracked league teams yet.',
    );
    rendered.cleanup();
  });
});

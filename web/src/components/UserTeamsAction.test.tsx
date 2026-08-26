import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const propose = vi.fn();

vi.mock('./WriteDecisionContext', () => ({
  useWriteDecision: () => ({ propose }),
}));

vi.mock('./WriteConfirmCard', () => ({
  isConfirmationRequired: (value: { status?: string }) =>
    value?.status === 'confirmation_required',
  WriteConfirmCard: ({
    result,
    directConfirm,
    onSettled,
  }: {
    result: { summary: string };
    directConfirm?: boolean;
    onSettled?: (
      outcome: 'confirmed' | 'cancelled',
      message?: string,
      finalResult?: {
        status: 'ok';
        tool: string;
        summary: string;
      },
    ) => void;
  }) => (
    <div
      data-testid="confirmation-card"
      data-direct-confirm={String(Boolean(directConfirm))}
    >
      {result.summary}
      <button
        type="button"
        onClick={() =>
          onSettled?.('confirmed', undefined, {
            status: 'ok',
            tool: 'select_team',
            summary: 'Active team switched.',
          })
        }
      >
        Confirm proposal
      </button>
      <button type="button" onClick={() => onSettled?.('cancelled')}>
        Cancel proposal
      </button>
    </div>
  ),
}));

vi.mock('./WriteResultCard', () => ({
  isWriteResult: (value: { status?: string }) => value?.status === 'ok',
  WriteResultCard: ({ result }: { result: { summary: string } }) => (
    <div data-testid="result-card">{result.summary}</div>
  ),
}));

import { InteractiveUserTeamsList } from './UserTeamsAction';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  propose.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('InteractiveUserTeamsList', () => {
  test('stages the canonical team id and renders the approval card', async () => {
    propose.mockResolvedValue({
      status: 'confirmation_required',
      tool: 'select_team',
      writeNonce: 'nonce-team',
      summary: 'Change active team to Kilzid 2.',
      args: { teamId: 'Doron-Kilzi_2' },
      uiLang: 'en',
    });

    await act(async () => {
      root.render(
        <InteractiveUserTeamsList
          result={{
            lang: 'en',
            teams: [
              {
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
              },
            ],
          }}
        />,
      );
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button')?.click();
      await Promise.resolve();
    });

    expect(propose).toHaveBeenCalledWith('select_team', {
      teamId: 'Doron-Kilzi_2',
    });
    expect(
      container.querySelector('[data-testid="confirmation-card"]')
        ?.textContent,
    ).toContain('Change active team to Kilzid 2.');
    expect(
      container
        .querySelector('[data-testid="confirmation-card"]')
        ?.getAttribute('data-direct-confirm'),
    ).toBe('true');

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="confirmation-card"] button',
        )
        ?.click();
    });
    expect(
      container.querySelector('[data-testid="confirmation-card"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="result-card"]')?.textContent,
    ).toBe('Active team switched.');
    expect(
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="Select team: Kilzid 2"]',
      )?.disabled,
    ).toBe(false);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Select team: Kilzid 2"]',
        )
        ?.click();
      await Promise.resolve();
    });
    await act(async () => {
      Array.from(
        container.querySelectorAll<HTMLButtonElement>(
          '[data-testid="confirmation-card"] button',
        ),
      )
        .find((item) => item.textContent === 'Cancel proposal')
        ?.click();
    });
    expect(
      container.querySelector('[data-testid="confirmation-card"]'),
    ).toBeNull();
  });
});

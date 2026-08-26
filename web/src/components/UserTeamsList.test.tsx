import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  TEAM_SELECTION_CHANGED_EVENT,
  UserTeamsList,
  type UserTeam,
} from './UserTeamsList';

const activeTeam: UserTeam = {
  teamId: 'T1',
  teamName: 'Kilzid 1',
  isLeague: true,
  isSelected: true,
  chip: null,
  drivers: ['VER'],
  constructors: ['MCL'],
  boost: 'VER',
  freeTransfers: 2,
  costCapRemaining: 1.2,
};

const selectableTeam: UserTeam = {
  ...activeTeam,
  teamId: 'T2',
  teamName: 'Kilzid 2',
  isSelected: false,
};

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('UserTeamsList selection cards', () => {
  test('starts selection when a non-active card is clicked', async () => {
    const onSelectTeam = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <UserTeamsList
          result={{ lang: 'en', teams: [activeTeam, selectableTeam] }}
          onSelectTeam={onSelectTeam}
        />,
      );
    });

    const activeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Kilzid 1, ACTIVE"]',
    );
    const selectableButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Switch to this team: Kilzid 2"]',
    );

    expect(activeButton?.disabled).toBe(true);
    expect(selectableButton?.disabled).toBe(false);
    const detailsId = selectableButton?.getAttribute('aria-describedby');
    expect(detailsId).toBeTruthy();
    expect(document.getElementById(detailsId ?? '')?.textContent).toContain(
      'Drivers: VER',
    );
    expect(container.textContent).toContain(
      'An approval card will appear next.',
    );
    await act(async () => {
      selectableButton?.click();
      await Promise.resolve();
    });
    expect(onSelectTeam).toHaveBeenCalledWith(selectableTeam);
  });

  test('shows a localized error when selection cannot start', async () => {
    const onSelectTeam = vi.fn().mockRejectedValue(new Error('network down'));

    await act(async () => {
      root.render(
        <UserTeamsList
          result={{ lang: 'he', teams: [selectableTeam] }}
          onSelectTeam={onSelectTeam}
        />,
      );
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button')?.click();
      await Promise.resolve();
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'לא ניתן להתחיל את בחירת הקבוצה',
    );
  });

  test('updates the active card when a selection result is announced', async () => {
    await act(async () => {
      root.render(
        <UserTeamsList
          result={{ lang: 'en', teams: [activeTeam, selectableTeam] }}
          onSelectTeam={vi.fn()}
        />,
      );
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent(TEAM_SELECTION_CHANGED_EVENT, {
          detail: selectableTeam.teamId,
        }),
      );
    });

    expect(
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="Switch to this team: Kilzid 1"]',
      )?.disabled,
    ).toBe(false);
    expect(
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="Kilzid 2, ACTIVE"]',
      )?.disabled,
    ).toBe(true);
  });
});

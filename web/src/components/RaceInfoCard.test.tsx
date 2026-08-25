import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { RaceInfoCard } from './RaceInfoCard';

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

function renderCard() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <RaceInfoCard
        result={{
          status: 'ok',
          lang: 'he',
          raceName: 'Italian Grand Prix',
          circuitName: 'Monza',
          location: { locality: 'Monza', country: 'Italy' },
          weekendFormat: 'regular',
          isSprintWeekend: false,
          sessions: {
            qualifying: '2026-09-05T14:00:00.000Z',
            race: '2026-09-06T13:00:00.000Z',
          },
          weather: {
            qualifyingWeather: {
              temperature: 26,
              precipitation: 5,
              wind: 3,
            },
            raceWeather: {
              temperature: 29,
              precipitation: 10,
              wind: 2,
            },
          },
          historicalRaceStats: [
            {
              season: 2025,
              polePosition: 'Max Verstappen',
              winner: 'Max Verstappen',
              constructor: 'Red Bull',
              carsFinished: 18,
            },
          ],
          trackHistory: [
            { lang: 'en', text: 'English track history.' },
            { lang: 'he', text: 'היסטוריית מסלול בעברית.' },
          ],
        }}
      />,
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

describe('RaceInfoCard localization', () => {
  test('renders Hebrew labels, locale, direction, and track history', () => {
    const { container, cleanup } = renderCard();

    expect(container.firstElementChild?.getAttribute('dir')).toBe('rtl');
    expect(container.textContent).toContain('לוח זמנים');
    expect(container.textContent).toContain('דירוג');
    expect(container.textContent).toContain('מרוץ');
    expect(container.textContent).toContain('תחזית מזג האוויר');
    expect(container.textContent).toContain('תוצאות היסטוריות');
    expect(container.textContent).toContain('היסטוריית המסלול');
    expect(container.textContent).toContain('היסטוריית מסלול בעברית.');
    expect(container.textContent).not.toContain('English track history.');

    cleanup();
  });
});

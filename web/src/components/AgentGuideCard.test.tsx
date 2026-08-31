import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  AgentGuideCard,
  type AgentGuideResult,
} from './AgentGuideCard';

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

function renderGuide(result: AgentGuideResult) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<AgentGuideCard result={result} />));

  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('AgentGuideCard', () => {
  test('renders personalized status and recommendations', () => {
    const rendered = renderGuide({
      status: 'ok',
      lang: 'en',
      title: 'Your F1 Fantasy pit wall',
      intro: 'Ask naturally.',
      profile: {
        teamCount: 3,
        followedTeamCount: 2,
        leagueCount: 1,
        hasProjectionData: true,
      },
      recommendations: [
        {
          id: 'optimize_team',
          topic: 'teams',
          icon: '🏆',
          title: 'Optimize your team',
          description: 'Compare projected lineups.',
          example: 'Best teams for Kilzid',
        },
      ],
      sections: [],
      notices: [],
    });

    expect(rendered.container.textContent).toContain('PIT WALL');
    expect(rendered.container.textContent).toContain('Your next move');
    expect(rendered.container.textContent).toContain('Optimize your team');
    expect(rendered.container.textContent).toContain('Best teams for Kilzid');
    expect(rendered.container.textContent).toContain('3');
    expect(rendered.container.textContent).toContain('Ready');
    rendered.cleanup();
  });

  test('renders Hebrew content in RTL', () => {
    const rendered = renderGuide({
      status: 'ok',
      lang: 'he',
      title: 'עמדת הפיקוד שלך',
      intro: 'אפשר לשאול באופן טבעי.',
      profile: {
        teamCount: 1,
        followedTeamCount: 1,
        leagueCount: 1,
        hasProjectionData: false,
      },
      recommendations: [],
      sections: [
        {
          topic: 'races',
          tasks: [
            {
              id: 'race_schedule',
              topic: 'races',
              icon: '🗓️',
              title: 'תכנן את סוף שבוע המרוץ',
              description: 'קבל מידע על המרוץ.',
              example: 'ספר לי על המרוץ הבא',
            },
          ],
        },
      ],
      notices: ['נתוני התחזית עדיין אינם מוכנים.'],
    });

    expect(
      rendered.container.querySelector('section')?.getAttribute('dir'),
    ).toBe('rtl');
    expect(rendered.container.textContent).toContain('סוף שבוע המרוץ');
    expect(rendered.container.textContent).toContain('נסה לשאול');
    expect(rendered.container.textContent).toContain('חסר');
    expect(rendered.container.textContent).toContain('F1 FANTASY · עמדת פיקוד');
    expect(rendered.container.textContent).not.toContain('PIT WALL');
    expect(
      rendered.container.querySelector('[role="group"]')?.getAttribute(
        'aria-label',
      ),
    ).toBe('מצב הפיט');
    rendered.cleanup();
  });

  test('renders a safe forbidden state for admin guidance', () => {
    const rendered = renderGuide({
      status: 'forbidden',
      lang: 'en',
      summary: 'Administrative guidance is available only to administrators.',
    });

    expect(rendered.container.querySelector('[role="status"]')).not.toBeNull();
    expect(rendered.container.textContent).toContain(
      'available only to administrators',
    );
    rendered.cleanup();
  });
});

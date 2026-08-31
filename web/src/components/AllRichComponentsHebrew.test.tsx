import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { NextRacesTable } from './NextRacesTable';
import { UserTeamsList } from './UserTeamsList';
import { FollowedTeamsGrid } from './FollowedTeamsGrid';
import { LeaderboardTable } from './LeaderboardTable';
import { BestTeamScenariosMatrix } from './BestTeamScenariosMatrix';
import { WeatherForecast } from './WeatherForecast';
import { DeadlineCountdown } from './DeadlineCountdown';
import { CurrentTeamCard } from './CurrentTeamCard';
import { LiveScoreBreakdown } from './LiveScoreBreakdown';
import { LiveScoreLeaderboard } from './LiveScoreLeaderboard';
import { ToolErrorFallback } from './ToolErrorFallback';
import { AgentGuideCard } from './AgentGuideCard';

vi.mock('@copilotkit/react-core/v2', () => ({
  useAgent: vi.fn(),
  useCopilotKit: vi.fn(),
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

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));

  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('all rich components honor Hebrew ui language', () => {
  const cases: Array<{
    name: string;
    element: ReactElement;
    expected: string[];
  }> = [
    {
      name: 'agent guide',
      element: (
        <AgentGuideCard
          result={{
            status: 'ok',
            lang: 'he',
            title: 'עמדת הפיקוד שלך',
            intro: 'אפשר לשאול באופן טבעי.',
            profile: {
              teamCount: 1,
              followedTeamCount: 1,
              leagueCount: 1,
              hasProjectionData: true,
            },
            recommendations: [],
            sections: [
              {
                topic: 'teams',
                tasks: [
                  {
                    id: 'optimize_team',
                    topic: 'teams',
                    icon: '🏆',
                    title: 'שפר את הקבוצה שלך',
                    description: 'השווה הרכבים.',
                    example: 'הצג קבוצות מומלצות',
                  },
                ],
              },
            ],
            notices: [],
          }}
        />
      ),
      expected: ['עמדת הפיקוד', 'אסטרטגיית קבוצה', 'נסה לשאול'],
    },
    {
      name: 'next races',
      element: (
        <NextRacesTable
          result={{
            lang: 'he',
            season: '2026',
            races: [
              {
                round: '1',
                raceName: 'Australian Grand Prix',
                date: '2026-03-08',
              },
            ],
            counts: { total: 1, sprint: 0 },
          }}
        />
      ),
      expected: ['המרוצים הקרובים', 'סבב', 'תאריך המרוץ', 'מרוץ נותר'],
    },
    {
      name: 'user teams',
      element: (
        <UserTeamsList
          result={{
            lang: 'he',
            teams: [
              {
                teamId: 'T1',
                teamName: 'Kilzid',
                isLeague: false,
                isSelected: true,
                chip: null,
                drivers: ['VER'],
                constructors: ['MCL'],
                boost: 'VER',
                freeTransfers: 2,
                costCapRemaining: 1.2,
              },
            ],
          }}
        />
      ),
      expected: ['פעילה', 'צילום מסך', 'נהגים', 'העברות חינם'],
    },
    {
      name: 'followed teams',
      element: (
        <FollowedTeamsGrid
          result={{
            lang: 'he',
            status: 'ok',
            teams: [
              {
                teamId: 'T1',
                teamName: 'Kilzid',
                isSelected: true,
                leagues: [
                  { leagueCode: 'ABC', leagueName: 'Test', position: 2 },
                ],
              },
            ],
          }}
        />
      ),
      expected: ['פעילה', 'מ2'],
    },
    {
      name: 'leaderboard',
      element: (
        <LeaderboardTable
          result={{
            lang: 'he',
            status: 'ok',
            leagueName: 'Test',
            memberCount: 1,
            standings: [
              {
                position: 1,
                teamName: 'Kilzid',
                userName: null,
                teamNo: 1,
                teamId: 'T1',
                totalScore: 100,
                gapToLeader: 0,
                isSelected: true,
              },
            ],
          }}
        />
      ),
      expected: ['קבוצות', 'קבוצה', 'ניקוד', 'פער'],
    },
    {
      name: 'best-team scenarios',
      element: (
        <BestTeamScenariosMatrix
          result={{
            lang: 'he',
            status: 'ok',
            teamName: 'Kilzid',
            scenarios: [
              {
                ppm: 0,
                ppmLabel: 'Pure Points',
                results: [
                  {
                    chipKey: 'EXTRA_BOOST',
                    chipLabel: 'Without Chip',
                    projectedPoints: 100,
                    expectedPriceChange: 1,
                    recommendation: null,
                  },
                ],
              },
            ],
          }}
        />
      ),
      expected: [
        'תרחישי הקבוצה הטובה ביותר',
        'נקודות בלבד',
        'תרחיש',
        "נק'",
        "ללא צ'יפ",
      ],
    },
    {
      name: 'weather',
      element: (
        <WeatherForecast
          result={{
            lang: 'he',
            status: 'ok',
            raceName: 'Italian Grand Prix',
            sessions: [
              {
                key: 'race',
                label: 'Race',
                startsAt: '2026-09-06T13:00:00.000Z',
                hours: [],
                forecasts: [],
              },
            ],
          }}
        />
      ),
      expected: ['תחזית מזג האוויר', 'מרוץ', 'כבר התחיל'],
    },
    {
      name: 'deadline',
      element: (
        <DeadlineCountdown
          result={{
            lang: 'he',
            status: 'ok',
            raceName: 'Italian Grand Prix',
            sessionType: 'qualifying',
            alreadyStarted: true,
          }}
        />
      ),
      expected: ['מועד נעילת הקבוצות', 'מרוץ', 'דירוג', 'המקצה כבר התחיל'],
    },
    {
      name: 'current team',
      element: (
        <CurrentTeamCard
          result={{
            lang: 'he',
            status: 'ok',
            teamId: 'T1',
            teamName: 'Kilzid',
            chip: 'EXTRA_BOOST',
            drivers: ['VER'],
            constructors: ['MCL'],
            teamInfo: { totalPrice: 100, teamExpectedPoints: 50 },
          }}
        />
      ),
      expected: [
        'אקסטרה בוסט',
        'נהגים',
        'קבוצות',
        'מחיר כולל',
        'נקודות חזויות',
      ],
    },
    {
      name: 'live score breakdown',
      element: (
        <LiveScoreBreakdown
          result={{
            lang: 'he',
            status: 'ok',
            leagueName: 'Test',
            teamName: 'Kilzid',
            matchdayId: 1,
            breakdown: {
              totalPoints: 10,
              totalPriceChange: 1,
              driverBreakdown: [{ code: 'VER', points: 10 }],
            },
          }}
        />
      ),
      expected: ['ניקוד חי', 'מחזור', 'סך נקודות חי', 'נהגים'],
    },
    {
      name: 'live-score leaderboard',
      element: (
        <LiveScoreLeaderboard
          result={{
            lang: 'he',
            status: 'ok',
            leagueName: 'Test',
            matchdayId: 1,
            rows: [
              {
                teamId: 'T1',
                teamName: 'Kilzid',
                totalPoints: 10,
                totalPriceChange: 1,
                isSelected: true,
              },
            ],
          }}
        />
      ),
      expected: ['טבלת ניקוד חי', 'מחזור', 'קבוצה', 'נקודות חי', 'אתה'],
    },
    {
      name: 'tool errors',
      element: (
        <ToolErrorFallback
          result={{
            status: 'tool_error',
            tool: 'get_best_teams',
            errorId: 'abc',
            uiLang: 'he',
          }}
        />
      ),
      expected: ['משהו השתבש', 'פרטי תמיכה'],
    },
  ];

  for (const item of cases) {
    test(item.name, () => {
      const { container, cleanup } = render(item.element);
      expect(container.firstElementChild?.getAttribute('dir')).toBe('rtl');
      for (const text of item.expected) {
        expect(container.textContent).toContain(text);
      }
      cleanup();
    });
  }

  test('data-preparation failures are visible and RTL in every affected card', () => {
    const failures: ReactElement[] = [
      <BestTeamScenariosMatrix
        key="scenarios"
        result={{ lang: 'he', status: 'projection_mismatch' }}
      />,
      <CurrentTeamCard
        key="current"
        result={{ lang: 'he', status: 'missing_weekend_format' }}
      />,
    ];

    for (const element of failures) {
      const { container, cleanup } = render(element);
      expect(container.firstElementChild?.getAttribute('dir')).toBe('rtl');
      expect(container.textContent).not.toBe('');
      cleanup();
    }
  });
});

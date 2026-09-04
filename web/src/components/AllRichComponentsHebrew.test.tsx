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
import { LeagueChangesCard } from './LeagueChangesCard';
import { LeagueGraphCard } from './LeagueGraphCard';
import { RaceSummaryCard } from './RaceSummaryCard';
import { WhatsNewCard } from './WhatsNewCard';
import { SimulationStatusCard } from './SimulationStatusCard';
import { DataStatusCard } from './DataStatusCard';
import { SimulationRefreshCard } from './SimulationRefreshCard';
import { ResetUserDataCard } from './ResetUserDataCard';
import {
  AdminVersionCard,
  BillingStatsCard,
  BotUsersCard,
  WebUsersCard,
  BotfatherSetupCard,
} from './AdminReadCards';

vi.mock('@copilotkit/react-core/v2', () => ({
  UseAgentUpdate: { OnRunStatusChanged: 'run-status' },
  useAgent: () => ({
    agent: {
      addMessage: vi.fn(),
      setMessages: vi.fn(),
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
      messages: [],
      isRunning: false,
    },
  }),
  useCopilotKit: () => ({
    copilotkit: { runAgent: vi.fn() },
  }),
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
      name: 'league changes',
      element: (
        <LeagueChangesCard
          result={{
            lang: 'he',
            status: 'ok',
            leagueName: 'ליגת בדיקה',
            matchdayId: 7,
            changedTeams: [
              {
                teamName: 'Kilzid',
                userName: 'Kilzid',
                position: 1,
                isNew: false,
                hasChanges: true,
                drivers: { in: ['LEC'], out: ['HAM'] },
                constructors: { in: ['FER'], out: ['MER'] },
                captain: { from: 'NOR', to: 'LEC' },
                megaCaptain: null,
                chipsActivated: ['Wildcard'],
              },
            ],
            unchangedTeams: [],
          }}
        />
      ),
      expected: [
        'שינויים בליגה',
        'מחזור',
        'נהגים שנכנסו',
        'קבוצות שיצאו',
        'קפטן',
        "צ'יפ שהופעל",
      ],
    },
    {
      name: 'league graph',
      element: (
        <LeagueGraphCard
          result={{
            status: 'ok',
            lang: 'he',
            leagueCode: 'ABC',
            leagueName: 'ליגת בדיקה',
            graphType: 'gap',
            matchdays: [
              { key: 'matchday_1', matchdayId: 1, label: 'בחריין' },
            ],
            series: [
              {
                teamId: 'T1',
                teamName: 'הקבוצה שלי',
                userName: 'owner',
                teamNo: 1,
                position: 1,
                color: '#e6194b',
                isSelected: true,
                points: [
                  {
                    matchdayId: 1,
                    label: 'בחריין',
                    value: 0,
                    chip: null,
                  },
                ],
              },
            ],
          }}
        />
      ),
      expected: ['פער מהמוביל', 'קבוצות בגרף', 'הקבוצה הפעילה', 'טבלת נתוני הגרף'],
    },
    {
      name: 'race summary',
      element: (
        <RaceSummaryCard
          result={{
            status: 'ok',
            lang: 'he',
            leagueName: 'ליגת בדיקה',
            raceName: 'גרנד פרי סין',
            raceNumber: 2,
            summary:
              '🏁 ליגת בדיקה — גרנד פרי סין — מרוץ 2\n\n🏆 מנצחים ומפסידים\nהקבוצה Rocket ניצחה.\n\n🔧 הבדלי קבוצות\nההרכבים היו שונים.\n\n📈 מגמות עונה\nהצמרת התהפכה.\n\n🎭 סיפורים\nהוויילדקארד הגיע בזמן.',
          }}
        />
      ),
      expected: ['גרנד פרי סין', 'מנצחים ומפסידים', 'מגמות עונה', 'סיפורים'],
    },
    {
      name: 'release announcement',
      element: (
        <WhatsNewCard
          result={{
            status: 'ok',
            lang: 'he',
            announcement: {
              createdAt: '2026-04-29T07:58:42Z',
              version: 'wow',
              text: 'עדכון *חדש*\n\n- אפשר לעקוב אחרי ליגה',
            },
          }}
        />
      ),
      expected: ['מה חדש', 'עדכון מיוחד', 'עדכון חדש', 'אפשר לעקוב אחרי ליגה'],
    },
    {
      name: 'simulation status',
      element: (
        <SimulationStatusCard
          result={{
            status: 'ok',
            lang: 'he',
            source: { kind: 'simulation', name: 'תחזית מונזה' },
            matchday: 16,
            freshness: {
              status: 'fresh',
              updatedAtLocal: '2 בספט׳ 2026, 14:00',
            },
            available: { drivers: 22, constructors: 11 },
            projections: {
              drivers: [{ code: 'VER', expectedPoints: 25 }],
              constructors: [{ code: 'MCL', expectedPoints: 30 }],
            },
          }}
        />
      ),
      expected: [
        'מצב הסימולציה',
        'מקור',
        'מחזור',
        'עדכני',
        'נהגים זמינים',
        'קבוצות זמינות',
        'נתוני הסימולציה',
        'תחזית נהגים',
      ],
    },
    {
      name: 'simulation refresh',
      element: (
        <SimulationRefreshCard
          result={{
            status: 'ok',
            tool: 'load_latest_simulation',
            uiLang: 'he',
            summary:
              'הסימולציה העדכנית רועננה מהמקור המשותף והעמיד: 22 נהגים ו־11 קבוצות · מחזור 14.',
            source: { kind: 'durable_shared_source' },
            fetchedAt: '3 בספט׳ 2026, 11:16',
            matchday: 14,
            counts: { drivers: 22, constructors: 11 },
          }}
        />
      ),
      expected: [
        'הסימולציה רועננה',
        'מקור',
        'נתוני סימולציה משותפים ועמידים',
        'רוענן',
        'מחזור',
        'נהגים',
        'קבוצות',
      ],
    },
    {
      name: 'user-data reset',
      element: (
        <ResetUserDataCard
          result={{
            status: 'ok',
            tool: 'reset_user_data',
            uiLang: 'he',
            summary: 'נתוני F1 Fantasy השמורים אופסו.',
            impact: {
              teamBlobs: 2,
              selectedTeam: true,
              rankingPreferences: 2,
              selectedBestTeams: 1,
              chipPreferences: 2,
              driverProjectionOverride: true,
              constructorProjectionOverride: false,
            },
          }}
        />
      ),
      expected: [
        'נתוני המשתמש אופסו',
        'קבוצות שנמחקו',
        'קבוצה פעילה',
        'העדפות דירוג',
        'העדפות צ׳יפים',
      ],
    },
    {
      name: 'admin version',
      element: (
        <AdminVersionCard
          result={{
            status: 'ok',
            lang: 'he',
            version: {
              commitId: 'abc123',
              commitMessage: 'עדכון מנהלים',
              commitLink: 'https://example.test/commit',
            },
          }}
        />
      ),
      expected: ['גרסת פריסה', 'מזהה Commit', 'הודעת Commit', 'קישור ל-Commit'],
    },
    {
      name: 'admin billing',
      element: (
        <BillingStatsCard
          result={{
            status: 'ok',
            lang: 'he',
            billing: {
              currentMonth: {
                hasData: true,
                totalCost: 12.5,
                period: { monthName: 'ספטמבר', year: 2026 },
                services: [{ serviceName: 'Functions', cost: 12.5, currency: 'USD' }],
              },
              previousMonth: { hasData: false },
              comparison: null,
            },
          }}
        />
      ),
      expected: ['חיוב Azure', 'החודש הנוכחי', 'סה״כ', 'פילוח שירותים'],
    },
    {
      name: 'admin bot users',
      element: (
        <BotUsersCard
          result={{
            status: 'ok',
            lang: 'he',
            directory: {
              totalCount: 1,
              displayedCount: 1,
              users: [{ chatId: '7', nickname: 'פול', lang: 'he' }],
            },
            selection: { mode: 'set_user_nickname', nickname: 'קוטב' },
          }}
        />
      ),
      expected: ['משתמשי הבוט', 'שם', 'מזהה צ׳אט', 'שפה', 'הגדר כינוי'],
    },
    {
      name: 'admin web users',
      element: (
        <WebUsersCard
          result={{
            status: 'ok',
            lang: 'he',
            directory: {
              totalCount: 1,
              displayedCount: 1,
              users: [{ email: 'admin@example.com', chatId: '7', linkedDisplay: 'פול' }],
            },
          }}
        />
      ),
      expected: ['משתמשי ווב מורשים', 'אימייל', 'משתמש מקושר', 'נוסף על ידי'],
    },
    {
      name: 'BotFather setup',
      element: (
        <BotfatherSetupCard
          result={{
            status: 'ok',
            lang: 'he',
            setup: {
              totalCount: 1,
              displayedCount: 1,
              commands: [{ command: 'help', description: 'עזרה' }],
            },
          }}
        />
      ),
      expected: ['הגדרת BotFather', 'פקודה', 'תיאור'],
    },
    {
      name: 'data status',
      element: (
        <DataStatusCard
          result={{
            status: 'incomplete',
            lang: 'he',
            source: 'simulation',
            simulation: {
              status: 'ok',
              name: 'תחזית מונזה',
              matchday: 16,
              freshness: { status: 'stale' },
            },
            projections: { drivers: 22, constructors: 11, available: true },
            teams: { ownedCount: 2, selected: null, hasSelectedTeam: false },
            missingPrerequisites: ['selected_team'],
            nextActions: ['select_team'],
            cache: {
              projections: {
                drivers: [{ code: 'VER', expectedPoints: 25 }],
                constructors: [{ code: 'MCL', expectedPoints: 30 }],
              },
              teams: [{
                teamId: 'T1',
                teamName: 'קילזי',
                isSelected: true,
                drivers: ['VER'],
                constructors: ['MCL'],
              }],
            },
          }}
        />
      ),
      expected: [
        'מצב הנתונים',
        'חלק מהנתונים עדיין חסרים',
        'תחזית מונזה',
        'ישן',
        'קבוצה פעילה',
        'חסרים',
        'בחר קבוצה פעילה',
        'נתונים שמורים',
        'הרכבים שמורים',
      ],
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

import { directionFor, useUiLanguage } from './uiLanguage';

export type ToolLoadingKind =
  | 'nextRaces'
  | 'userTeams'
  | 'followedTeams'
  | 'leaderboard'
  | 'leagueChanges'
  | 'leagueGraph'
  | 'raceSummary'
  | 'whatsNew'
  | 'simulationStatus'
  | 'simulationRefresh'
  | 'dataStatus'
  | 'bestTeams'
  | 'scenarios'
  | 'raceInfo'
  | 'weather'
  | 'deadline'
  | 'currentTeam'
  | 'liveScore'
  | 'liveLeaderboard'
  | 'guide'
  | 'write';

const copy: Record<ToolLoadingKind, { en: string; he: string }> = {
  nextRaces: { en: 'Loading upcoming races…', he: 'טוען מרוצים קרובים…' },
  userTeams: { en: 'Loading your teams…', he: 'טוען את הקבוצות שלך…' },
  followedTeams: {
    en: 'Loading your tracked teams…',
    he: 'טוען קבוצות במעקב…',
  },
  leaderboard: { en: 'Loading league standings…', he: 'טוען טבלת ליגה…' },
  leagueChanges: {
    en: 'Loading league changes…',
    he: 'טוען שינויים בליגה…',
  },
  leagueGraph: { en: 'Loading league graph…', he: 'טוען גרף ליגה…' },
  raceSummary: { en: 'Creating race summary…', he: 'מכין סיכום מרוץ…' },
  whatsNew: { en: 'Loading release notes…', he: 'טוען עדכונים…' },
  simulationStatus: {
    en: 'Loading simulation status…',
    he: 'טוען מצב סימולציה…',
  },
  simulationRefresh: {
    en: 'Refreshing the latest simulation…',
    he: 'מרענן את הסימולציה העדכנית…',
  },
  dataStatus: { en: 'Checking data status…', he: 'בודק מצב נתונים…' },
  bestTeams: { en: 'Computing best teams…', he: 'מחשב קבוצות מומלצות…' },
  scenarios: { en: 'Computing scenarios…', he: 'מחשב תרחישים…' },
  raceInfo: { en: 'Loading next race info…', he: 'טוען מידע על המרוץ הבא…' },
  weather: { en: 'Fetching weather forecast…', he: 'טוען תחזית מזג אוויר…' },
  deadline: { en: 'Loading deadline…', he: 'טוען מועד נעילה…' },
  currentTeam: { en: 'Loading your current team…', he: 'טוען את הקבוצה הנוכחית…' },
  liveScore: { en: 'Loading live score…', he: 'טוען ניקוד חי…' },
  liveLeaderboard: {
    en: 'Loading live leaderboard…',
    he: 'טוען טבלת ניקוד חי…',
  },
  guide: { en: 'Preparing your pit wall…', he: 'מכין את עמדת הפיקוד שלך…' },
  write: { en: 'Working on it…', he: 'מבצע את הפעולה…' },
};

export function ToolLoading({
  kind,
  englishLabel,
}: {
  kind: ToolLoadingKind;
  englishLabel?: string;
}) {
  const { lang } = useUiLanguage();
  const text = lang === 'he' ? copy[kind].he : (englishLabel ?? copy[kind].en);

  return (
    <div
      dir={directionFor(lang)}
      style={{ padding: 10, color: 'var(--app-muted)' }}
    >
      {text}
    </div>
  );
}

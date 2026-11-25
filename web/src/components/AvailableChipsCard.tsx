import { useRenderTool } from '@copilotkit/react-core/v2';
import { toolRenderParameters } from './toolRenderParameters';
import { ActionChoicesCard, isActionChoices } from './ActionChoicesCard';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';
import { ToolLoading } from './ToolLoading';
import { safeParse } from './safeParse';
import { directionFor, uiLanguageOf } from './uiLanguage';
export type AvailableChipsResult = {
  status: string;
  lang?: string;
  partial?: boolean;
  teams?: Array<{
    teamId?: string | null;
    teamName: string;
    userName?: string;
    teamNo?: number;
    leagues?: Array<{ leagueCode: string; leagueName: string }>;
    availableChips: string[] | null;
    updatedAt: string | null;
  }>;
};
export function AvailableChipsCard({ result }: { result?: AvailableChipsResult }) {
  const lang = uiLanguageOf(result);
  const he = lang === 'he';
  if (isToolErrorResult(result)) return <ToolErrorFallback result={result} />;
  if (isActionChoices(result)) return <ActionChoicesCard result={result} />;
  const title = he ? 'צ׳יפים שלא נוצלו העונה' : 'Chips unused this season';
  const unknownTime = he ? 'מועד העדכון אינו ידוע' : 'Unknown update time';
  const failures: Record<string, string> = {
    no_followed_leagues: he ? 'יש לעקוב תחילה אחרי ליגה.' : 'Follow a league first.',
    not_followed: he ? 'הליגה הזו אינה במעקב.' : 'This league is not followed.',
    empty: he ? 'לא נמצאו קבוצות.' : 'No teams found.',
  };
  return <section dir={directionFor(lang)} aria-label={title} style={{ padding: 16, margin: '8px 0', border: '1px solid var(--app-border)', borderRadius: 12, color: 'var(--app-text)', overflowWrap: 'anywhere' }}>
    <h3>{title}</h3>
    {result?.status !== 'ok' ? <p role="status">{failures[result?.status || ''] || (he ? 'נתוני השימוש בצ׳יפים אינם זמינים. נסה שוב לאחר העדכון הבא.' : 'Chip usage data is unavailable. Try again after the next refresh.')}</p> : <>
      {result.partial && <p role="status">{he ? 'לא ניתן לטעון חלק מנתוני הליגות; מוצגות תוצאות חלקיות.' : 'Some league data could not be loaded; partial results are shown.'}</p>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'start' }}>
          <caption style={{ textAlign: 'start' }}>{he ? 'צ׳יפים שנותרו לפי קבוצה' : 'Remaining chips by team'}</caption>
          <thead><tr>{[he ? 'קבוצה' : 'Team', he ? 'צ׳יפים שנותרו' : 'Remaining chips', he ? 'עודכן' : 'Updated'].map((label) => <th key={label} scope="col" style={{ padding: 8, textAlign: 'start' }}>{label}</th>)}</tr></thead>
          <tbody>{(result.teams || []).map((team, index) => {
            const validTime = team.updatedAt && Number.isFinite(Date.parse(team.updatedAt));
            return <tr key={`${team.teamId}-${index}`}>
              <th scope="row" style={{ padding: 8, textAlign: 'start', verticalAlign: 'top' }}><bdi>{team.teamName}</bdi><small style={{ display: 'block', fontWeight: 400 }}><bdi>{[team.userName, team.teamNo, team.leagues?.map((league) => league.leagueName).join(', ')].filter(Boolean).join(' · ')}</bdi></small></th>
              <td style={{ padding: 8, verticalAlign: 'top' }}>{team.availableChips === null ? (he ? 'נתוני השימוש אינם זמינים' : 'Usage unavailable') : team.availableChips.length ? <bdi>{team.availableChips.join(', ')}</bdi> : (he ? 'לא נותרו צ׳יפים' : 'None remaining')}</td>
              <td style={{ padding: 8, verticalAlign: 'top' }}>{validTime ? <time dir="ltr" dateTime={team.updatedAt!}>{new Intl.DateTimeFormat(he ? 'he-IL' : 'en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date(team.updatedAt!))}</time> : unknownTime}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </>}
  </section>;
}
export function useAvailableChipsAction() {
  useRenderTool({
    name: 'get_available_chips', parameters: toolRenderParameters,
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') return <ToolLoading kind="availableChips" />;
      const parsed = safeParse(result);
      if (isToolErrorResult(parsed)) return <ToolErrorFallback result={parsed} />;
      if (isActionChoices(parsed)) return <ActionChoicesCard result={parsed} />;
      return <AvailableChipsCard result={parsed as AvailableChipsResult | undefined} />;
    },
  });
}

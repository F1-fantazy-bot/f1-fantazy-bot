import { useCopilotAction } from '@copilotkit/react-core';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';
import { directionFor, localeFor, uiLanguageOf, USER_TIME_ZONE } from './uiLanguage';
import { ToolLoading } from './ToolLoading';

type LeaderboardRow = {
  teamId?: string;
  teamName?: string;
  userName?: string;
  teamNo?: number;
  position?: number | null;
  totalPoints?: number;
  totalPriceChange?: number;
  transferPenalty?: number;
  isSelected?: boolean;
};

type LiveScoreLeaderboardResult = {
  lang?: string;
  status?: 'ok' | 'not_followed' | 'not_found' | 'invalid_input';
  leagueCode?: string;
  leagueName?: string;
  matchdayId?: number | null;
  extractedAt?: string | null;
  selectedTeamId?: string | null;
  rows?: LeaderboardRow[];
};

function formatSigned(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  const fixed = value.toFixed(2);
  return value >= 0 ? `+${fixed}` : fixed;
}

function formatExtractedAt(
  iso: string | null | undefined,
  locale: string,
): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: USER_TIME_ZONE,
  });
}

export function LiveScoreLeaderboard({
  result,
}: {
  result?: LiveScoreLeaderboardResult;
}) {
  const lang = uiLanguageOf(result);
  const labels =
    lang === 'he'
      ? {
          invalid: 'חסרים נתונים לבקשת הניקוד החי. נא לציין איזו ליגה.',
          notFollowed: 'אינך עוקב אחר הליגה הזו. יש לעקוב אחריה בטלגרם.',
          notFound:
            'עדיין אין צילום מצב נעול לליגה. יש להמתין לנעילת המקצה הבא.',
          title: 'טבלת ניקוד חי',
          matchday: 'מחזור',
          updated: 'עודכן',
          teamSingular: 'קבוצה',
          teamPlural: 'קבוצות',
          empty: 'עדיין אין קבוצות בליגה.',
          team: 'קבוצה',
          livePoints: 'נקודות חי',
          priceChange: 'שינוי מחיר',
          penalty: 'קנס העברות',
          you: 'אתה',
          penaltyFooter: 'הופעל קנס העברות',
        }
      : {
          invalid: 'Live-score request was missing data. Tell me which league.',
          notFollowed:
            "You don't follow that league. Follow it in Telegram first.",
          notFound:
            'No locked roster snapshot for this league yet. Wait for the next session lock.',
          title: 'Live leaderboard',
          matchday: 'Matchday',
          updated: 'updated',
          teamSingular: 'team',
          teamPlural: 'teams',
          empty: 'No teams in this league yet.',
          team: 'Team',
          livePoints: 'Live pts',
          priceChange: 'Δ price',
          penalty: 'Transfer penalty',
          you: 'YOU',
          penaltyFooter: 'transfer penalty applied',
        };
  if (!result || result.status === 'invalid_input') {
    return (
      <div
        dir={directionFor(lang)}
        style={{ padding: 12, color: 'var(--app-muted)' }}
      >
        {labels.invalid}
      </div>
    );
  }
  if (result.status === 'not_followed') {
    return (
      <div
        dir={directionFor(lang)}
        style={{ padding: 12, color: 'var(--app-danger-text)' }}
      >
        {labels.notFollowed}
      </div>
    );
  }
  if (result.status === 'not_found') {
    return (
      <div
        dir={directionFor(lang)}
        style={{ padding: 12, color: 'var(--app-muted)' }}
      >
        {labels.notFound}
      </div>
    );
  }
  if (result.status !== 'ok') return null;

  const rows = result.rows || [];
  const hasPenalty = rows.some(
    (r) => typeof r.transferPenalty === 'number' && r.transferPenalty > 0,
  );

  return (
    <div
      dir={directionFor(lang)}
      style={{
        margin: '8px 0',
        border: '1px solid var(--app-border)',
        borderRadius: 10,
        background: 'var(--app-surface)',
        overflow: 'hidden',
        fontSize: 13,
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          background: 'var(--app-surface-muted)',
          borderBottom: '1px solid var(--app-border)',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          🏎️ {labels.title} — {result.leagueName ?? result.leagueCode}
        </div>
        <div style={{ color: 'var(--app-muted)', marginTop: 2, fontSize: 12 }}>
          {labels.matchday} {result.matchdayId ?? '?'} · {labels.updated}{' '}
          {formatExtractedAt(result.extractedAt, localeFor(lang))} ·{' '}
          {rows.length}{' '}
          {rows.length === 1 ? labels.teamSingular : labels.teamPlural}
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: 12, color: 'var(--app-muted)' }}>
          {labels.empty}
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr
              style={{
                background: 'var(--app-surface-subtle)',
                textAlign: 'start',
              }}
            >
              <th style={cellHeader}>#</th>
              <th style={cellHeader}>{labels.team}</th>
              <th style={{ ...cellHeader, textAlign: 'end' }}>
                {labels.livePoints}
              </th>
              <th style={{ ...cellHeader, textAlign: 'end' }}>
                {labels.priceChange}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={row.teamId || `${row.userName}-${row.teamNo}`}
                style={{
                  borderTop: '1px solid var(--app-border)',
                  background: row.isSelected
                    ? 'var(--app-primary-surface)'
                    : 'transparent',
                  fontWeight: row.isSelected ? 700 : 500,
                }}
              >
                <td style={cellBody}>{idx + 1}</td>
                <td style={cellBody}>
                  {row.teamName || row.userName || '—'}
                  {typeof row.transferPenalty === 'number' &&
                  row.transferPenalty > 0 ? (
                    <span
                      title={`${labels.penalty}: -${row.transferPenalty}`}
                      style={{ color: 'var(--app-danger-text)', marginLeft: 4 }}
                    >
                      †
                    </span>
                  ) : null}
                  {row.isSelected ? (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 10,
                        color: 'var(--app-primary)',
                        letterSpacing: 0,
                      }}
                    >
                      {labels.you}
                    </span>
                  ) : null}
                </td>
                <td style={{ ...cellBody, textAlign: 'end' }}>
                  {typeof row.totalPoints === 'number'
                    ? row.totalPoints.toFixed(2)
                    : '—'}
                </td>
                <td
                  style={{
                    ...cellBody,
                    textAlign: 'end',
                    color: 'var(--app-muted)',
                  }}
                >
                  {formatSigned(row.totalPriceChange)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {hasPenalty ? (
        <div
          style={{
            padding: '8px 16px',
            color: 'var(--app-muted)',
            fontStyle: 'italic',
            borderTop: '1px solid var(--app-border)',
            fontSize: 12,
          }}
        >
          † {labels.penaltyFooter}
        </div>
      ) : null}
    </div>
  );
}

const cellHeader: React.CSSProperties = {
  padding: '8px 12px',
  fontWeight: 600,
  fontSize: 11,
  textTransform: 'uppercase',
  color: 'var(--app-muted)',
  letterSpacing: 0,
};

const cellBody: React.CSSProperties = {
  padding: '8px 12px',
  verticalAlign: 'top',
};

export function useLiveScoreLeaderboardAction() {
  useCopilotAction({
    name: 'get_live_score_leaderboard',
    description: 'All-teams live-score leaderboard for one followed league.',
    parameters: [],
    available: 'frontend',
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return <ToolLoading kind="liveLeaderboard" />;
      }
      const parsed = typeof result === 'string' ? safeParse(result) : result;
      if (isToolErrorResult(parsed)) {
        return <ToolErrorFallback result={parsed} />;
      }
      return (
        <LiveScoreLeaderboard
          result={parsed as LiveScoreLeaderboardResult | undefined}
        />
      );
    },
  });
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

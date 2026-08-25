import { useCopilotAction } from '@copilotkit/react-core';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';
import { directionFor, localeFor, uiLanguageOf } from './uiLanguage';
import { ToolLoading } from './ToolLoading';

type StandingsRow = {
  position: number | null;
  teamName: string;
  userName: string | null;
  teamNo: number | null;
  teamId: string | null;
  totalScore: number | null;
  gapToLeader: number | null;
  isSelected: boolean;
};

type LeaderboardResult = {
  lang?: string;
  status?: 'ok' | 'not_followed' | 'not_found' | 'invalid_input';
  leagueCode?: string;
  leagueName?: string;
  memberCount?: number | null;
  fetchedAt?: string | null;
  selectedTeamId?: string | null;
  standings?: StandingsRow[];
};

function formatGap(gap: number | null, idx: number): string {
  if (idx === 0) return '';
  if (gap === null) return '';
  if (gap === 0) return '0';
  return String(gap);
}

function formatFetchedAt(
  value: string | null | undefined,
  locale: string,
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function LeaderboardTable({ result }: { result?: LeaderboardResult }) {
  const lang = uiLanguageOf(result);
  const labels =
    lang === 'he'
      ? {
          notFollowed: 'אינך עוקב אחר הליגה',
          followFirst: 'יש לעקוב אחריה תחילה בבוט הטלגרם.',
          notFound: 'עדיין אין טבלה זמינה לליגה',
          tryLater: 'נסה שוב לאחר העדכון הבא.',
          invalid: 'קוד ליגה לא תקין.',
          empty: 'עדיין אין קבוצות בליגה',
          teams: 'קבוצות',
          updated: 'עודכן',
          team: 'קבוצה',
          score: 'ניקוד',
          gap: 'פער',
        }
      : {
          notFollowed: "You don't follow league",
          followFirst: 'Run /follow_league in the Telegram bot first.',
          notFound: 'No standings available yet for league',
          tryLater: 'Try again after the next scrape.',
          invalid: 'Invalid league code.',
          empty: 'No teams in',
          teams: 'teams',
          updated: 'updated',
          team: 'Team',
          score: 'Score',
          gap: 'Gap',
        };
  if (!result) {
    return null;
  }

  if (result.status === 'not_followed') {
    return (
      <div
        dir={directionFor(lang)}
        style={{ padding: 12, color: 'var(--app-warning-text)' }}
      >
        {labels.notFollowed} <code>{result.leagueCode}</code>.{' '}
        {labels.followFirst}
      </div>
    );
  }

  if (result.status === 'not_found') {
    return (
      <div
        dir={directionFor(lang)}
        style={{ padding: 12, color: 'var(--app-warning-text)' }}
      >
        {labels.notFound} <code>{result.leagueCode}</code>. {labels.tryLater}
      </div>
    );
  }

  if (result.status === 'invalid_input') {
    return (
      <div
        dir={directionFor(lang)}
        style={{ padding: 12, color: 'var(--app-danger-text)' }}
      >
        {labels.invalid}
      </div>
    );
  }

  const rows = result.standings ?? [];
  if (rows.length === 0) {
    return (
      <div
        dir={directionFor(lang)}
        style={{ padding: 12, color: 'var(--app-muted)' }}
      >
        {labels.empty} <strong>{result.leagueName}</strong>.
      </div>
    );
  }

  const fetchedAt = formatFetchedAt(result.fetchedAt, localeFor(lang));

  return (
    <div
      dir={directionFor(lang)}
      style={{
        margin: '8px 0',
        border: '1px solid var(--app-border)',
        borderRadius: 10,
        background: 'var(--app-surface)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          background: 'var(--app-surface-muted)',
          borderBottom: '1px solid var(--app-border)',
        }}
      >
        <div
          style={{ fontWeight: 700, fontSize: 14, color: 'var(--app-text)' }}
        >
          🏆 {result.leagueName ?? result.leagueCode}
        </div>
        <div style={{ color: 'var(--app-subtle)', fontSize: 11, marginTop: 2 }}>
          {result.memberCount ?? rows.length} {labels.teams}
          {fetchedAt ? ` · ${labels.updated} ${fetchedAt}` : ''}
        </div>
      </div>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 13,
          color: 'var(--app-text)',
        }}
      >
        <thead>
          <tr
            style={{
              background: 'var(--app-surface-subtle)',
              textAlign: 'start',
            }}
          >
            <th style={{ padding: '6px 12px', width: 50 }}>#</th>
            <th style={{ padding: '6px 12px' }}>{labels.team}</th>
            <th style={{ padding: '6px 12px', textAlign: 'end', width: 90 }}>
              {labels.score}
            </th>
            <th style={{ padding: '6px 12px', textAlign: 'end', width: 70 }}>
              {labels.gap}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const highlight = row.isSelected;
            return (
              <tr
                key={row.teamId ?? `${row.teamName}-${idx}`}
                style={{
                  background: highlight
                    ? 'var(--app-highlight-surface)'
                    : 'transparent',
                  fontWeight: highlight ? 700 : 400,
                  borderTop: idx === 0 ? 'none' : '1px solid var(--app-border)',
                }}
              >
                <td style={{ padding: '6px 12px', color: 'var(--app-subtle)' }}>
                  {row.position ?? '—'}
                </td>
                <td style={{ padding: '6px 12px' }}>{row.teamName}</td>
                <td
                  style={{
                    padding: '6px 12px',
                    textAlign: 'end',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {row.totalScore ?? '—'}
                </td>
                <td
                  style={{
                    padding: '6px 12px',
                    textAlign: 'end',
                    color: 'var(--app-subtle)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatGap(row.gapToLeader, idx)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function useLeaderboardAction() {
  useCopilotAction({
    name: 'get_leaderboard',
    description:
      "Show the standings for one of the user's followed F1 Fantasy leagues.",
    parameters: [],
    available: 'frontend',
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return <ToolLoading kind="leaderboard" />;
      }
      const parsed = typeof result === 'string' ? safeParse(result) : result;
      if (isToolErrorResult(parsed)) {
        return <ToolErrorFallback result={parsed} />;
      }
      return (
        <LeaderboardTable result={parsed as LeaderboardResult | undefined} />
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

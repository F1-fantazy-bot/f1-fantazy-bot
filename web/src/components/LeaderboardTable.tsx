import { useCopilotAction } from '@copilotkit/react-core';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';

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

function formatFetchedAt(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function LeaderboardTable({ result }: { result?: LeaderboardResult }) {
  if (!result) {
    return null;
  }

  if (result.status === 'not_followed') {
    return (
      <div style={{ padding: 12, color: 'var(--app-warning-text)' }}>
        You don't follow league <code>{result.leagueCode}</code>. Run{' '}
        <code>/follow_league</code> in the Telegram bot first.
      </div>
    );
  }

  if (result.status === 'not_found') {
    return (
      <div style={{ padding: 12, color: 'var(--app-warning-text)' }}>
        No standings available yet for league <code>{result.leagueCode}</code>.
        Try again after the next scrape.
      </div>
    );
  }

  if (result.status === 'invalid_input') {
    return (
      <div style={{ padding: 12, color: 'var(--app-danger-text)' }}>
        Invalid league code.
      </div>
    );
  }

  const rows = result.standings ?? [];
  if (rows.length === 0) {
    return (
      <div style={{ padding: 12, color: 'var(--app-muted)' }}>
        No teams in <strong>{result.leagueName}</strong> yet.
      </div>
    );
  }

  const fetchedAt = formatFetchedAt(result.fetchedAt);

  return (
    <div
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
          {result.memberCount ?? rows.length} teams
          {fetchedAt ? ` · updated ${fetchedAt}` : ''}
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
              textAlign: 'left',
            }}
          >
            <th style={{ padding: '6px 12px', width: 50 }}>#</th>
            <th style={{ padding: '6px 12px' }}>Team</th>
            <th style={{ padding: '6px 12px', textAlign: 'right', width: 90 }}>
              Score
            </th>
            <th style={{ padding: '6px 12px', textAlign: 'right', width: 70 }}>
              Gap
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
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {row.totalScore ?? '—'}
                </td>
                <td
                  style={{
                    padding: '6px 12px',
                    textAlign: 'right',
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
        return (
          <div style={{ padding: 10, color: 'var(--app-muted)' }}>
            Loading league standings…
          </div>
        );
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

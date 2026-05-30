import { useCopilotAction } from '@copilotkit/react-core';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';

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

function formatExtractedAt(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function LiveScoreLeaderboard({
  result,
}: {
  result?: LiveScoreLeaderboardResult;
}) {
  if (!result || result.status === 'invalid_input') {
    return (
      <div style={{ padding: 12, color: 'var(--app-muted)' }}>
        Live-score request was missing data. Tell me which league.
      </div>
    );
  }
  if (result.status === 'not_followed') {
    return (
      <div style={{ padding: 12, color: 'var(--app-danger-text)' }}>
        You don't follow that league. Run <code>/follow_league</code> in
        Telegram first.
      </div>
    );
  }
  if (result.status === 'not_found') {
    return (
      <div style={{ padding: 12, color: 'var(--app-muted)' }}>
        No locked roster snapshot for this league yet. Wait for the next session
        lock.
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
          🏎️ Live leaderboard — {result.leagueName ?? result.leagueCode}
        </div>
        <div style={{ color: 'var(--app-muted)', marginTop: 2, fontSize: 12 }}>
          Matchday {result.matchdayId ?? '?'} · updated{' '}
          {formatExtractedAt(result.extractedAt)} · {rows.length} team
          {rows.length === 1 ? '' : 's'}
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: 12, color: 'var(--app-muted)' }}>
          No teams in this league yet.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr
              style={{
                background: 'var(--app-surface-subtle)',
                textAlign: 'left',
              }}
            >
              <th style={cellHeader}>#</th>
              <th style={cellHeader}>Team</th>
              <th style={{ ...cellHeader, textAlign: 'right' }}>Live pts</th>
              <th style={{ ...cellHeader, textAlign: 'right' }}>Δ price</th>
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
                      title={`Transfer penalty: -${row.transferPenalty}`}
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
                      YOU
                    </span>
                  ) : null}
                </td>
                <td style={{ ...cellBody, textAlign: 'right' }}>
                  {typeof row.totalPoints === 'number'
                    ? row.totalPoints.toFixed(2)
                    : '—'}
                </td>
                <td
                  style={{
                    ...cellBody,
                    textAlign: 'right',
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
          † transfer penalty applied
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
        return (
          <div style={{ padding: 10, color: 'var(--app-muted)' }}>
            Loading live leaderboard…
          </div>
        );
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

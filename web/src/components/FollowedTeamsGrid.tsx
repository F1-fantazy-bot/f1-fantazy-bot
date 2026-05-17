import { useCopilotAction } from '@copilotkit/react-core';

type LeagueRow = {
  leagueCode: string;
  leagueName: string;
  position: number | null;
};

type FollowedTeam = {
  teamId: string;
  teamName: string;
  leagues: LeagueRow[];
  isSelected: boolean;
};

type ListFollowedTeamsResult = {
  status?: 'ok' | 'empty';
  teams?: FollowedTeam[];
};

function positionStyle(position: number | null): {
  background: string;
  color: string;
} {
  if (position === 1) return { background: '#fff3c2', color: '#7a5a00' };
  if (position && position <= 3)
    return { background: '#e6f1ff', color: '#0b3e88' };
  return { background: '#f1f3f7', color: '#37404f' };
}

function FollowedTeamsGrid({ result }: { result?: ListFollowedTeamsResult }) {
  if (result?.status === 'empty' || !result?.teams || result.teams.length === 0) {
    return (
      <div style={{ padding: 12, color: '#555' }}>
        No tracked league teams yet. Run <code>/follow_league</code> +{' '}
        <code>/teams_tracker</code> in the Telegram bot first.
      </div>
    );
  }

  return (
    <div
      style={{
        margin: '8px 0',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 10,
      }}
    >
      {result.teams.map((team) => (
        <div
          key={team.teamId}
          style={{
            border: team.isSelected ? '2px solid #2c6fd1' : '1px solid #e2e6ee',
            borderRadius: 10,
            padding: '12px 14px',
            background: '#fff',
            fontSize: 13,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 6,
            }}
          >
            <strong style={{ fontSize: 15 }}>{team.teamName}</strong>
            {team.isSelected ? (
              <span
                style={{
                  fontSize: 11,
                  color: '#1c4f99',
                  fontWeight: 700,
                  letterSpacing: 0.3,
                }}
              >
                ACTIVE
              </span>
            ) : null}
          </div>
          <div style={{ color: '#7d8693', fontSize: 11, marginTop: 2 }}>
            id: <code>{team.teamId}</code>
          </div>
          <div
            style={{
              marginTop: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {team.leagues.length === 0 ? (
              <div style={{ color: '#888', fontSize: 12 }}>
                (no leagues resolved for this team)
              </div>
            ) : (
              team.leagues.map((row) => {
                const pos = row.position;
                const chip = positionStyle(pos);
                return (
                  <div
                    key={`${team.teamId}:${row.leagueCode}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <span style={{ color: '#37404f' }}>{row.leagueName}</span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                        background: chip.background,
                        color: chip.color,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {pos === null ? '—' : `P${pos}`}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function useFollowedTeamsAction() {
  useCopilotAction({
    name: 'list_followed_teams',
    description:
      'List the user\'s followed F1 Fantasy teams enriched with each league they appear in and their current position.',
    parameters: [],
    available: 'frontend',
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return (
          <div style={{ padding: 10, color: '#666' }}>
            Loading your tracked teams…
          </div>
        );
      }
      const parsed = typeof result === 'string' ? safeParse(result) : result;
      return (
        <FollowedTeamsGrid
          result={parsed as ListFollowedTeamsResult | undefined}
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

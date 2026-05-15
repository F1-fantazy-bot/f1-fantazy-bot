import { useCopilotAction } from '@copilotkit/react-core';

type UserTeam = {
  teamId: string;
  teamName: string;
  isLeague: boolean;
  isSelected: boolean;
  chip: string | null;
  drivers: string[];
  constructors: string[];
  boost: string | null;
  freeTransfers: number | null;
  costCapRemaining: number | null;
};

type ListUserTeamsResult = {
  teams?: UserTeam[];
};

function chipBadge(chip: string | null) {
  if (!chip) return null;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: '#fff4d6',
        color: '#7a4a00',
        marginLeft: 6,
      }}
    >
      {chip.replace('_', ' ').toLowerCase()}
    </span>
  );
}

function UserTeamsList({ result }: { result?: ListUserTeamsResult }) {
  const teams = result?.teams ?? [];
  if (teams.length === 0) {
    return (
      <div style={{ padding: 12, color: '#555' }}>
        No tracked teams. Run <code>/follow_league</code> + <code>/teams_tracker</code> in the
        Telegram bot first.
      </div>
    );
  }

  return (
    <div
      style={{
        margin: '8px 0',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 8,
      }}
    >
      {teams.map((team) => (
        <div
          key={team.teamId}
          style={{
            border: team.isSelected ? '2px solid #2c6fd1' : '1px solid #e2e6ee',
            borderRadius: 8,
            padding: '10px 12px',
            background: '#fff',
            fontSize: 13,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 15 }}>{team.teamName}</strong>
            {team.isSelected ? (
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 11,
                  color: '#1c4f99',
                  fontWeight: 600,
                }}
              >
                ACTIVE
              </span>
            ) : null}
            {chipBadge(team.chip)}
          </div>
          <div style={{ color: '#666', fontSize: 11, marginTop: 2 }}>
            id: <code>{team.teamId}</code>
            {team.isLeague ? ' · league' : ' · screenshot'}
          </div>
          <div style={{ marginTop: 6, color: '#444' }}>
            <div>
              <span style={{ color: '#888', fontSize: 11 }}>Drivers: </span>
              {team.drivers.length > 0 ? team.drivers.join(', ') : '—'}
            </div>
            <div>
              <span style={{ color: '#888', fontSize: 11 }}>Constructors: </span>
              {team.constructors.length > 0 ? team.constructors.join(', ') : '—'}
            </div>
            <div>
              <span style={{ color: '#888', fontSize: 11 }}>Boost: </span>
              {team.boost ?? '—'}
            </div>
            <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
              {team.freeTransfers != null ? `${team.freeTransfers} free transfers` : ''}
              {team.costCapRemaining != null
                ? ` · ${team.costCapRemaining.toFixed?.(1) ?? team.costCapRemaining} cap left`
                : ''}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function useUserTeamsAction() {
  useCopilotAction({
    name: 'list_user_teams',
    description:
      'List the teams the user is tracking. Returns teamId + teamName + roster summary.',
    parameters: [],
    available: 'frontend',
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return (
          <div style={{ padding: 10, color: '#666' }}>
            Loading your teams…
          </div>
        );
      }
      const parsed = typeof result === 'string' ? safeParse(result) : result;
      return <UserTeamsList result={parsed as ListUserTeamsResult | undefined} />;
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

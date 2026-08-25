import { useCopilotAction } from '@copilotkit/react-core';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';
import { directionFor, uiLanguageOf } from './uiLanguage';
import { ToolLoading } from './ToolLoading';

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
  lang?: string;
  status?: 'ok' | 'empty';
  teams?: FollowedTeam[];
};

function positionStyle(position: number | null): {
  background: string;
  color: string;
} {
  if (position === 1)
    return {
      background: 'var(--app-warning-surface)',
      color: 'var(--app-warning-text)',
    };
  if (position && position <= 3)
    return {
      background: 'var(--app-primary-surface)',
      color: 'var(--app-primary-strong)',
    };
  return {
    background: 'var(--app-control-bg)',
    color: 'var(--app-control-text)',
  };
}

export function FollowedTeamsGrid({
  result,
}: {
  result?: ListFollowedTeamsResult;
}) {
  const lang = uiLanguageOf(result);
  const labels =
    lang === 'he'
      ? {
          empty:
            'עדיין אין קבוצות ליגה במעקב. יש להשתמש ב-/follow_league וב-/teams_tracker בבוט הטלגרם.',
          active: 'פעילה',
          noLeagues: '(לא נמצאו ליגות עבור קבוצה זו)',
          positionPrefix: 'מ',
        }
      : {
          empty:
            'No tracked league teams yet. Run /follow_league + /teams_tracker in the Telegram bot first.',
          active: 'ACTIVE',
          noLeagues: '(no leagues resolved for this team)',
          positionPrefix: 'P',
        };
  if (
    result?.status === 'empty' ||
    !result?.teams ||
    result.teams.length === 0
  ) {
    return (
      <div
        dir={directionFor(lang)}
        style={{ padding: 12, color: 'var(--app-muted)' }}
      >
        {labels.empty}
      </div>
    );
  }

  return (
    <div
      dir={directionFor(lang)}
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
            border: team.isSelected
              ? '2px solid var(--app-primary)'
              : '1px solid var(--app-border)',
            borderRadius: 10,
            padding: '12px 14px',
            background: 'var(--app-surface)',
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
                  color: 'var(--app-primary)',
                  fontWeight: 700,
                  letterSpacing: 0,
                }}
              >
                {labels.active}
              </span>
            ) : null}
          </div>
          <div
            style={{ color: 'var(--app-subtle)', fontSize: 11, marginTop: 2 }}
          >
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
              <div style={{ color: 'var(--app-subtle)', fontSize: 12 }}>
                {labels.noLeagues}
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
                    <span style={{ color: 'var(--app-control-text)' }}>
                      {row.leagueName}
                    </span>
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
                      {pos === null ? '—' : `${labels.positionPrefix}${pos}`}
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
      "List the user's followed F1 Fantasy teams enriched with each league they appear in and their current position.",
    parameters: [],
    available: 'frontend',
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return <ToolLoading kind="followedTeams" />;
      }
      const parsed = typeof result === 'string' ? safeParse(result) : result;
      if (isToolErrorResult(parsed)) {
        return <ToolErrorFallback result={parsed} />;
      }
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

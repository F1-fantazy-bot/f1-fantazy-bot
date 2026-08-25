import { useCopilotAction } from '@copilotkit/react-core';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';
import { directionFor, uiLanguageOf, type UiLanguage } from './uiLanguage';
import { ToolLoading } from './ToolLoading';

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
  lang?: string;
  teams?: UserTeam[];
};

function chipBadge(chip: string | null, lang: UiLanguage) {
  if (!chip) return null;
  const chipLabels: Record<string, string> =
    lang === 'he'
      ? {
          EXTRA_BOOST: 'אקסטרה בוסט',
          WILDCARD: 'ווילדקארד',
          LIMITLESS: 'ללא הגבלה',
          WITHOUT_CHIP: "ללא צ'יפ",
        }
      : {};
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: 'var(--app-warning-surface)',
        color: 'var(--app-warning-text)',
        marginLeft: 6,
      }}
    >
      {chipLabels[chip] ?? chip.replace('_', ' ').toLowerCase()}
    </span>
  );
}

export function UserTeamsList({ result }: { result?: ListUserTeamsResult }) {
  const lang = uiLanguageOf(result);
  const labels =
    lang === 'he'
      ? {
          empty:
            'אין קבוצות במעקב. יש להשתמש ב-/follow_league וב-/teams_tracker בבוט הטלגרם.',
          active: 'פעילה',
          league: 'ליגה',
          screenshot: 'צילום מסך',
          drivers: 'נהגים',
          constructors: 'קבוצות',
          boost: 'קפטן',
          freeTransfers: 'העברות חינם',
          capLeft: 'נותרו בתקציב',
        }
      : {
          empty:
            'No tracked teams. Run /follow_league + /teams_tracker in the Telegram bot first.',
          active: 'ACTIVE',
          league: 'league',
          screenshot: 'screenshot',
          drivers: 'Drivers',
          constructors: 'Constructors',
          boost: 'Boost',
          freeTransfers: 'free transfers',
          capLeft: 'cap left',
        };
  const teams = result?.teams ?? [];
  if (teams.length === 0) {
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
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 8,
      }}
    >
      {teams.map((team) => (
        <div
          key={team.teamId}
          style={{
            border: team.isSelected
              ? '2px solid var(--app-primary)'
              : '1px solid var(--app-border)',
            borderRadius: 8,
            padding: '10px 12px',
            background: 'var(--app-surface)',
            fontSize: 13,
          }}
        >
          <div
            style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}
          >
            <strong style={{ fontSize: 15 }}>{team.teamName}</strong>
            {team.isSelected ? (
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 11,
                  color: 'var(--app-primary)',
                  fontWeight: 600,
                }}
              >
                {labels.active}
              </span>
            ) : null}
            {chipBadge(team.chip, lang)}
          </div>
          <div
            style={{ color: 'var(--app-muted)', fontSize: 11, marginTop: 2 }}
          >
            id: <code>{team.teamId}</code>
            {team.isLeague
              ? ` · ${labels.league}`
              : ` · ${labels.screenshot}`}
          </div>
          <div style={{ marginTop: 6, color: 'var(--app-muted)' }}>
            <div>
              <span style={{ color: 'var(--app-subtle)', fontSize: 11 }}>
                {labels.drivers}:{' '}
              </span>
              {team.drivers.length > 0 ? team.drivers.join(', ') : '—'}
            </div>
            <div>
              <span style={{ color: 'var(--app-subtle)', fontSize: 11 }}>
                {labels.constructors}:{' '}
              </span>
              {team.constructors.length > 0
                ? team.constructors.join(', ')
                : '—'}
            </div>
            <div>
              <span style={{ color: 'var(--app-subtle)', fontSize: 11 }}>
                {labels.boost}:{' '}
              </span>
              {team.boost ?? '—'}
            </div>
            <div
              style={{ color: 'var(--app-muted)', fontSize: 12, marginTop: 4 }}
            >
              {team.freeTransfers != null
                ? `${team.freeTransfers} ${labels.freeTransfers}`
                : ''}
              {team.costCapRemaining != null
                ? ` · ${team.costCapRemaining.toFixed?.(1) ?? team.costCapRemaining} ${labels.capLeft}`
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
        return <ToolLoading kind="userTeams" />;
      }
      const parsed = typeof result === 'string' ? safeParse(result) : result;
      if (isToolErrorResult(parsed)) {
        return <ToolErrorFallback result={parsed} />;
      }
      return (
        <UserTeamsList result={parsed as ListUserTeamsResult | undefined} />
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

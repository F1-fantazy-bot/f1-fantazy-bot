import { useCopilotAction } from '@copilotkit/react-core';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';

type BestTeamRow = {
  row: number;
  drivers: string[];
  constructors: string[];
  boostDriver: string;
  extraBoostDriver: string | null;
  totalPrice: number;
  transfersNeeded: number;
  penalty: number;
  projectedPoints: number;
  budgetAdjustedPoints: number | null;
  expectedPriceChange: number | null;
};

type GetBestTeamsOkResult = {
  status: 'ok';
  teamId: string;
  teamName: string;
  chip: string | null;
  rankBy: 'points' | 'budget_adjusted' | null;
  budgetChangePointsPerMillion: number;
  filters: {
    mustIncludeDrivers: string[];
    mustExcludeDrivers: string[];
    mustIncludeConstructors: string[];
    mustExcludeConstructors: string[];
  };
  bestTeams: BestTeamRow[];
};

type GetBestTeamsErrorResult = {
  status:
    | 'no_teams'
    | 'ambiguous_team'
    | 'unknown_team'
    | 'missing_cache'
    | 'invalid_data'
    | 'missing_remaining_race_count'
    | 'unknown_filter';
  teamId?: string;
  teamIds?: string[];
  teamName?: string;
  filters?: {
    mustIncludeDrivers?: { resolved: string[]; unknown: string[] };
    mustExcludeDrivers?: { resolved: string[]; unknown: string[] };
    mustIncludeConstructors?: { resolved: string[]; unknown: string[] };
    mustExcludeConstructors?: { resolved: string[]; unknown: string[] };
  };
};

type GetBestTeamsResult = GetBestTeamsOkResult | GetBestTeamsErrorResult;

const STATUS_MESSAGES: Record<GetBestTeamsErrorResult['status'], string> = {
  no_teams:
    'No teams found for this user. Follow a league and pick teams to track first.',
  ambiguous_team:
    'You have multiple teams — please tell me which one (use the teamName).',
  unknown_team:
    'I could not find that team. Try `list user teams` to see the options.',
  missing_cache:
    'The bot does not have cached drivers/constructors/current-team data yet. Send the screenshots first.',
  invalid_data:
    'The cached data looks malformed (wrong driver/constructor counts). Please re-upload.',
  missing_remaining_race_count:
    'Remaining race count is unavailable right now. Switch to Pure Points ranking or try again later.',
  unknown_filter:
    'I could not resolve some of the driver/constructor names you mentioned.',
};

function chipLabel(chip: string | null | undefined): string {
  if (!chip) return 'No chip';
  switch (chip) {
    case 'EXTRA_BOOST':
      return 'Extra Boost';
    case 'WILDCARD':
      return 'Wildcard';
    case 'LIMITLESS':
      return 'Limitless';
    case 'WITHOUT_CHIP':
      return 'No chip';
    default:
      return chip;
  }
}

function rankByLabel(
  rankBy: GetBestTeamsOkResult['rankBy'],
  budgetChangePointsPerMillion: number,
): string {
  if (rankBy === 'points') return 'projected points';
  if (rankBy === 'budget_adjusted') return 'budget-adjusted points';
  return budgetChangePointsPerMillion > 0
    ? 'budget-adjusted points'
    : 'projected points';
}

function BestTeamsError({ result }: { result: GetBestTeamsErrorResult }) {
  const base = STATUS_MESSAGES[result.status] || `Error: ${result.status}`;
  const unknown =
    result.status === 'unknown_filter' && result.filters
      ? [
          ...(result.filters.mustIncludeDrivers?.unknown || []),
          ...(result.filters.mustExcludeDrivers?.unknown || []),
          ...(result.filters.mustIncludeConstructors?.unknown || []),
          ...(result.filters.mustExcludeConstructors?.unknown || []),
        ]
      : [];

  return (
    <div
      style={{
        padding: 12,
        border: '1px solid var(--app-danger-border)',
        borderRadius: 8,
        background: 'var(--app-danger-surface)',
        color: 'var(--app-danger-text)',
        fontSize: 14,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        Could not compute best teams
      </div>
      <div>{base}</div>
      {unknown.length > 0 ? (
        <div style={{ marginTop: 6, fontSize: 13 }}>
          Unresolved: {unknown.join(', ')}
        </div>
      ) : null}
      {result.teamIds && result.teamIds.length > 1 ? (
        <div style={{ marginTop: 6, fontSize: 13 }}>
          Candidates: {result.teamIds.join(', ')}
        </div>
      ) : null}
    </div>
  );
}

function HighlightedCode({
  code,
  isIncluded,
  isCaptain,
  isMega,
}: {
  code: string;
  isIncluded: boolean;
  isCaptain: boolean;
  isMega: boolean;
}) {
  const style: React.CSSProperties = {
    display: 'inline-block',
    padding: '2px 6px',
    margin: '2px 3px 2px 0',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
    border: '1px solid var(--app-border)',
    background: isIncluded
      ? 'var(--app-success-surface)'
      : 'var(--app-surface-subtle)',
    color: isIncluded ? 'var(--app-success-text)' : 'var(--app-text)',
  };
  return (
    <span style={style}>
      {code}
      {isMega ? ' ⭐⭐' : isCaptain ? ' ⭐' : ''}
    </span>
  );
}

function BestTeamsTable({ result }: { result?: GetBestTeamsResult }) {
  if (!result) return null;
  if (result.status !== 'ok') {
    return <BestTeamsError result={result} />;
  }
  if (!result.bestTeams || result.bestTeams.length === 0) {
    return (
      <div style={{ padding: 12, color: 'var(--app-muted)' }}>
        No teams match those filters.
      </div>
    );
  }

  const includeDrivers = new Set(result.filters.mustIncludeDrivers);
  const includeConstructors = new Set(result.filters.mustIncludeConstructors);
  const showBudgetAdjusted = result.budgetChangePointsPerMillion > 0;

  return (
    <div
      style={{
        margin: '8px 0',
        border: '1px solid var(--app-border)',
        borderRadius: 8,
        background: 'var(--app-surface)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--app-border)',
          background: 'var(--app-surface-muted)',
          fontSize: 14,
        }}
      >
        <div style={{ fontWeight: 600 }}>Best teams — {result.teamName}</div>
        <div style={{ color: 'var(--app-muted)', fontSize: 12, marginTop: 2 }}>
          Ranked by{' '}
          {rankByLabel(result.rankBy, result.budgetChangePointsPerMillion)}
          {' · '}
          Chip: {chipLabel(result.chip)}
          {includeDrivers.size > 0
            ? ` · must include ${[...includeDrivers].join(', ')}`
            : ''}
          {result.filters.mustExcludeDrivers.length > 0
            ? ` · must exclude ${result.filters.mustExcludeDrivers.join(', ')}`
            : ''}
          {includeConstructors.size > 0
            ? ` · constructor includes ${[...includeConstructors].join(', ')}`
            : ''}
          {result.filters.mustExcludeConstructors.length > 0
            ? ` · constructor excludes ${result.filters.mustExcludeConstructors.join(', ')}`
            : ''}
        </div>
      </div>
      <table
        style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}
      >
        <thead>
          <tr
            style={{
              background: 'var(--app-surface-subtle)',
              textAlign: 'left',
            }}
          >
            <th style={cellHeader}>#</th>
            <th style={cellHeader}>Drivers</th>
            <th style={cellHeader}>Constructors</th>
            <th style={cellHeader}>Price</th>
            <th style={cellHeader}>Pts</th>
            {showBudgetAdjusted ? <th style={cellHeader}>Budget-adj</th> : null}
            <th style={cellHeader}>Tr</th>
            <th style={cellHeader}>Δ price</th>
          </tr>
        </thead>
        <tbody>
          {result.bestTeams.map((team) => (
            <tr
              key={team.row}
              style={{ borderTop: '1px solid var(--app-border)' }}
            >
              <td style={cellBody}>
                <strong>{team.row}</strong>
                {team.transfersNeeded === 0 ? (
                  <div
                    style={{ fontSize: 11, color: 'var(--app-success-text)' }}
                  >
                    current
                  </div>
                ) : null}
              </td>
              <td style={cellBody}>
                {team.drivers.map((code) => (
                  <HighlightedCode
                    key={code}
                    code={code}
                    isIncluded={includeDrivers.has(code)}
                    isCaptain={code === team.boostDriver}
                    isMega={code === team.extraBoostDriver}
                  />
                ))}
              </td>
              <td style={cellBody}>
                {team.constructors.map((code) => (
                  <HighlightedCode
                    key={code}
                    code={code}
                    isIncluded={includeConstructors.has(code)}
                    isCaptain={false}
                    isMega={false}
                  />
                ))}
              </td>
              <td style={cellBody}>{team.totalPrice.toFixed(1)}</td>
              <td style={cellBody}>
                <strong>{team.projectedPoints.toFixed(1)}</strong>
                {team.penalty > 0 ? (
                  <div
                    style={{ fontSize: 11, color: 'var(--app-danger-text)' }}
                  >
                    -{team.penalty} pen
                  </div>
                ) : null}
              </td>
              {showBudgetAdjusted ? (
                <td style={cellBody}>
                  {team.budgetAdjustedPoints != null
                    ? team.budgetAdjustedPoints.toFixed(1)
                    : '—'}
                </td>
              ) : null}
              <td style={cellBody}>{team.transfersNeeded}</td>
              <td style={cellBody}>
                {team.expectedPriceChange != null
                  ? `${team.expectedPriceChange >= 0 ? '+' : ''}${team.expectedPriceChange.toFixed(2)}`
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div
        style={{
          padding: '6px 14px',
          borderTop: '1px solid var(--app-border)',
          fontSize: 12,
          color: 'var(--app-muted)',
        }}
      >
        ⭐ captain · ⭐⭐ mega captain · green = required by filter
      </div>
    </div>
  );
}

const cellHeader: React.CSSProperties = {
  padding: '8px 12px',
  fontWeight: 600,
  fontSize: 12,
  textTransform: 'uppercase',
  color: 'var(--app-muted)',
  letterSpacing: 0,
};

const cellBody: React.CSSProperties = {
  padding: '10px 12px',
  verticalAlign: 'top',
};

export function useBestTeamsAction() {
  useCopilotAction({
    name: 'get_best_teams',
    description:
      'Compute the top scoring fantasy team combinations for the user with optional driver/constructor filters.',
    parameters: [],
    available: 'frontend',
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return (
          <div style={{ padding: 10, color: 'var(--app-muted)' }}>
            Computing best teams…
          </div>
        );
      }
      const parsed = typeof result === 'string' ? safeParse(result) : result;
      if (isToolErrorResult(parsed)) {
        return <ToolErrorFallback result={parsed} />;
      }
      return (
        <BestTeamsTable result={parsed as GetBestTeamsResult | undefined} />
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

import { useCopilotAction } from '@copilotkit/react-core';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';
import { ToolLoading } from './ToolLoading';
import './BestTeamsTable.css';

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
  lang?: string;
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
  lang?: string;
  status:
    | 'no_teams'
    | 'ambiguous_team'
    | 'unknown_team'
    | 'missing_cache'
    | 'invalid_data'
    | 'missing_remaining_race_count'
    | 'unknown_filter'
    | 'projection_mismatch'
    | 'missing_weekend_format';
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
type UiLanguage = 'en' | 'he';

const copy = {
  en: {
    title: 'Best teams',
    rankedBy: 'Ranked by',
    projectedPoints: 'projected points',
    budgetAdjustedPoints: 'budget-adjusted points',
    chip: 'Chip',
    noChip: 'No chip',
    mustInclude: 'must include',
    mustExclude: 'must exclude',
    constructorIncludes: 'constructor includes',
    constructorExcludes: 'constructor excludes',
    drivers: 'Drivers',
    constructors: 'Constructors',
    price: 'Price',
    points: 'Pts',
    budgetAdjustedShort: 'Budget-adj',
    transfers: 'Tr',
    priceChange: 'Δ price',
    current: 'current',
    penalty: 'pen',
    captain: 'captain',
    megaCaptain: 'mega captain',
    filterLegend: 'green = required by filter',
    empty: 'No teams match those filters.',
    errorTitle: 'Could not compute best teams',
    unresolved: 'Unresolved',
    candidates: 'Candidates',
    statuses: {
      no_teams:
        'No teams found for this user. Follow a league and pick teams to track first.',
      ambiguous_team:
        'You have multiple teams — please tell me which one (use the teamName).',
      unknown_team:
        'I could not find that team. Ask to list your teams to see the options.',
      missing_cache:
        'The bot does not have cached drivers, constructors, or current-team data yet.',
      invalid_data:
        'The cached data looks malformed. Please upload it again.',
      missing_remaining_race_count:
        'Remaining race count is unavailable. Switch to Pure Points ranking or try later.',
      unknown_filter:
        'I could not resolve some driver or constructor names.',
      projection_mismatch:
        'Projection data does not match the active player list. Try again after the next data refresh.',
      missing_weekend_format:
        'The next-race weekend format is unavailable. Try again after race data refreshes.',
    },
  },
  he: {
    title: 'הקבוצות הטובות ביותר',
    rankedBy: 'מדורג לפי',
    projectedPoints: 'נקודות חזויות',
    budgetAdjustedPoints: 'נקודות מותאמות תקציב',
    chip: "צ'יפ",
    noChip: "ללא צ'יפ",
    mustInclude: 'חובה לכלול',
    mustExclude: 'לא לכלול',
    constructorIncludes: 'קבוצות חובה',
    constructorExcludes: 'קבוצות לא לכלול',
    drivers: 'נהגים',
    constructors: 'קבוצות',
    price: 'מחיר',
    points: "נק'",
    budgetAdjustedShort: 'מותאם תקציב',
    transfers: 'העברות',
    priceChange: 'שינוי מחיר',
    current: 'נוכחית',
    penalty: 'קנס',
    captain: 'קפטן',
    megaCaptain: 'מגה קפטן',
    filterLegend: 'ירוק = חובה לפי הסינון',
    empty: 'אין קבוצות שמתאימות לסינון.',
    errorTitle: 'לא ניתן לחשב את הקבוצות הטובות ביותר',
    unresolved: 'לא זוהו',
    candidates: 'אפשרויות',
    statuses: {
      no_teams: 'לא נמצאו קבוצות. יש לעקוב אחר ליגה ולבחור קבוצות למעקב.',
      ambiguous_team: 'יש לך כמה קבוצות — נא לציין איזו קבוצה.',
      unknown_team: 'לא הצלחתי למצוא את הקבוצה. בקש להציג את הקבוצות שלך.',
      missing_cache: 'נתוני הנהגים, הקבוצות או הקבוצה הנוכחית אינם זמינים.',
      invalid_data: 'הנתונים השמורים אינם תקינים. יש להעלות אותם מחדש.',
      missing_remaining_race_count:
        'מספר המרוצים שנותרו אינו זמין. עבור לדירוג נקודות בלבד או נסה מאוחר יותר.',
      unknown_filter: 'לא הצלחתי לזהות חלק משמות הנהגים או הקבוצות.',
      projection_mismatch:
        'נתוני התחזית אינם תואמים לרשימת המשתתפים הפעילים. נסה שוב לאחר עדכון הנתונים.',
      missing_weekend_format:
        'פורמט סוף השבוע של המרוץ הבא אינו זמין. נסה שוב לאחר עדכון נתוני המרוץ.',
    },
  },
} as const;

function chipLabel(
  chip: string | null | undefined,
  lang: UiLanguage,
): string {
  const labels = copy[lang];
  if (!chip) return labels.noChip;
  switch (chip) {
    case 'EXTRA_BOOST':
      return lang === 'he' ? 'אקסטרה בוסט' : 'Extra Boost';
    case 'WILDCARD':
      return lang === 'he' ? 'ווילדקארד' : 'Wildcard';
    case 'LIMITLESS':
      return lang === 'he' ? 'ללא הגבלה' : 'Limitless';
    case 'WITHOUT_CHIP':
      return labels.noChip;
    default:
      return chip;
  }
}

function rankByLabel(
  rankBy: GetBestTeamsOkResult['rankBy'],
  budgetChangePointsPerMillion: number,
  lang: UiLanguage,
): string {
  const labels = copy[lang];
  if (rankBy === 'points') return labels.projectedPoints;
  if (rankBy === 'budget_adjusted') return labels.budgetAdjustedPoints;
  return budgetChangePointsPerMillion > 0
    ? labels.budgetAdjustedPoints
    : labels.projectedPoints;
}

function BestTeamsError({ result }: { result: GetBestTeamsErrorResult }) {
  const lang: UiLanguage = result.lang === 'he' ? 'he' : 'en';
  const labels = copy[lang];
  const base = labels.statuses[result.status] || `Error: ${result.status}`;
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
      dir={lang === 'he' ? 'rtl' : 'ltr'}
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
        {labels.errorTitle}
      </div>
      <div>{base}</div>
      {unknown.length > 0 ? (
        <div style={{ marginTop: 6, fontSize: 13 }}>
          {labels.unresolved}: {unknown.join(', ')}
        </div>
      ) : null}
      {result.teamIds && result.teamIds.length > 1 ? (
        <div style={{ marginTop: 6, fontSize: 13 }}>
          {labels.candidates}: {result.teamIds.join(', ')}
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
    whiteSpace: 'nowrap',
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

export function BestTeamsTable({ result }: { result?: GetBestTeamsResult }) {
  if (!result) return null;
  if (result.status !== 'ok') {
    return <BestTeamsError result={result} />;
  }
  const lang: UiLanguage = result.lang === 'he' ? 'he' : 'en';
  const labels = copy[lang];
  if (!result.bestTeams || result.bestTeams.length === 0) {
    return (
      <div
        dir={lang === 'he' ? 'rtl' : 'ltr'}
        style={{ padding: 12, color: 'var(--app-muted)' }}
      >
        {labels.empty}
      </div>
    );
  }

  const includeDrivers = new Set(result.filters.mustIncludeDrivers);
  const includeConstructors = new Set(result.filters.mustIncludeConstructors);
  const showBudgetAdjusted = result.budgetChangePointsPerMillion > 0;

  return (
    <div
      className="best-teams"
      dir={lang === 'he' ? 'rtl' : 'ltr'}
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
        <div style={{ fontWeight: 600 }}>
          {labels.title} — {result.teamName}
        </div>
        <div style={{ color: 'var(--app-muted)', fontSize: 12, marginTop: 2 }}>
          {labels.rankedBy}{' '}
          {rankByLabel(
            result.rankBy,
            result.budgetChangePointsPerMillion,
            lang,
          )}
          {' · '}
          {labels.chip}: {chipLabel(result.chip, lang)}
          {includeDrivers.size > 0
            ? ` · ${labels.mustInclude} ${[...includeDrivers].join(', ')}`
            : ''}
          {result.filters.mustExcludeDrivers.length > 0
            ? ` · ${labels.mustExclude} ${result.filters.mustExcludeDrivers.join(', ')}`
            : ''}
          {includeConstructors.size > 0
            ? ` · ${labels.constructorIncludes} ${[...includeConstructors].join(', ')}`
            : ''}
          {result.filters.mustExcludeConstructors.length > 0
            ? ` · ${labels.constructorExcludes} ${result.filters.mustExcludeConstructors.join(', ')}`
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
              textAlign: 'start',
            }}
          >
            <th scope="col" style={cellHeader}>
              #
            </th>
            <th scope="col" style={cellHeader}>
              {labels.drivers}
            </th>
            <th scope="col" style={cellHeader}>
              {labels.constructors}
            </th>
            <th scope="col" style={cellHeader}>
              {labels.price}
            </th>
            <th scope="col" style={cellHeader}>
              {labels.points}
            </th>
            {showBudgetAdjusted ? (
              <th scope="col" style={cellHeader}>
                {labels.budgetAdjustedShort}
              </th>
            ) : null}
            <th scope="col" style={cellHeader}>
              {labels.transfers}
            </th>
            <th scope="col" style={cellHeader}>
              {labels.priceChange}
            </th>
          </tr>
        </thead>
        <tbody>
          {result.bestTeams.map((team) => (
            <tr
              key={team.row}
              style={{ borderTop: '1px solid var(--app-border)' }}
            >
              <td className="best-teams__rank" style={cellBody}>
                <strong>#{team.row}</strong>
                {team.transfersNeeded === 0 ? (
                  <div
                    style={{ fontSize: 11, color: 'var(--app-success-text)' }}
                  >
                    {labels.current}
                  </div>
                ) : null}
              </td>
              <td className="best-teams__roster" style={cellBody}>
                <span className="best-teams__label" aria-hidden="true">
                  {labels.drivers}
                </span>
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
              <td className="best-teams__roster" style={cellBody}>
                <span className="best-teams__label" aria-hidden="true">
                  {labels.constructors}
                </span>
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
              <td style={cellBody}>
                <span className="best-teams__label" aria-hidden="true">
                  {labels.price}
                </span>
                {team.totalPrice.toFixed(1)}
              </td>
              <td style={cellBody}>
                <span className="best-teams__label" aria-hidden="true">
                  {labels.points}
                </span>
                <strong>{team.projectedPoints.toFixed(1)}</strong>
                {team.penalty > 0 ? (
                  <div
                    style={{ fontSize: 11, color: 'var(--app-danger-text)' }}
                  >
                    -{team.penalty} {labels.penalty}
                  </div>
                ) : null}
              </td>
              {showBudgetAdjusted ? (
                <td style={cellBody}>
                  <span className="best-teams__label" aria-hidden="true">
                    {labels.budgetAdjustedShort}
                  </span>
                  {team.budgetAdjustedPoints != null
                    ? team.budgetAdjustedPoints.toFixed(1)
                    : '—'}
                </td>
              ) : null}
              <td style={cellBody}>
                <span className="best-teams__label" aria-hidden="true">
                  {labels.transfers}
                </span>
                {team.transfersNeeded}
              </td>
              <td style={cellBody}>
                <span className="best-teams__label" aria-hidden="true">
                  {labels.priceChange}
                </span>
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
        ⭐ {labels.captain} · ⭐⭐ {labels.megaCaptain} ·{' '}
        {labels.filterLegend}
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
        return <ToolLoading kind="bestTeams" />;
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

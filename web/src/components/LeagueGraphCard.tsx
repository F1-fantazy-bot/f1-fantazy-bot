import { useCopilotAction } from '@copilotkit/react-core';
import {
  UseAgentUpdate,
  useAgent,
  useCopilotKit,
} from '@copilotkit/react-core/v2';
import { useId, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  isAgentRunActive,
  releaseAgentRun,
  tryAcquireAgentRun,
} from './agentRunLock';
import { isToolErrorResult, ToolErrorFallback } from './ToolErrorFallback';
import { safeParse } from './safeParse';
import { ToolLoading } from './ToolLoading';
import { directionFor, uiLanguageOf } from './uiLanguage';

type GraphType = 'gap' | 'standings' | 'budget';

type LeagueChoice = {
  leagueCode: string;
  leagueName: string;
};

type GraphChip = {
  name: string;
  emoji: string;
  label: string;
};

type GraphPoint = {
  matchdayId: number | null;
  label: string;
  value: number | null;
  chip: GraphChip | null;
};

type GraphSeries = {
  teamId: string | null;
  teamName: string;
  userName: string | null;
  teamNo: number | string | null;
  position: number | null;
  color: string;
  isSelected: boolean;
  points: GraphPoint[];
};

type GraphMatchday = {
  key: string;
  matchdayId: number | null;
  label: string;
};

export type LeagueGraphResult = {
  status?:
    | 'select_league'
    | 'select_graph_type'
    | 'no_followed_leagues'
    | 'not_followed'
    | 'not_found'
    | 'no_data'
    | 'ok'
    | 'error';
  lang?: string;
  leagueCode?: string | null;
  leagueName?: string | null;
  graphType?: GraphType | null;
  graphTypes?: GraphType[];
  leagues?: LeagueChoice[];
  matchdays?: GraphMatchday[];
  series?: GraphSeries[];
  maxRank?: number;
};

function seriesKey(series: GraphSeries, index: number): string {
  return series.teamId || `${series.userName || series.teamName}-${series.teamNo ?? index}`;
}

function graphValue(graphType: GraphType, value: number | null): string {
  if (value === null) return '—';
  if (graphType === 'budget') return `$${value.toFixed(1)}M`;
  if (graphType === 'standings') return `#${value}`;

  return `${value} pts`;
}

function tooltipOrder(graphType: GraphType, value: unknown): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return Number.POSITIVE_INFINITY;

  return graphType === 'standings' ? numericValue : -numericValue;
}

export function LeagueGraphCard({ result }: { result?: LeagueGraphResult }) {
  const { agent } = useAgent({
    agentId: 'default',
    updates: [UseAgentUpdate.OnRunStatusChanged],
  });
  const { copilotkit } = useCopilotKit();
  const [selectedKey, setSelectedKey] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(
    () => new Set(),
  );
  const headingId = useId();
  const lang = uiLanguageOf(result);
  const isHebrew = lang === 'he';
  const labels = isHebrew
    ? {
        title: 'גרף ליגה',
        chooseLeague: 'בחר ליגה להצגת הגרף',
        chooseType: 'בחר סוג גרף',
        followedLeagues: 'הליגות שלך',
        loading: 'טוען גרף…',
        selectError: 'לא ניתן לטעון את גרף הליגה. נסה שוב.',
        noLeagues: 'אין ליגות במעקב.',
        noLeaguesHint: 'אפשר לעקוב אחר ליגה לפני הצגת גרפים.',
        notFollowed: 'הליגה הזו אינה ברשימת המעקב שלך.',
        notFound: 'נתוני הליגה עדיין אינם זמינים.',
        noData: 'עדיין אין מספיק נתוני מרוצים לגרף הזה.',
        error: 'לא ניתן להציג את גרף הליגה כרגע.',
        teams: 'קבוצות בגרף',
        selected: 'הקבוצה הפעילה',
        chart: 'תרשים היסטוריית הליגה',
        table: 'טבלת נתוני הגרף',
        race: 'מרוץ',
        noValue: 'אין נתון',
        gap: 'פער מהמוביל',
        standings: 'מיקום בכל מרוץ',
        budget: 'תקציב בכל מרוץ',
        gapHint: 'הפער המצטבר בנקודות; המוביל נמצא על 0.',
        standingsHint: 'מיקום מצטבר. שוויון מקבל אותו מיקום.',
        budgetHint: 'שווי הקבוצה במיליוני דולרים בכל מרוץ.',
      }
    : {
        title: 'League graph',
        chooseLeague: 'Choose a league to graph',
        chooseType: 'Choose a graph type',
        followedLeagues: 'Your followed leagues',
        loading: 'Loading graph…',
        selectError: 'Unable to load the league graph. Please try again.',
        noLeagues: 'No followed leagues.',
        noLeaguesHint: 'Follow a league before viewing league graphs.',
        notFollowed: 'This league is not in your followed leagues.',
        notFound: 'League data is not available yet.',
        noData: 'There is not enough race data for this graph yet.',
        error: 'The league graph cannot be displayed right now.',
        teams: 'Teams on chart',
        selected: 'Active team',
        chart: 'League history chart',
        table: 'Graph data table',
        race: 'Race',
        noValue: 'No data',
        gap: 'Gap to leader',
        standings: 'Standings by race',
        budget: 'Budget by race',
        gapHint: 'Cumulative points behind the leader; the leader is at 0.',
        standingsHint: 'Cumulative rank. Tied teams share the same rank.',
        budgetHint: 'Team value in millions of dollars at each race.',
      };
  const typeLabels: Record<GraphType, { title: string; hint: string }> = {
    gap: { title: labels.gap, hint: labels.gapHint },
    standings: { title: labels.standings, hint: labels.standingsHint },
    budget: { title: labels.budget, hint: labels.budgetHint },
  };

  async function continueWith(message: string, key: string) {
    if (selectedKey || agent.isRunning || !tryAcquireAgentRun(agent)) return;

    const previousMessages = [...agent.messages];
    let runFailed = false;
    const subscription = agent.subscribe({
      onRunFailed: () => {
        runFailed = true;
      },
      onRunErrorEvent: () => {
        runFailed = true;
      },
    });
    setSelectedKey(key);
    setErrorMessage('');
    try {
      agent.addMessage({
        id: crypto.randomUUID(),
        role: 'developer',
        content: message,
      });
      await copilotkit.runAgent({ agent });
      if (runFailed) throw new Error('Agent run failed');
    } catch {
      agent.setMessages(previousMessages);
      setErrorMessage(labels.selectError);
    } finally {
      subscription.unsubscribe();
      releaseAgentRun(agent);
      setSelectedKey('');
    }
  }

  function selectLeague(league: LeagueChoice) {
    const graphInstruction = result?.graphType
      ? `and graphType="${result.graphType}"`
      : 'and omit graphType so the graph-type cards render';

    return continueWith(
      `The user selected followed league "${league.leagueName}" ` +
        `(${league.leagueCode}) for a league graph. Call get_league_graph ` +
        `now with this exact canonical leagueCode ${graphInstruction}. ` +
        'Do not call list_user_leagues and do not ask for another target.',
      `league:${league.leagueCode}`,
    );
  }

  function selectGraphType(graphType: GraphType) {
    return continueWith(
      `The user selected graphType="${graphType}" for followed league ` +
        `"${result?.leagueName}" (${result?.leagueCode}). Call ` +
        'get_league_graph now with this exact canonical leagueCode and ' +
        'graphType. Do not call list_user_leagues and do not ask again.',
      `type:${graphType}`,
    );
  }

  const shellStyle = {
    border: '1px solid var(--app-border)',
    borderRadius: 8,
    background: 'var(--app-surface)',
    color: 'var(--app-text)',
    padding: 14,
    margin: '8px 0',
  } as const;

  if (!result || result.status === 'error') {
    return (
      <section role="alert" dir={directionFor(lang)} style={shellStyle}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{labels.title}</h3>
        <p style={{ margin: '8px 0 0', color: 'var(--app-danger-text)' }}>
          {labels.error}
        </p>
      </section>
    );
  }

  if (result.status === 'select_league') {
    const busy =
      Boolean(selectedKey) || agent.isRunning || isAgentRunActive(agent);

    return (
      <section aria-labelledby={headingId} dir={directionFor(lang)} style={shellStyle}>
        <h3 id={headingId} style={{ margin: 0, fontSize: 16 }}>
          {labels.chooseLeague}
        </h3>
        <div style={{ color: 'var(--app-muted)', fontSize: 12, marginTop: 3 }}>
          {labels.followedLeagues}
        </div>
        <div
          role="list"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 8,
            marginTop: 12,
          }}
        >
          {(result.leagues || []).map((league) => {
            const key = `league:${league.leagueCode}`;

            return (
              <button
                key={league.leagueCode}
                type="button"
                role="listitem"
                aria-disabled={busy}
                aria-label={`${labels.chooseLeague}: ${league.leagueName}`}
                onClick={() => selectLeague(league)}
                style={{
                  minHeight: 72,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--app-control-border)',
                  background:
                    selectedKey === key
                      ? 'var(--app-primary-surface)'
                      : 'var(--app-surface-muted)',
                  color: 'var(--app-text)',
                  textAlign: 'start',
                  cursor: busy ? 'wait' : 'pointer',
                  opacity: busy && selectedKey !== key ? 0.55 : 1,
                }}
              >
                <strong style={{ display: 'block' }}>{league.leagueName}</strong>
                <code style={{ display: 'block', fontSize: 11, marginTop: 5 }}>
                  {league.leagueCode}
                </code>
                {selectedKey === key ? (
                  <span role="status" style={{ display: 'block', fontSize: 11, marginTop: 5 }}>
                    {labels.loading}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {errorMessage ? (
          <div role="alert" style={{ color: 'var(--app-danger-text)', marginTop: 9 }}>
            {errorMessage}
          </div>
        ) : null}
      </section>
    );
  }

  if (result.status === 'select_graph_type') {
    const busy =
      Boolean(selectedKey) || agent.isRunning || isAgentRunActive(agent);

    return (
      <section aria-labelledby={headingId} dir={directionFor(lang)} style={shellStyle}>
        <h3 id={headingId} style={{ margin: 0, fontSize: 16 }}>
          {labels.chooseType}: {result.leagueName || result.leagueCode}
        </h3>
        <div
          role="list"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 8,
            marginTop: 12,
          }}
        >
          {(result.graphTypes || ['gap', 'standings', 'budget']).map((graphType) => {
            const key = `type:${graphType}`;

            return (
              <button
                key={graphType}
                type="button"
                role="listitem"
                aria-disabled={busy}
                onClick={() => selectGraphType(graphType)}
                style={{
                  minHeight: 82,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--app-control-border)',
                  background:
                    selectedKey === key
                      ? 'var(--app-primary-surface)'
                      : 'var(--app-surface-muted)',
                  color: 'var(--app-text)',
                  textAlign: 'start',
                  cursor: busy ? 'wait' : 'pointer',
                  opacity: busy && selectedKey !== key ? 0.55 : 1,
                }}
              >
                <strong style={{ display: 'block' }}>{typeLabels[graphType].title}</strong>
                <span style={{ display: 'block', color: 'var(--app-muted)', fontSize: 11, marginTop: 5 }}>
                  {typeLabels[graphType].hint}
                </span>
                {selectedKey === key ? (
                  <span role="status" style={{ display: 'block', fontSize: 11, marginTop: 5 }}>
                    {labels.loading}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {errorMessage ? (
          <div role="alert" style={{ color: 'var(--app-danger-text)', marginTop: 9 }}>
            {errorMessage}
          </div>
        ) : null}
      </section>
    );
  }

  if (result.status === 'no_followed_leagues') {
    return (
      <section aria-labelledby={headingId} dir={directionFor(lang)} style={shellStyle}>
        <h3 id={headingId} style={{ margin: 0, fontSize: 16 }}>{labels.noLeagues}</h3>
        <p style={{ margin: '7px 0 0', color: 'var(--app-muted)' }}>{labels.noLeaguesHint}</p>
      </section>
    );
  }

  if (
    result.status === 'not_followed' ||
    result.status === 'not_found' ||
    result.status === 'no_data'
  ) {
    const message =
      result.status === 'not_followed'
        ? labels.notFollowed
        : result.status === 'not_found'
          ? labels.notFound
          : labels.noData;

    return (
      <section role="status" dir={directionFor(lang)} style={shellStyle}>
        <h3 style={{ margin: 0, fontSize: 16 }}>
          {result.leagueName || labels.title}
        </h3>
        <p style={{ margin: '7px 0 0', color: 'var(--app-warning-text)' }}>
          {message}
        </p>
      </section>
    );
  }

  const graphType = result.graphType || 'gap';
  const series = result.series || [];
  const matchdays = result.matchdays || [];
  const visibleSeries = series.filter(
    (entry, index) => !hiddenSeries.has(seriesKey(entry, index)),
  );
  const chartData = matchdays.map((matchday, pointIndex) => {
    const row: Record<string, string | number | null> = {
      label: matchday.label,
      matchdayId: matchday.matchdayId,
    };
    series.forEach((entry, seriesIndex) => {
      row[`series_${seriesIndex}`] = entry.points[pointIndex]?.value ?? null;
    });

    return row;
  });
  const graphLabel = typeLabels[graphType];

  return (
    <section aria-labelledby={headingId} dir={directionFor(lang)} style={shellStyle}>
      <header style={{ marginBottom: 12 }}>
        <h3 id={headingId} style={{ margin: 0, fontSize: 17 }}>
          {graphLabel.title}: {result.leagueName || result.leagueCode}
        </h3>
        <p style={{ margin: '4px 0 0', color: 'var(--app-muted)', fontSize: 12 }}>
          {graphLabel.hint}
        </p>
      </header>

      <fieldset style={{ border: 0, padding: 0, margin: '0 0 10px' }}>
        <legend style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
          {labels.teams}
        </legend>
        <div
          role="list"
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(180px, 100%), 1fr))',
            gap: '7px 12px',
          }}
        >
          {series.map((entry, index) => {
            const key = seriesKey(entry, index);

            return (
              <label
                key={key}
                role="listitem"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  minWidth: 0,
                  fontSize: 12,
                }}
              >
                <input
                  type="checkbox"
                  checked={!hiddenSeries.has(key)}
                  onChange={() =>
                    setHiddenSeries((current) => {
                      const next = new Set(current);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);

                      return next;
                    })
                  }
                />
                <span aria-hidden="true" style={{ width: 12, height: 3, background: entry.color }} />
                <span style={{ overflowWrap: 'anywhere' }}>
                  {entry.teamName}
                  {entry.isSelected ? ` (${labels.selected})` : ''}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div
        role="img"
        aria-label={`${labels.chart}: ${graphLabel.title}, ${result.leagueName || result.leagueCode}`}
        style={{ width: '100%', height: 350, minHeight: 350 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 24, right: 18, bottom: 14, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={18} />
            <YAxis
              reversed={graphType === 'standings'}
              domain={graphType === 'standings' ? [1, result.maxRank || series.length] : ['auto', 'auto']}
              allowDecimals={graphType !== 'standings'}
              tick={{ fontSize: 11 }}
              width={54}
              tickFormatter={(value: number) => graphValue(graphType, value)}
            />
            <Tooltip
              itemSorter={(item) => tooltipOrder(graphType, item.value)}
            />
            {visibleSeries.map((entry) => {
              const index = series.indexOf(entry);

              return (
                <Line
                  key={seriesKey(entry, index)}
                  type="monotone"
                  dataKey={`series_${index}`}
                  name={entry.teamName}
                  stroke={entry.color}
                  strokeWidth={entry.isSelected ? 4 : 2}
                  connectNulls={graphType === 'budget'}
                  dot={{ r: entry.isSelected ? 5 : 3, fill: entry.color }}
                  activeDot={{ r: entry.isSelected ? 7 : 5 }}
                  isAnimationActive={false}
                />
              );
            })}
            {visibleSeries.flatMap((entry) => {
              const seriesIndex = series.indexOf(entry);

              return entry.points.flatMap((point, pointIndex) =>
                point.chip && point.value !== null
                  ? [
                      <ReferenceDot
                        key={`${seriesKey(entry, seriesIndex)}-chip-${pointIndex}`}
                        x={point.label}
                        y={point.value}
                        r={entry.isSelected ? 7 : 6}
                        fill={entry.color}
                        stroke="var(--app-surface)"
                        label={{ value: point.chip.emoji, position: 'top', fontSize: 12 }}
                      />,
                    ]
                  : [],
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <details open style={{ marginTop: 10 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
          {labels.table}
        </summary>
        <div style={{ overflowX: 'auto', marginTop: 7 }}>
          <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse', fontSize: 12 }}>
            <caption style={{ textAlign: 'start', color: 'var(--app-muted)', marginBottom: 5 }}>
              {graphLabel.title}: {result.leagueName || result.leagueCode}
            </caption>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'start', padding: 6, borderBottom: '1px solid var(--app-border)' }}>
                  {labels.teams}
                </th>
                {matchdays.map((matchday) => (
                  <th key={matchday.key} scope="col" style={{ textAlign: 'start', padding: 6, borderBottom: '1px solid var(--app-border)' }}>
                    {matchday.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.map((entry, seriesIndex) => (
                <tr key={seriesKey(entry, seriesIndex)}>
                  <th scope="row" style={{ textAlign: 'start', padding: 6, borderBottom: '1px solid var(--app-border)' }}>
                    {entry.teamName}
                  </th>
                  {entry.points.map((point, pointIndex) => (
                    <td key={`${point.matchdayId ?? pointIndex}`} style={{ padding: 6, borderBottom: '1px solid var(--app-border)' }}>
                      {point.value === null ? labels.noValue : graphValue(graphType, point.value)}
                      {point.chip ? ` · ${point.chip.label}` : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

export function useLeagueGraphAction() {
  useCopilotAction({
    name: 'get_league_graph',
    description: 'Show a historical graph for one followed league.',
    parameters: [],
    available: 'frontend',
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return <ToolLoading kind="leagueGraph" />;
      }
      const parsed = safeParse(result);
      if (isToolErrorResult(parsed)) return <ToolErrorFallback result={parsed} />;

      return <LeagueGraphCard result={parsed as LeagueGraphResult | undefined} />;
    },
  });
}

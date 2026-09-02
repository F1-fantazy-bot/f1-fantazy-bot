import { useCopilotAction } from '@copilotkit/react-core';
import {
  UseAgentUpdate,
  useAgent,
  useCopilotKit,
} from '@copilotkit/react-core/v2';
import { useId, useState } from 'react';
import {
  isAgentRunActive,
  releaseAgentRun,
  tryAcquireAgentRun,
} from './agentRunLock';
import { isToolErrorResult, ToolErrorFallback } from './ToolErrorFallback';
import { safeParse } from './safeParse';
import { ToolLoading } from './ToolLoading';
import { directionFor, uiLanguageOf } from './uiLanguage';

type LeagueChoice = {
  leagueCode: string;
  leagueName: string;
};

export type RaceSummaryResult = {
  status?:
    | 'select_league'
    | 'no_followed_leagues'
    | 'not_followed'
    | 'missing_data'
    | 'empty'
    | 'generation_error'
    | 'ok'
    | 'error';
  lang?: string;
  leagueCode?: string | null;
  leagueName?: string | null;
  raceName?: string | null;
  raceNumber?: number | null;
  latestMatchday?: string | null;
  summary?: string;
  truncated?: boolean;
  leagues?: LeagueChoice[];
};

function recapParts(summary: string) {
  return summary
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function RaceSummaryCard({ result }: { result?: RaceSummaryResult }) {
  const { agent } = useAgent({
    agentId: 'default',
    updates: [UseAgentUpdate.OnRunStatusChanged],
  });
  const { copilotkit } = useCopilotKit();
  const [selectedCode, setSelectedCode] = useState('');
  const [selectionError, setSelectionError] = useState('');
  const headingId = useId();
  const lang = uiLanguageOf(result);
  const labels =
    lang === 'he'
      ? {
          title: 'סיכום המרוץ',
          choose: 'בחר ליגה לסיכום המרוץ',
          chooseHint: 'הליגות שלך',
          loading: 'מכין סיכום…',
          selectError: 'לא ניתן להתחיל את יצירת הסיכום. נסה שוב.',
          noLeagues: 'אין ליגות במעקב.',
          noLeaguesHint: 'אפשר לעקוב אחר ליגה לפני יצירת סיכום מרוץ.',
          notFollowed: 'הליגה הזו אינה ברשימת המעקב שלך.',
          missingData: 'עדיין אין מספיק נתוני מרוץ לסיכום הליגה הזו.',
          empty: 'הסיכום חזר ריק. כדאי לנסות שוב בעוד רגע.',
          generationError: 'לא ניתן ליצור את סיכום המרוץ כרגע. נסה שוב מאוחר יותר.',
          error: 'לא ניתן להציג את סיכום המרוץ כרגע.',
          truncated: 'הסיכום קוצר כדי להתאים לתצוגה.',
          race: 'מרוץ',
        }
      : {
          title: 'Race summary',
          choose: 'Choose a league for its race summary',
          chooseHint: 'Your followed leagues',
          loading: 'Creating summary…',
          selectError: 'Unable to start the race summary. Please try again.',
          noLeagues: 'No followed leagues.',
          noLeaguesHint: 'Follow a league before creating a race summary.',
          notFollowed: 'This league is not in your followed leagues.',
          missingData: 'There is not enough completed race data for this league yet.',
          empty: 'The generated summary was empty. Please try again in a moment.',
          generationError: 'The race summary cannot be generated right now. Please try again later.',
          error: 'The race summary cannot be displayed right now.',
          truncated: 'The recap was shortened to fit the display limit.',
          race: 'Race',
        };

  const shellStyle = {
    border: '1px solid var(--app-border)',
    borderRadius: 8,
    background: 'var(--app-surface)',
    color: 'var(--app-text)',
    padding: 14,
    margin: '8px 0',
  } as const;

  async function selectLeague(league: LeagueChoice) {
    if (selectedCode || agent.isRunning || !tryAcquireAgentRun(agent)) return;

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
    setSelectedCode(league.leagueCode);
    setSelectionError('');
    try {
      agent.addMessage({
        id: crypto.randomUUID(),
        role: 'developer',
        content:
          `The user selected followed league "${league.leagueName}" ` +
          `(${league.leagueCode}) for a race summary. Call get_race_summary ` +
          'now with this exact canonical leagueCode. Do not call ' +
          'list_user_leagues and do not ask for another target.',
      });
      await copilotkit.runAgent({ agent });
      if (runFailed) throw new Error('Agent run failed');
    } catch {
      agent.setMessages(previousMessages);
      setSelectionError(labels.selectError);
    } finally {
      subscription.unsubscribe();
      releaseAgentRun(agent);
      setSelectedCode('');
    }
  }

  if (!result || result.status === 'error') {
    return (
      <section role="alert" dir={directionFor(lang)} style={shellStyle}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{labels.title}</h3>
        <p style={{ color: 'var(--app-danger-text)', marginBottom: 0 }}>{labels.error}</p>
      </section>
    );
  }

  if (result.status === 'select_league') {
    const busy = Boolean(selectedCode) || agent.isRunning || isAgentRunActive(agent);

    return (
      <section aria-labelledby={headingId} dir={directionFor(lang)} style={shellStyle}>
        <h3 id={headingId} style={{ margin: 0, fontSize: 16 }}>{labels.choose}</h3>
        <div style={{ color: 'var(--app-muted)', fontSize: 12, marginTop: 3 }}>
          {labels.chooseHint}
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
          {(result.leagues || []).map((league) => (
            <button
              key={league.leagueCode}
              type="button"
              role="listitem"
              aria-disabled={busy}
              aria-label={`${labels.choose}: ${league.leagueName}`}
              onClick={() => selectLeague(league)}
              style={{
                minHeight: 72,
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--app-control-border)',
                background:
                  selectedCode === league.leagueCode
                    ? 'var(--app-primary-surface)'
                    : 'var(--app-surface-muted)',
                color: 'var(--app-text)',
                textAlign: 'start',
                cursor: busy ? 'wait' : 'pointer',
                opacity: busy && selectedCode !== league.leagueCode ? 0.55 : 1,
              }}
            >
              <strong style={{ display: 'block' }}>{league.leagueName}</strong>
              <code style={{ display: 'block', fontSize: 11, marginTop: 5 }}>
                {league.leagueCode}
              </code>
              {selectedCode === league.leagueCode ? (
                <span role="status" style={{ display: 'block', fontSize: 11, marginTop: 5 }}>
                  {labels.loading}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        {selectionError ? (
          <div role="alert" style={{ color: 'var(--app-danger-text)', marginTop: 9 }}>
            {selectionError}
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
    result.status === 'missing_data' ||
    result.status === 'empty' ||
    result.status === 'generation_error'
  ) {
    const message = {
      not_followed: labels.notFollowed,
      missing_data: labels.missingData,
      empty: labels.empty,
      generation_error: labels.generationError,
    }[result.status];

    return (
      <section role="status" dir={directionFor(lang)} style={shellStyle}>
        <h3 style={{ margin: 0, fontSize: 16 }}>
          {result.leagueName || labels.title}
        </h3>
        <p style={{ margin: '7px 0 0', color: 'var(--app-warning-text)' }}>{message}</p>
      </section>
    );
  }

  const parts = recapParts(result.summary || '');
  const title = parts[0] || `${labels.title}: ${result.leagueName || labels.race}`;

  return (
    <article aria-labelledby={headingId} dir={directionFor(lang)} style={shellStyle}>
      <header style={{ borderBottom: '1px solid var(--app-border)', paddingBottom: 10 }}>
        <h3 id={headingId} style={{ margin: 0, fontSize: 18 }}>{title}</h3>
        {result.raceNumber ? (
          <div style={{ marginTop: 4, color: 'var(--app-muted)', fontSize: 12 }}>
            {result.leagueName} · {result.raceName || labels.race} · {labels.race}{' '}
            {result.raceNumber}
          </div>
        ) : null}
      </header>
      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        {parts.slice(1).map((part, index) => {
          const [heading, ...body] = part.split('\n');

          return (
            <section key={`${heading}-${index}`}>
              <h4 style={{ margin: 0, fontSize: 15 }}>{heading}</h4>
              {body.length ? (
                <p style={{ margin: '5px 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
                  {body.join('\n')}
                </p>
              ) : null}
            </section>
          );
        })}
      </div>
      {result.truncated ? (
        <p role="note" style={{ color: 'var(--app-muted)', fontSize: 11, marginBottom: 0 }}>
          {labels.truncated}
        </p>
      ) : null}
    </article>
  );
}

export function useRaceSummaryAction() {
  useCopilotAction({
    name: 'get_race_summary',
    description: 'Show a generated post-race recap for one followed league.',
    parameters: [],
    available: 'frontend',
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return <ToolLoading kind="raceSummary" />;
      }
      const parsed = safeParse(result);
      if (isToolErrorResult(parsed)) return <ToolErrorFallback result={parsed} />;

      return <RaceSummaryCard result={parsed as RaceSummaryResult | undefined} />;
    },
  });
}

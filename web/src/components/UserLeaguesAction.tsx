import { useCopilotAction } from '@copilotkit/react-core';
import { useAgent, useCopilotKit } from '@copilotkit/react-core/v2';
import { useState } from 'react';
import { isToolErrorResult, ToolErrorFallback } from './ToolErrorFallback';
import { safeParse } from './safeParse';
import { ToolLoading } from './ToolLoading';

type UserLeague = {
  leagueCode: string;
  leagueName: string;
  registeredAt?: string | null;
};

export type UserLeaguesResult = {
  leagues?: UserLeague[];
  selectionMode?: 'follow_team';
  lang?: string;
};

export function InteractiveUserLeagues({
  result,
}: {
  result?: UserLeaguesResult;
}) {
  const { agent } = useAgent({ agentId: 'default' });
  const { copilotkit } = useCopilotKit();
  const [selectedCode, setSelectedCode] = useState('');
  const [selectionComplete, setSelectionComplete] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const leagues = Array.isArray(result?.leagues) ? result.leagues : [];
  const canSelect = result?.selectionMode === 'follow_team';
  const isHebrew = result?.lang === 'he';
  const labels = isHebrew
    ? {
        title: canSelect ? 'בחר ליגה שמכילה את הקבוצה' : 'הליגות שלי',
        empty: 'אין ליגות במעקב.',
        loading: 'טוען קבוצות…',
        selected: 'נבחרה',
        error: 'לא ניתן לטעון את קבוצות הליגה. נסה שוב.',
      }
    : {
        title: canSelect
          ? 'Select the league that contains the team'
          : 'My followed leagues',
        empty: 'No followed leagues.',
        loading: 'Loading teams…',
        selected: 'Selected',
        error: 'Unable to load the league teams. Please try again.',
      };

  async function selectLeague(league: UserLeague) {
    if (!canSelect || selectedCode) return;
    setSelectedCode(league.leagueCode);
    setSelectionComplete(false);
    setErrorMessage('');
    try {
      agent.addMessage({
        id: crypto.randomUUID(),
        role: 'developer',
        content:
          `The user selected followed league "${league.leagueName}" ` +
          `(${league.leagueCode}) for the pending follow_team add request. ` +
          'Call list_league_teams now with this exact leagueCode and ' +
          'selectionMode="follow_team". Do not ask the user to type a team name.',
      });
      await copilotkit.runAgent({ agent });
      setSelectionComplete(true);
    } catch {
      setSelectedCode('');
      setSelectionComplete(false);
      setErrorMessage(labels.error);
    }
  }

  return (
    <section
      aria-label={labels.title}
      dir={isHebrew ? 'rtl' : 'ltr'}
      style={{
        border: '1px solid var(--app-border)',
        borderRadius: 10,
        background: 'var(--app-surface)',
        padding: 14,
        margin: '6px 0',
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 10 }}>{labels.title}</div>
      {leagues.length === 0 ? (
        <div style={{ color: 'var(--app-muted)', fontSize: 13 }}>
          {labels.empty}
        </div>
      ) : (
        <div
          role="list"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 8,
          }}
        >
          {leagues.map((league) => {
            const content = (
              <>
                <strong>{league.leagueName}</strong>
                <code style={{ fontSize: 11, opacity: 0.75 }}>
                  {league.leagueCode}
                </code>
              </>
            );
            const style = {
              display: 'flex',
              flexDirection: 'column' as const,
              alignItems: 'flex-start',
              gap: 4,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--app-control-border)',
              background:
                selectedCode === league.leagueCode
                  ? 'var(--app-primary-surface)'
                  : 'var(--app-surface-muted)',
              color: 'var(--app-text)',
              textAlign: 'start' as const,
            };

            return canSelect ? (
              <button
                key={league.leagueCode}
                role="listitem"
                type="button"
                onClick={() => selectLeague(league)}
                disabled={Boolean(selectedCode)}
                aria-label={`${league.leagueName}: ${league.leagueCode}`}
                style={{
                  ...style,
                  cursor: selectedCode ? 'wait' : 'pointer',
                  opacity:
                    selectedCode && selectedCode !== league.leagueCode
                      ? 0.55
                      : 1,
                }}
              >
                {content}
                {selectedCode === league.leagueCode ? (
                  <span style={{ color: 'var(--app-primary)', fontSize: 12 }}>
                    {selectionComplete ? labels.selected : labels.loading}
                  </span>
                ) : null}
              </button>
            ) : (
              <div key={league.leagueCode} role="listitem" style={style}>
                {content}
              </div>
            );
          })}
        </div>
      )}
      {errorMessage ? (
        <div
          role="alert"
          style={{
            color: 'var(--app-danger-text)',
            fontSize: 12,
            marginTop: 8,
          }}
        >
          {errorMessage}
        </div>
      ) : null}
    </section>
  );
}

export function useUserLeaguesAction() {
  useCopilotAction({
    name: 'list_user_leagues',
    description:
      'Show followed leagues and optionally let the user select one for follow_team.',
    parameters: [],
    available: 'frontend',
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return <ToolLoading kind="write" englishLabel="Loading leagues…" />;
      }
      const parsed = safeParse(result);
      if (isToolErrorResult(parsed)) {
        return <ToolErrorFallback result={parsed} />;
      }

      return (
        <InteractiveUserLeagues
          result={parsed as UserLeaguesResult | undefined}
        />
      );
    },
  });
}

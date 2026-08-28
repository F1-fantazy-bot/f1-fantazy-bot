import { useCopilotAction } from '@copilotkit/react-core';
import { useAgent, useCopilotKit } from '@copilotkit/react-core/v2';
import { useState } from 'react';
import { isToolErrorResult, ToolErrorFallback } from './ToolErrorFallback';
import { safeParse } from './safeParse';
import { ToolLoading } from './ToolLoading';
import {
  WriteConfirmCard,
  isConfirmationRequired,
  type WriteConfirmationRequired,
} from './WriteConfirmCard';
import {
  WriteResultCard,
  isWriteResult,
  type WriteResult,
} from './WriteResultCard';
import { useWriteDecision } from './WriteDecisionContext';

type UserLeague = {
  leagueCode: string;
  leagueName: string;
  registeredAt?: string | null;
};

export type UserLeaguesResult = {
  leagues?: UserLeague[];
  selectionMode?: 'follow_team' | 'unfollow_league';
  lang?: string;
};

export function InteractiveUserLeagues({
  result,
}: {
  result?: UserLeaguesResult;
}) {
  const { agent } = useAgent({ agentId: 'default' });
  const { copilotkit } = useCopilotKit();
  const { propose } = useWriteDecision();
  const [selectedCode, setSelectedCode] = useState('');
  const [selectionComplete, setSelectionComplete] = useState(false);
  const [confirmation, setConfirmation] =
    useState<WriteConfirmationRequired | null>(null);
  const [feedback, setFeedback] = useState<WriteResult | null>(null);
  const [removedCodes, setRemovedCodes] = useState<Set<string>>(
    () => new Set(),
  );
  const [errorMessage, setErrorMessage] = useState('');
  const leagues = Array.isArray(result?.leagues)
    ? result.leagues.filter((league) => !removedCodes.has(league.leagueCode))
    : [];
  const isFollowTeamSelection = result?.selectionMode === 'follow_team';
  const isUnfollowSelection = result?.selectionMode === 'unfollow_league';
  const canSelect = isFollowTeamSelection || isUnfollowSelection;
  const isHebrew = result?.lang === 'he';
  const labels = isHebrew
    ? {
        title: isFollowTeamSelection
          ? 'בחר ליגה שמכילה את הקבוצה'
          : isUnfollowSelection
            ? 'בחר ליגה להסרה מהמעקב'
            : 'הליגות שלי',
        empty: 'אין ליגות במעקב.',
        loading: 'טוען קבוצות…',
        selected: 'נבחרה',
        remove: 'הסר ממעקב',
        error: 'לא ניתן לטעון את קבוצות הליגה. נסה שוב.',
        removeError: 'לא ניתן להכין את הסרת הליגה. נסה שוב.',
        uncertain:
          'לא ניתן לאמת אם הליגה הוסרה. רענן את הליגות במעקב לפני ניסיון נוסף.',
      }
    : {
        title: isFollowTeamSelection
          ? 'Select the league that contains the team'
          : isUnfollowSelection
            ? 'Select the league to stop following'
            : 'My followed leagues',
        empty: 'No followed leagues.',
        loading: 'Loading teams…',
        selected: 'Selected',
        remove: 'Stop following',
        error: 'Unable to load the league teams. Please try again.',
        removeError: 'Unable to prepare the league removal. Please try again.',
        uncertain:
          'The final status could not be verified. Refresh your followed leagues before trying again.',
      };

  async function selectLeague(league: UserLeague) {
    if (!canSelect || selectedCode) return;
    setSelectedCode(league.leagueCode);
    setSelectionComplete(false);
    setFeedback(null);
    setErrorMessage('');
    try {
      if (isUnfollowSelection) {
        const proposal = await propose('unfollow_league', {
          leagueCode: league.leagueCode,
        });
        if (isConfirmationRequired(proposal)) {
          setConfirmation(proposal);

          return;
        }
        if (isWriteResult(proposal)) {
          setFeedback(proposal);
          setSelectedCode('');

          return;
        }
        throw new Error('Unexpected unfollow-league proposal response');
      }

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
      setErrorMessage(
        isUnfollowSelection ? labels.removeError : labels.error,
      );
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
                aria-label={
                  isUnfollowSelection
                    ? `${labels.remove}: ${league.leagueName}`
                    : `${league.leagueName}: ${league.leagueCode}`
                }
                style={{
                  ...style,
                  ...(isUnfollowSelection
                    ? {
                        borderColor: 'var(--app-danger-border)',
                      }
                    : {}),
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
                    {selectionComplete
                      ? labels.selected
                      : isUnfollowSelection
                        ? labels.remove
                        : labels.loading}
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
      {confirmation ? (
        <WriteConfirmCard
          result={confirmation}
          directConfirm
          directConfirmErrorMessage={labels.uncertain}
          onSettled={(outcome, message, finalResult) => {
            if (outcome === 'confirmed' && finalResult) {
              setFeedback(finalResult);
              setConfirmation(null);
              setSelectedCode('');
              if (finalResult.status === 'ok') {
                const removedCode =
                  finalResult.leagueCode || selectedCode;
                setRemovedCodes((current) => {
                  const next = new Set(current);
                  next.add(removedCode);

                  return next;
                });
              }
            }
            if (outcome === 'cancelled' || outcome === 'error') {
              setSelectedCode('');
              setConfirmation(null);
            }
            if (outcome === 'error') {
              setErrorMessage(message || labels.removeError);
            }
          }}
        />
      ) : null}
      {feedback ? <WriteResultCard result={feedback} /> : null}
    </section>
  );
}

export function useUserLeaguesAction() {
  useCopilotAction({
    name: 'list_user_leagues',
    description:
      'Show followed leagues and optionally select one for follow_team or unfollow_league.',
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

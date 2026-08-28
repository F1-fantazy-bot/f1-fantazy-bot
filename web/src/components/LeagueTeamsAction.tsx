import { useCopilotAction } from '@copilotkit/react-core';
import { useState } from 'react';
import { isToolErrorResult, ToolErrorFallback } from './ToolErrorFallback';
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
import { safeParse } from './safeParse';
import { ToolLoading } from './ToolLoading';

type LeagueTeam = {
  teamId: string;
  teamName?: string | null;
  userName?: string | null;
  position?: number | null;
  isSelected?: boolean;
  isFollowed?: boolean;
};

export type LeagueTeamsResult = {
  status?: string;
  leagueCode?: string;
  leagueName?: string;
  teams?: LeagueTeam[];
  selectionMode?: 'follow_team';
  lang?: string;
};

export function InteractiveLeagueTeams({
  result,
}: {
  result?: LeagueTeamsResult;
}) {
  const { propose } = useWriteDecision();
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [confirmation, setConfirmation] =
    useState<WriteConfirmationRequired | null>(null);
  const [feedback, setFeedback] = useState<WriteResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const teams = Array.isArray(result?.teams) ? result.teams : [];
  const canSelect =
    result?.status === 'ok' &&
    result.selectionMode === 'follow_team' &&
    typeof result.leagueCode === 'string';
  const isHebrew = result?.lang === 'he';
  const labels = isHebrew
    ? {
        title: canSelect ? 'בחר קבוצה למעקב' : 'קבוצות בליגה',
        empty: 'לא נמצאו קבוצות בליגה.',
        active: 'פעילה',
        alreadyFollowed: 'כבר במעקב',
        submitting: 'מכין אישור…',
        followed: 'נוסף למעקב',
        error: 'לא ניתן להכין את המעקב אחר הקבוצה. נסה שוב.',
      }
    : {
        title: canSelect ? 'Select the team you want to follow' : 'League teams',
        empty: 'No teams found in this league.',
        active: 'ACTIVE',
        alreadyFollowed: 'ALREADY FOLLOWED',
        submitting: 'Preparing confirmation…',
        followed: 'Followed',
        error: 'Unable to prepare the team follow. Please try again.',
      };

  async function followTeam(team: LeagueTeam) {
    if (!canSelect || selectedTeamId || !result?.leagueCode) return;
    setSelectedTeamId(team.teamId);
    setErrorMessage('');
    try {
      const proposal = await propose('follow_team', {
        action: 'add',
        leagueCode: result.leagueCode,
        teamId: team.teamId,
      });
      if (isConfirmationRequired(proposal)) {
        setConfirmation(proposal);

        return;
      }
      if (isWriteResult(proposal)) {
        setFeedback(proposal);
        if (proposal.status !== 'ok') {
          setSelectedTeamId('');
        }

        return;
      }
      throw new Error('Unexpected follow-team proposal response');
    } catch {
      setSelectedTeamId('');
      setErrorMessage(labels.error);
    }
  }

  return (
    <>
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
        <div style={{ fontWeight: 800, marginBottom: 2 }}>
          {result?.leagueName || result?.leagueCode || labels.title}
        </div>
        <div
          style={{
            color: 'var(--app-muted)',
            fontSize: 12,
            marginBottom: 10,
          }}
        >
          {labels.title}
        </div>
        {teams.length === 0 ? (
          <div style={{ color: 'var(--app-muted)', fontSize: 13 }}>
            {labels.empty}
          </div>
        ) : (
          <div
            role="list"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: 8,
            }}
          >
            {teams.map((team) => {
              const content = (
                <>
                  <span
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      width: '100%',
                    }}
                  >
                    <strong>{team.teamName || team.userName || team.teamId}</strong>
                    {team.position != null ? (
                      <span style={{ color: 'var(--app-subtle)' }}>
                        P{team.position}
                      </span>
                    ) : null}
                  </span>
                  <code style={{ fontSize: 11, opacity: 0.75 }}>
                    {team.teamId}
                  </code>
                  {team.isSelected ? (
                    <span
                      style={{
                        color: 'var(--app-primary)',
                        fontSize: 11,
                        fontWeight: 800,
                      }}
                    >
                      {labels.active}
                    </span>
                  ) : null}
                  {team.isFollowed ? (
                    <span
                      style={{
                        color: 'var(--app-success-text)',
                        fontSize: 11,
                        fontWeight: 800,
                      }}
                    >
                      {labels.alreadyFollowed}
                    </span>
                  ) : null}
                </>
              );
              const style = {
                display: 'flex',
                flexDirection: 'column' as const,
                alignItems: 'flex-start',
                gap: 4,
                padding: '10px 12px',
                borderRadius: 8,
                border: team.isSelected
                  ? '2px solid var(--app-primary)'
                  : '1px solid var(--app-control-border)',
                background:
                  selectedTeamId === team.teamId
                    ? 'var(--app-primary-surface)'
                    : 'var(--app-surface-muted)',
                color: 'var(--app-text)',
                textAlign: 'start' as const,
              };

              return canSelect ? (
                <button
                  key={team.teamId}
                  role="listitem"
                  type="button"
                  onClick={() => followTeam(team)}
                  disabled={Boolean(selectedTeamId) || team.isFollowed}
                  aria-label={`${team.teamName || team.teamId}: ${team.teamId}`}
                  style={{
                    ...style,
                    cursor: team.isFollowed
                      ? 'not-allowed'
                      : selectedTeamId
                        ? 'wait'
                        : 'pointer',
                    opacity:
                      team.isFollowed ||
                      (selectedTeamId && selectedTeamId !== team.teamId)
                        ? 0.55
                        : 1,
                  }}
                >
                  {content}
                  {selectedTeamId === team.teamId &&
                  !confirmation &&
                  !feedback ? (
                    <span style={{ color: 'var(--app-primary)', fontSize: 12 }}>
                      {labels.submitting}
                    </span>
                  ) : null}
                  {selectedTeamId === team.teamId &&
                  feedback?.status === 'ok' ? (
                    <span style={{ color: 'var(--app-success-text)', fontSize: 12 }}>
                      {labels.followed}
                    </span>
                  ) : null}
                </button>
              ) : (
                <div key={team.teamId} role="listitem" style={style}>
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
      {confirmation ? (
        <WriteConfirmCard
          result={confirmation}
          directConfirm
          onSettled={(outcome, message, finalResult) => {
            if (outcome === 'confirmed' && finalResult) {
              setFeedback(finalResult);
              setConfirmation(null);
              if (finalResult.status !== 'ok') {
                setSelectedTeamId('');
              }
            }
            if (outcome === 'cancelled' || outcome === 'error') {
              setSelectedTeamId('');
              setConfirmation(null);
            }
            if (outcome === 'error') {
              setErrorMessage(message || labels.error);
            }
          }}
        />
      ) : null}
      {feedback ? <WriteResultCard result={feedback} /> : null}
    </>
  );
}

export function useLeagueTeamsAction() {
  useCopilotAction({
    name: 'list_league_teams',
    description:
      'Show every team in a followed league and optionally select one for follow_team.',
    parameters: [],
    available: 'frontend',
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return <ToolLoading kind="write" englishLabel="Loading league teams…" />;
      }
      const parsed = safeParse(result);
      if (isToolErrorResult(parsed)) {
        return <ToolErrorFallback result={parsed} />;
      }

      return (
        <InteractiveLeagueTeams
          result={parsed as LeagueTeamsResult | undefined}
        />
      );
    },
  });
}

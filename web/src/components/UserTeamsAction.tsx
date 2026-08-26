import { useCopilotAction } from '@copilotkit/react-core';
import { useState } from 'react';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';
import {
  UserTeamsList,
  type ListUserTeamsResult,
  type UserTeam,
} from './UserTeamsList';
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

export function InteractiveUserTeamsList({
  result,
}: {
  result?: ListUserTeamsResult;
}) {
  const { propose } = useWriteDecision();
  const [confirmation, setConfirmation] =
    useState<WriteConfirmationRequired | null>(null);
  const [feedback, setFeedback] = useState<WriteResult | null>(null);
  const [decisionError, setDecisionError] = useState('');

  async function selectTeam(team: UserTeam) {
    const proposal = await propose('select_team', { teamId: team.teamId });
    setDecisionError('');
    if (isConfirmationRequired(proposal)) {
      setFeedback(null);
      setConfirmation(proposal);

      return;
    }
    if (isWriteResult(proposal)) {
      setFeedback(proposal);

      return;
    }

    throw new Error('Unexpected team-selection proposal response');
  }

  return (
    <>
      <UserTeamsList
        result={result}
        onSelectTeam={confirmation ? undefined : selectTeam}
      />
      {confirmation ? (
        <WriteConfirmCard
          result={confirmation}
          directConfirm
          onSettled={(outcome, message, finalResult) => {
            if (outcome === 'confirmed' && finalResult) {
              setFeedback(finalResult);
              setConfirmation(null);
            }
            if (outcome === 'cancelled' || outcome === 'error') {
              setConfirmation(null);
            }
            if (outcome === 'error') {
              setDecisionError(message || 'Unable to apply this change.');
            }
          }}
        />
      ) : null}
      {feedback ? (
        <WriteResultCard result={feedback} />
      ) : null}
      {decisionError ? (
        <div
          role="alert"
          style={{
            marginTop: 8,
            color: 'var(--app-danger-text)',
            fontSize: 12,
          }}
        >
          {decisionError}
        </div>
      ) : null}
    </>
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
      const typedResult = parsed as ListUserTeamsResult | undefined;

      return <InteractiveUserTeamsList result={typedResult} />;
    },
  });
}

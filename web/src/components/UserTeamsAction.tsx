import { useCopilotAction } from '@copilotkit/react-core';
import { useAgent, useCopilotKit } from '@copilotkit/react-core/v2';
import { useRef } from 'react';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';
import {
  UserTeamsList,
  type ListUserTeamsResult,
  type UserTeam,
} from './UserTeamsList';
import { safeParse } from './safeParse';
import { ToolLoading } from './ToolLoading';
import { uiLanguageOf, type UiLanguage } from './uiLanguage';

export function buildTeamSelectionMessage(
  team: UserTeam,
  lang: UiLanguage,
): string {
  return lang === 'he'
    ? `בחר את "${team.teamName}" (teamId: ${team.teamId}) כקבוצה הפעילה שלי.`
    : `Select "${team.teamName}" (teamId: ${team.teamId}) as my active team.`;
}

type SelectionAgent = {
  addMessage(message: {
    id: string;
    role: 'user';
    content: string;
  }): unknown;
};

type RunResult = {
  newMessages?: unknown[];
};

export async function requestTeamSelection({
  team,
  lang,
  agent,
  runAgent,
  pendingMessageIds,
}: {
  team: UserTeam;
  lang: UiLanguage;
  agent: SelectionAgent;
  runAgent: () => Promise<RunResult>;
  pendingMessageIds: Map<string, string>;
}): Promise<void> {
  if (!pendingMessageIds.has(team.teamId)) {
    const messageId = crypto.randomUUID();
    agent.addMessage({
      id: messageId,
      role: 'user',
      content: buildTeamSelectionMessage(team, lang),
    });
    pendingMessageIds.set(team.teamId, messageId);
  }

  const result = await runAgent();
  if (!result.newMessages || result.newMessages.length === 0) {
    throw new Error('Agent run did not produce a response');
  }
  pendingMessageIds.delete(team.teamId);
}

export function useUserTeamsAction() {
  const { agent } = useAgent({ agentId: 'default' });
  const { copilotkit } = useCopilotKit();
  const pendingMessageIds = useRef(new Map<string, string>());

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

      return (
        <UserTeamsList
          result={typedResult}
          onSelectTeam={(team) =>
            requestTeamSelection({
              team,
              lang: uiLanguageOf(typedResult),
              agent,
              runAgent: () => copilotkit.runAgent({ agent }),
              pendingMessageIds: pendingMessageIds.current,
            })
          }
        />
      );
    },
  });
}

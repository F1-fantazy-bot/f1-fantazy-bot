import { useRenderTool } from '@copilotkit/react-core/v2';
import { toolRenderParameters } from './toolRenderParameters';
import { ActionChoicesCard, writeActionChoices } from './ActionChoicesCard';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';
import {
  WriteConfirmCard,
  isConfirmationRequired,
} from './WriteConfirmCard';
import { InteractiveWriteResult } from './InteractiveWriteResult';
import { isWriteResult, type WriteResult } from './WriteResultCard';
import { safeParse } from './safeParse';
import { ToolLoading, type ToolLoadingKind } from './ToolLoading';
import {
  isSimulationRefreshResult,
  SimulationRefreshCard,
} from './SimulationRefreshCard';
import {
  isResetUserDataResult,
  ResetUserDataCard,
} from './ResetUserDataCard';

// Shared factory for registering the frontend render hook of any
// write tool (or `confirm_write`). Centralises the propose/confirm
// vs. final-result switch so every write tool gets identical UI
// behaviour without per-tool boilerplate.
//
// Usage from `App.tsx#AgentActions`:
//   useWriteAction({ name: 'confirm_write', description: '…' });
//   useWriteAction({ name: 'set_language', description: '…' });
//
// Render-only schemas preserve backend arguments; execution stays on the server.
export type UseWriteActionOptions = {
  name: string;
  description: string;
  loadingLabel?: string;
  loadingKind?: ToolLoadingKind;
};

export function useWriteAction({
  name,
  loadingLabel,
  loadingKind,
}: UseWriteActionOptions) {
  useRenderTool({
    name,
    parameters: toolRenderParameters,
    render: ({ status, result, parameters: args }) => {
      if (status === 'inProgress' || status === 'executing') {
        return (
          <ToolLoading
            kind={loadingKind ?? 'write'}
            englishLabel={loadingLabel}
          />
        );
      }
      const parsed = safeParse(result);

      if (isToolErrorResult(parsed)) {
        return <ToolErrorFallback result={parsed} />;
      }

      if (isConfirmationRequired(parsed)) {
        return <WriteConfirmCard result={parsed} />;
      }
      const choices = writeActionChoices(parsed, args);
      if (choices) return <ActionChoicesCard result={choices} />;

      if (isWriteResult(parsed)) {
        if (isSimulationRefreshResult(parsed)) {
          return <SimulationRefreshCard result={parsed} />;
        }
        if (isResetUserDataResult(parsed)) {
          return <ResetUserDataCard result={parsed} />;
        }
        return <InteractiveWriteResult result={parsed} />;
      }

      // Unknown shape — render a minimal generic card rather than
      // exposing raw JSON to the user.
      return (
        <InteractiveWriteResult
          result={{
            status: 'ok',
            tool: name,
            summary: 'Action complete.',
          } as WriteResult}
        />
      );
    },
  });
}

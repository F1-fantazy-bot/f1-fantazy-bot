import { useCopilotAction } from '@copilotkit/react-core';
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

// Shared factory for registering the frontend render hook of any
// write tool (or `confirm_write`). Centralises the propose/confirm
// vs. final-result switch so every write tool gets identical UI
// behaviour without per-tool boilerplate.
//
// Usage from `App.tsx#AgentActions`:
//   useWriteAction({ name: 'confirm_write', description: '…' });
//   useWriteAction({ name: 'set_language', description: '…' });
//
// `parameters` mirrors the existing read-tool hooks — for render-only
// frontend actions the empty array is sufficient because CopilotKit
// uses the backend tool's authoritative schema when invoking.
export type UseWriteActionOptions = {
  name: string;
  description: string;
  loadingLabel?: string;
  loadingKind?: ToolLoadingKind;
};

export function useWriteAction({
  name,
  description,
  loadingLabel,
  loadingKind,
}: UseWriteActionOptions) {
  useCopilotAction({
    name,
    description,
    parameters: [],
    available: 'frontend',
    render: ({ status, result }) => {
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

      if (isWriteResult(parsed)) {
        if (isSimulationRefreshResult(parsed)) {
          return <SimulationRefreshCard result={parsed} />;
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

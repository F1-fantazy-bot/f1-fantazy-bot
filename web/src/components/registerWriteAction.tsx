import { useCopilotAction } from '@copilotkit/react-core';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';
import {
  WriteConfirmCard,
  isConfirmationRequired,
} from './WriteConfirmCard';
import { WriteResultCard, isWriteResult, type WriteResult } from './WriteResultCard';
import { safeParse } from './safeParse';

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
};

export function useWriteAction({
  name,
  description,
  loadingLabel,
}: UseWriteActionOptions) {
  useCopilotAction({
    name,
    description,
    parameters: [],
    available: 'frontend',
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return (
          <div style={{ padding: 10, color: '#666' }}>
            {loadingLabel ?? 'Working on it…'}
          </div>
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
        return <WriteResultCard result={parsed} />;
      }

      // Unknown shape — render a minimal generic card rather than
      // exposing raw JSON to the user.
      return (
        <WriteResultCard
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

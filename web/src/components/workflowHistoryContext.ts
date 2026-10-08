import { createContext, useContext } from 'react';
export const WorkflowHistoryContext = createContext<{
  clearHistory: () => Promise<void>;
  clearing: boolean;
} | null>(null);
export function useWorkflowHistory() {
  const value = useContext(WorkflowHistoryContext);
  if (!value) throw new Error('Clear history requires a workflow workspace');
  return value;
}

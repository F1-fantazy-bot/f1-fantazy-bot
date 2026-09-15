import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
function notify() { listeners.forEach((listener) => listener()); }
export function useAgentRunActive(agent: object): boolean {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, () => isAgentRunActive(agent), () => false);
}

const activeAgentRuns = new WeakSet<object>();

export function isAgentRunActive(agent: object): boolean {
  return activeAgentRuns.has(agent);
}

export function tryAcquireAgentRun(agent: object): boolean {
  if (activeAgentRuns.has(agent)) return false;
  activeAgentRuns.add(agent);
  notify();

  return true;
}

export function releaseAgentRun(agent: object): void {
  activeAgentRuns.delete(agent);
  notify();
}

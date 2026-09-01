const activeAgentRuns = new WeakSet<object>();

export function isAgentRunActive(agent: object): boolean {
  return activeAgentRuns.has(agent);
}

export function tryAcquireAgentRun(agent: object): boolean {
  if (activeAgentRuns.has(agent)) return false;
  activeAgentRuns.add(agent);

  return true;
}

export function releaseAgentRun(agent: object): void {
  activeAgentRuns.delete(agent);
}

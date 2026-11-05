import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  buildWriteDecisionUrl,
  buildWriteProposalUrl,
  requestWriteDecision,
  requestWriteProposal,
  requestReadChoice,
} from './WriteDecisionContext';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('write proposal client', () => {
  test('builds the sidecar URL from the CopilotKit runtime URL', () => {
    expect(
      buildWriteProposalUrl(
        'https://agent.example.com/api/agent/copilotkit?ignored=true',
      ),
    ).toBe('https://agent.example.com/api/agent/write-proposal');
  });

  test('posts the canonical proposal with the Google bearer token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'confirmation_required',
          tool: 'select_team',
          writeNonce: 'nonce-team',
          summary: 'Change active team.',
        }),
        { status: 200 },
      ),
    );

    await expect(
      requestWriteProposal({
        runtimeUrl: 'https://agent.example.com/api/agent/copilotkit',
        idToken: 'google-token',
        tool: 'select_team',
        args: { teamId: 'T2' },
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      status: 'confirmation_required',
      writeNonce: 'nonce-team',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://agent.example.com/api/agent/write-proposal',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer google-token',
        },
        body: JSON.stringify({
          tool: 'select_team',
          args: { teamId: 'T2' },
        }),
      },
    );
  });
});

describe('buildWriteDecisionUrl', () => {
  test('replaces the CopilotKit route with the decision route', () => {
    expect(
      buildWriteDecisionUrl(
        'https://agent.example.com/api/agent/copilotkit',
      ),
    ).toBe('https://agent.example.com/api/agent/write-decision');
  });

  test('supports a relative local-dev runtime URL', () => {
    expect(buildWriteDecisionUrl('/api/agent/copilotkit')).toBe(
      `${window.location.origin}/api/agent/write-decision`,
    );
  });
});

describe('requestWriteDecision', () => {
  test('posts the nonce and approval with the Google bearer token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ status: 'approved', writeNonce: 'nonce-1' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(
      requestWriteDecision({
        runtimeUrl: 'https://agent.example.com/api/agent/copilotkit',
        idToken: 'google-token',
        writeNonce: 'nonce-1',
        decision: 'approve',
        fetchImpl,
      }),
    ).resolves.toEqual({ status: 'approved', writeNonce: 'nonce-1' });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://agent.example.com/api/agent/write-decision',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer google-token',
        },
        body: JSON.stringify({
          writeNonce: 'nonce-1',
          decision: 'approve',
        }),
      },
    );
  });

  test('omits Authorization in local bypass mode', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'cancelled' }), {
        status: 200,
      }),
    );

    await requestWriteDecision({
      runtimeUrl: '/api/agent/copilotkit',
      writeNonce: 'nonce-1',
      decision: 'cancel',
      fetchImpl,
    });

    expect(fetchImpl.mock.calls[0][1].headers).toEqual({
      'Content-Type': 'application/json',
    });
  });

  test('surfaces the endpoint error and never returns success-shaped data', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'not_found',
          message: 'The pending change has expired.',
        }),
        { status: 404 },
      ),
    );

    await expect(
      requestWriteDecision({
        runtimeUrl: '/api/agent/copilotkit',
        writeNonce: 'expired',
        decision: 'approve',
        fetchImpl,
      }),
    ).rejects.toThrow('The pending change has expired.');
  });
});


test('standings reads send exact selected args with authentication and persist the returned choice card', async () => {
  const result = { status: 'selection_required', choice: 'period', options: [] };
  const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
  const captured = vi.fn();
  window.addEventListener('f1-direct-card-proposal', captured);
  try {
    expect(await requestReadChoice({ runtimeUrl: 'https://agent.example.com/api/agent/copilotkit', idToken: 'google-token', tool: 'get_leaderboard', args: { leagueCode: 'C7' }, fetchImpl })).toEqual(result);
    expect(fetchImpl).toHaveBeenCalledWith('https://agent.example.com/api/agent/read-choice', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer google-token' }, body: JSON.stringify({ tool: 'get_leaderboard', args: { leagueCode: 'C7' } }),
    });
    expect(captured.mock.calls[0][0].detail).toEqual({ tool: 'get_leaderboard', args: { leagueCode: 'C7' }, result });
  } finally { window.removeEventListener('f1-direct-card-proposal', captured); }
});

test.each([401, 500])('failed standings read %s does not create a history card', async (status) => {
  const captured = vi.fn();
  window.addEventListener('f1-direct-card-proposal', captured);
  try {
    await expect(requestReadChoice({ runtimeUrl: 'https://agent.example.com/api/agent/copilotkit', tool: 'get_leaderboard', args: { leagueCode: 'C7' }, fetchImpl: vi.fn().mockResolvedValue(new Response('{}', { status })) })).rejects.toThrow();
    expect(captured).not.toHaveBeenCalled();
  } finally { window.removeEventListener('f1-direct-card-proposal', captured); }
});

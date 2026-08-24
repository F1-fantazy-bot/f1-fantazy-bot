import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  buildWriteDecisionUrl,
  requestWriteDecision,
} from './WriteDecisionContext';

afterEach(() => {
  vi.restoreAllMocks();
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

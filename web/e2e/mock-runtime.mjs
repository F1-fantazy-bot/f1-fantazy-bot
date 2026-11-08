// Synthetic AG-UI transport for the actual application. No production services.
import http from 'node:http';
import fs from 'node:fs';
const fixtures = JSON.parse(
  fs.readFileSync(
    new URL('../src/lib/__fixtures__/toolHistoryResults.json', import.meta.url),
  ),
);
const flows = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const localized = (value, lang) =>
  JSON.parse(
    JSON.stringify(value).replace(/"(?:lang|uiLang)":"he"/g, (match) =>
      match.replace('he', lang),
    ),
  );

http
  .createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization',
    );
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();

      return;
    }
    const json = (body, status = 200) => {
      res
        .writeHead(status, { 'Content-Type': 'application/json' })
        .end(JSON.stringify(body));
    };
    const claims = JSON.parse(
      Buffer.from(
        (req.headers.authorization || '').split('.')[1] || 'e30=',
        'base64',
      ).toString(),
    );
    const lang = claims.lang === 'he' ? 'he' : 'en';
    const owner = claims.sub || 'local';
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
    }
    const input = raw ? JSON.parse(raw) : {};
    if (req.url === '/health') {
      json({ ok: true });

      return;
    }
    if (req.url.endsWith('/whoami')) {
      json({ status: 'ok', mode: 'authenticated', lang });

      return;
    }
    if (req.url.endsWith('/workflows')) {
      json({ workflows: flows.get(owner) || [] });

      return;
    }
    if (req.url.endsWith('/workflow-decision')) {
      if (input.decision === 'cancel_all') {
        flows.set(owner, []);
        json({ status: 'ok', workflows: [] });

        return;
      }
      const flow = (flows.get(owner) || []).find(
        (flow) => flow.id === input.id,
      );
      if (!flow) {
        json({ status: 'not_found' }, 404);

        return;
      }
      if (input.decision === 'resume' || input.decision === 'advance') {
        flow.state = 'completed';
        flow.steps[0].state = 'completed';
        flow.steps[0].result = {
          ...fixtures.get_next_races,
          season: 'Recovered calculation',
        };
      }
      if (input.decision === 'cancel') {
        flow.state = 'cancelled';
      }
      json(flow);

      return;
    }
    if (req.url.endsWith('/write-decision')) {
      await sleep(200); // Duplicate-click tests must cross an asynchronous boundary.
      json(
        input.writeNonce === 'expired'
          ? { status: 'expired', message: 'This confirmation has expired.' }
          : { status: input.decision === 'cancel' ? 'cancelled' : 'approved' },
        input.writeNonce === 'expired' ? 410 : 200,
      );

      return;
    }
    if (req.url.endsWith('/write-proposal')) {
      json({
        status: 'confirmation_required',
        tool: input.tool,
        writeNonce: 'synthetic-direct',
        uiLang: lang,
        summary: 'Synthetic team selection',
        args: input.args,
      });

      return;
    }
    if (!req.url.endsWith('/copilotkit')) {
      json({ error: 'Unexpected fixture request' }, 404);

      return;
    }
    if (input.method === 'info') {
      json({
        version: '1.85.0',
        agents: {
          default: {
            name: 'default',
            description: 'Synthetic test agent',
            capabilities: {
              tools: { supported: true, clientProvided: true },
              transport: { streaming: true },
            },
          },
        },
        mode: 'sse',
        threadEndpoints: {
          list: false,
          inspect: false,
          mutations: false,
          realtimeMetadata: false,
        },
        singleRoute: {
          resourceOperations: true,
          threadEndpoints: {
            list: true,
            inspect: true,
            mutations: false,
            realtimeMetadata: false,
          },
        },
        suggestions: true,
      });

      return;
    }
    if (input.method === 'resource/request') {
      json(input.params.path.startsWith('/threads?') ? { threads: [], nextCursor: null } : { messages: [] });

      return;
    }
    if (!['agent/connect', 'agent/run', 'agent/stop'].includes(input.method)) {
      json({ error: `Unexpected method ${input.method}` }, 400);

      return;
    }
    if (input.method === 'agent/stop') {
      json({ ok: true });

      return;
    }
    const body = input.body;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const event = (value) => {
      if (!res.destroyed) {
        res.write(`data: ${JSON.stringify(value)}\n\n`);
      }
    };
    const start = { threadId: body.threadId, runId: body.runId };
    if (input.method === 'agent/connect') {
      event({ type: 'MESSAGES_SNAPSHOT', messages: [] });
      res.end();

      return;
    }
    event({ type: 'RUN_STARTED', ...start });
    const latest = body.messages.at(-1)?.content || '';
    const prompt =
      body.messages.filter((message) => message.role === 'user').at(-1)
        ?.content || '';
    const assistant = `answer-${body.runId}`;
    const toolCall = (name, id, args = {}) => {
      event({
        type: 'TOOL_CALL_START',
        toolCallId: id,
        toolCallName: name,
        parentMessageId: assistant,
      });
      event({
        type: 'TOOL_CALL_ARGS',
        toolCallId: id,
        delta: JSON.stringify(args),
      });
      event({ type: 'TOOL_CALL_END', toolCallId: id });
    };
    const result = (id, content) =>
      event({
        type: 'TOOL_CALL_RESULT',
        toolCallId: id,
        messageId: `result-${id}`,
        role: 'tool',
        content: JSON.stringify(localized(content, lang)),
      });
    const id = (suffix) => `${body.runId}-${suffix}`;
    if (latest.includes('writeNonce')) {
      toolCall('confirm_write', id('confirm'));
      result(id('confirm'), {
        status: 'ok',
        tool: 'select_team',
        uiLang: lang,
        summary: 'Synthetic change saved',
      });
    } else if (latest.includes('get_best_team_changes')) {
      toolCall('get_best_team_changes', id('changes'), {
        calculationId: 'calculation-fixture',
      });
      result(id('changes'), fixtures.get_best_team_changes);
    } else if (latest.includes('get_current_team')) {
      toolCall('get_current_team', id('team'));
      result(id('team'), fixtures.get_current_team);
    } else if (prompt.includes('confirmation')) {
      toolCall('select_team', id('write'), { teamId: 'T1' });
      result(id('write'), {
        status: 'confirmation_required',
        tool: 'select_team',
        uiLang: lang,
        writeNonce: prompt.includes('expired') ? 'expired' : 'synthetic-nonce',
        summary: 'Synthetic change requiring approval',
      });
    } else if (prompt.includes('workflow')) {
      const flow = {
        id: id('flow'),
        revision: 1,
        createdAt: Date.now(),
        state: 'failed',
        request: prompt,
        steps: [
          {
            id: 'read',
            tool: 'get_next_races',
            summary: 'Calculate team',
            write: false,
            state: 'failed',
          },
        ],
      };
      flows.set(owner, [...(flows.get(owner) || []), flow]);
      toolCall('propose_workflow', id('flowcall'));
      result(id('flowcall'), flow);
    } else if (prompt.includes('catalogue')) {
      for (const [name, value] of Object.entries(fixtures)) {
        toolCall(name, id(name));
        result(id(name), value);
      }
    } else if (prompt.includes('choices')) {
      toolCall('get_action_choices', id('choices'));
      result(id('choices'), fixtures.get_action_choices);
    } else if (prompt.includes('recommendation')) {
      toolCall('get_best_teams', id('best'));
      result(id('best'), fixtures.get_best_teams);
    } else {
      toolCall('get_next_races', id('first'), { marker: 'first' });
      toolCall('get_deadline', id('deadline'));
      toolCall('get_next_races', id('second'), { marker: 'second' });
      // Deliberately complete a repeated tool first; join by call ID, never name.
      result(id('second'), {
        ...fixtures.get_next_races,
        season: 'Second result',
      });
      if (prompt.includes('failed run')) {
        event({
          type: 'RUN_ERROR',
          message: 'Synthetic stream failure',
          code: 'SYNTHETIC_ERROR',
        });
        res.end();

        return;
      }
      await sleep(150);
      result(
        id('deadline'),
        prompt.includes('partial')
          ? {
              status: 'tool_error',
              tool: 'get_deadline',
              uiLang: lang,
              errorId: 'fixture-error',
              userMessage: 'Please try again.',
            }
          : fixtures.get_deadline,
      );
      await sleep(prompt.includes('delayed') ? 1500 : 150);
      result(
        id('first'),
        prompt.includes('empty')
          ? { lang, races: [] }
          : { ...fixtures.get_next_races, season: 'First result' },
      );
    }
    event({
      type: 'TEXT_MESSAGE_START',
      messageId: `${assistant}-text`,
      role: 'assistant',
    });
    event({
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: `${assistant}-text`,
      delta: lang === 'he' ? 'הכרטיסים מוכנים.' : 'The cards are ready.',
    });
    event({ type: 'TEXT_MESSAGE_END', messageId: `${assistant}-text` });
    event({ type: 'RUN_FINISHED', ...start });
    res.end();
  })
  .listen(7079, '127.0.0.1');

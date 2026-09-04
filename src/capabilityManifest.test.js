jest.mock('@copilotkit/runtime/v2', () => ({
  defineTool: jest.fn((spec) => spec),
}));

const fs = require('fs');
const path = require('path');
const constants = require('./constants');
const { COMMAND_HANDLERS } = require('./commandsHandler/commandHandlers');
const { tools } = require('./agent/tools');
const {
  getRegisteredAdminTools,
} = require('./agent/adminAuthorization');
const {
  AUDIENCE,
  AGENT_STATUS,
  COMMAND_CAPABILITIES,
  AGENT_NATIVE_SUPPORTING_TOOLS,
  getCapabilityByCommand,
  findUnwrappedAdminTools,
} = require('./capabilityManifest');

function commandConstants() {
  return Object.entries(constants)
    .filter(
      ([key, value]) =>
        key.startsWith('COMMAND_') && typeof value === 'string',
    )
    .map(([, value]) => value);
}

function actualAgentToolNames() {
  return new Set(tools.map((tool) => tool.name));
}

function functionHasAdminGuard(handler, moduleExports, visited = new Set()) {
  if (visited.has(handler)) {
    return false;
  }
  visited.add(handler);
  const source = handler.toString();
  const directGuardPattern =
    /if\s*\(\s*!\s*isAdminMessage\s*\(\s*[A-Za-z_$][\w$]*\s*\)\s*\)/;
  if (directGuardPattern.test(source)) {
    return true;
  }

  return Object.entries(moduleExports).some(([name, candidate]) => {
    if (
      candidate === handler ||
      typeof candidate !== 'function' ||
      !new RegExp(`\\b${name}\\s*\\(`).test(source)
    ) {
      return false;
    }

    return functionHasAdminGuard(candidate, moduleExports, visited);
  });
}

function adminGuardedCommands() {
  const handlersDirectory = path.join(__dirname, 'commandsHandler');
  const routerSource = fs.readFileSync(
    path.join(handlersDirectory, 'commandHandlers.js'),
    'utf8',
  );
  const moduleByHandler = new Map();
  const importPattern =
    /const\s*\{([^;]+)\}\s*=\s*require\(['"]([^'"]+)['"]\);/g;

  for (const match of routerSource.matchAll(importPattern)) {
    const modulePath = match[2];
    if (!modulePath.startsWith('./')) {
      continue;
    }
    for (const rawName of match[1].split(',')) {
      const handlerName = rawName.trim();
      if (handlerName) {
        moduleByHandler.set(handlerName, modulePath.slice(2));
      }
    }
  }

  const guarded = new Set();
  const unresolvedMappings = [];
  const mappingPattern =
    /\[(COMMAND_[A-Z0-9_]+)\]\s*:\s*([A-Za-z0-9_]+)/g;

  for (const match of routerSource.matchAll(mappingPattern)) {
    const [, constantName, handlerName] = match;
    const moduleName = moduleByHandler.get(handlerName);
    if (!moduleName) {
      unresolvedMappings.push(`${constantName}:${handlerName}`);
      continue;
    }
    const moduleExports = require(
      path.join(handlersDirectory, `${moduleName}.js`),
    );
    const routedHandler = COMMAND_HANDLERS[constants[constantName]];
    if (!Object.values(moduleExports).includes(routedHandler)) {
      throw new Error(
        `Routed handler ${handlerName} is not exported by ${moduleName}.js`,
      );
    }
    if (functionHasAdminGuard(routedHandler, moduleExports)) {
      guarded.add(constants[constantName]);
    }
  }
  if (unresolvedMappings.length > 0) {
    throw new Error(
      `Could not resolve routed handlers: ${unresolvedMappings.join(', ')}`,
    );
  }

  return guarded;
}

test('classifies every Telegram command exactly once', () => {
  const commands = commandConstants();
  const manifestCommands = COMMAND_CAPABILITIES.map((entry) => entry.command);

  expect(commands).toHaveLength(50);
  expect(new Set(manifestCommands).size).toBe(manifestCommands.length);
  expect([...manifestCommands].sort()).toEqual([...commands].sort());
});

test('requires a registered Telegram handler for every command', () => {
  for (const { command, telegram } of COMMAND_CAPABILITIES) {
    expect(telegram.implemented).toBe(true);
    expect(COMMAND_HANDLERS[command]).toEqual(expect.any(Function));
  }
});

test('keeps implemented and adapted mappings on registered agent tools', () => {
  const actualTools = actualAgentToolNames();

  for (const { command, agent } of COMMAND_CAPABILITIES) {
    if (
      agent.status !== AGENT_STATUS.IMPLEMENTED &&
      agent.status !== AGENT_STATUS.ADAPTED
    ) {
      continue;
    }
    expect(agent.tools.length).toBeGreaterThan(0);
    for (const toolName of agent.tools) {
      expect({
        command,
        toolName,
        registered: actualTools.has(toolName),
      }).toEqual({
        command,
        toolName,
        registered: true,
      });
    }
  }
});

test('accounts for every registered agent tool', () => {
  expect(tools.map((tool) => tool.name)).toHaveLength(
    actualAgentToolNames().size,
  );

  const mappedTools = new Set(
    COMMAND_CAPABILITIES.flatMap((entry) =>
      entry.agent.status === AGENT_STATUS.IMPLEMENTED ||
      entry.agent.status === AGENT_STATUS.ADAPTED
        ? entry.agent.tools
        : [],
    ),
  );
  const accountedFor = new Set([
    ...mappedTools,
    ...AGENT_NATIVE_SUPPORTING_TOOLS,
  ]);

  expect([...actualAgentToolNames()].sort()).toEqual(
    [...accountedFor].sort(),
  );
});

test('requires explicit rationale for adapted and excluded commands', () => {
  for (const { command, agent } of COMMAND_CAPABILITIES) {
    if (
      agent.status === AGENT_STATUS.ADAPTED ||
      agent.status === AGENT_STATUS.EXCLUDED
    ) {
      expect({ command, rationale: agent.rationale.trim() }).toEqual({
        command,
        rationale: expect.any(String),
      });
      expect(agent.rationale.trim().length).toBeGreaterThan(0);
    }
    if (agent.status === AGENT_STATUS.EXCLUDED) {
      expect(agent.tools).toEqual([]);
    }
  }
});

test('matches Telegram menu audience', () => {
  const adminMenuCommands = new Set(
    Object.values(constants.MENU_CATEGORIES)
      .filter((category) => category.adminOnly)
      .flatMap((category) =>
        category.commands.map((command) => command.constant),
      ),
  );

  for (const entry of COMMAND_CAPABILITIES) {
    expect(entry.audience).toBe(
      adminMenuCommands.has(entry.command)
        ? AUDIENCE.ADMIN
        : AUDIENCE.USER,
    );
  }

  const manifestAdminCommands = new Set(
    COMMAND_CAPABILITIES.filter(
      (entry) => entry.audience === AUDIENCE.ADMIN,
    ).map((entry) => entry.command),
  );
  expect([...adminGuardedCommands()].sort()).toEqual(
    [...manifestAdminCommands].sort(),
  );
});

test('requires implemented admin tools to use the central admin wrapper', () => {
  const registeredAdminTools = getRegisteredAdminTools();

  expect(
    findUnwrappedAdminTools(
      COMMAND_CAPABILITIES,
      tools,
      registeredAdminTools,
    ),
  ).toEqual([]);

  const wrappedTool = { name: 'unsafe_admin_tool' };
  const unguardedCatalogTool = { name: 'unsafe_admin_tool' };
  const implementedAdminFixture = [
    {
      audience: AUDIENCE.ADMIN,
      agent: {
        status: AGENT_STATUS.IMPLEMENTED,
        tools: ['unsafe_admin_tool'],
      },
    },
  ];
  expect(
    findUnwrappedAdminTools(
      implementedAdminFixture,
      [unguardedCatalogTool],
      new Map([['unsafe_admin_tool', wrappedTool]]),
    ),
  ).toEqual(['unsafe_admin_tool']);
  expect(
    findUnwrappedAdminTools(
      implementedAdminFixture,
      [wrappedTool, unguardedCatalogTool],
      new Map([['unsafe_admin_tool', wrappedTool]]),
    ),
  ).toEqual(['unsafe_admin_tool']);
});

test('has no remaining planned admin rollout work', () => {
  const plannedAdminCommands = COMMAND_CAPABILITIES.filter(
    (entry) =>
      entry.audience === AUDIENCE.ADMIN &&
      entry.agent.status === AGENT_STATUS.PLANNED,
  ).map((entry) => entry.command);

  expect(plannedAdminCommands).toEqual([]);
});

test('pins the four approved exceptions and adapted Teams Tracker flow', () => {
  const excluded = COMMAND_CAPABILITIES.filter(
    (entry) => entry.agent.status === AGENT_STATUS.EXCLUDED,
  ).map((entry) => entry.command);

  expect(excluded.sort()).toEqual(
    [
      constants.COMMAND_MENU,
      constants.COMMAND_START,
      constants.COMMAND_UPLOAD_CONSTRUCTORS_PHOTO,
      constants.COMMAND_UPLOAD_DRIVERS_PHOTO,
    ].sort(),
  );
  expect(
    getCapabilityByCommand(constants.COMMAND_TEAMS_TRACKER)?.agent.status,
  ).toBe(AGENT_STATUS.ADAPTED);
});

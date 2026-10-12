// Execute a standings card with its exact arguments, without model inference.
const { runWithRequestContext, getRequestContext } = require('./requestContext');

async function applyReadChoice({ chatId, payload }) {
  if (!payload || payload.tool !== 'get_leaderboard' ||
      !payload.args || typeof payload.args !== 'object' || Array.isArray(payload.args)) {
    return { status: 400, body: { status: 'invalid_input' } };
  }
  const { tools } = require('./tools');
  const tool = tools.find((candidate) => candidate.name === payload.tool);
  const parsed = tool.parameters.strict().safeParse(payload.args);
  if (!parsed.success) {
    return { status: 400, body: { status: 'invalid_input' } };
  }
  const body = await runWithRequestContext(
    { ...getRequestContext(), chatId },
    () => tool.execute(parsed.data),
  );

  return { status: 200, body };
}
module.exports = { applyReadChoice };

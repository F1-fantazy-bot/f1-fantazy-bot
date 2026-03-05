const bot = require('../src/bot');

module.exports = async function (context, req) {
  try {
    // Ensure caches are initialized before handling the first message.
    // On cold start this waits for initialization; on warm invocations
    // the promise is already resolved so this returns instantly.
    await bot.cacheReady;

    const update = req.body;

    // Pass to node-telegram-bot-api
    await bot.processUpdate(update);

    context.res = { status: 200 };
  } catch (err) {
    context.log('Error handling update', err);
    context.res = { status: 500, body: 'Internal Server Error' };
  }
};

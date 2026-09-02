// Pure announcement result construction shared by Telegram and the web agent.
// Reading the committed announcements file remains owned by announcementsService;
// this core only turns its latest entry into a safe, structured public result.

function buildWhatsNewResult(latest) {
  if (
    !latest ||
    typeof latest !== 'object' ||
    Array.isArray(latest) ||
    typeof latest.text !== 'string' ||
    latest.text.length === 0
  ) {
    return { status: 'empty', announcement: null };
  }

  return {
    status: 'ok',
    announcement: {
      id: typeof latest.id === 'string' ? latest.id : null,
      createdAt:
        typeof latest.createdAt === 'string' ||
        typeof latest.createdAt === 'number'
          ? latest.createdAt
          : null,
      version: latest.version === 'wow' ? 'wow' : 'standard',
      // Preserve the source Markdown verbatim. Telegram owns Markdown
      // transport escaping; the web component renders this safely as text.
      text: latest.text,
    },
  };
}

module.exports = { buildWhatsNewResult };

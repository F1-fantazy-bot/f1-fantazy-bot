// Safe, structured admin-read view models shared by Telegram adapters and
// the web agent. This module is deliberately pure: callers provide source
// rows/configuration and decide how to retrieve or render them.

const ADMIN_DIRECTORY_RESULT_LIMIT = 100;
const BILLING_SERVICE_RESULT_LIMIT = 25;
const BOTFATHER_COMMAND_RESULT_LIMIT = 50;
const MAX_TEXT_LENGTH = 500;

function cappedText(value, fallback = null, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed.slice(0, maxLength);
}

function validIso(value) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    return null;
  }

  return new Date(value).toISOString();
}

function sortUsersByLastSeenDesc(users) {
  return [...(Array.isArray(users) ? users : [])].sort((a, b) => {
    const lastSeenA = Date.parse(a?.lastSeen);
    const lastSeenB = Date.parse(b?.lastSeen);

    if (Number.isNaN(lastSeenA) && Number.isNaN(lastSeenB)) {
      return 0;
    }
    if (Number.isNaN(lastSeenA)) {
      return 1;
    }
    if (Number.isNaN(lastSeenB)) {
      return -1;
    }

    return lastSeenB - lastSeenA;
  });
}

function sortWebUsersByAddedAtDesc(users) {
  return [...(Array.isArray(users) ? users : [])].sort((a, b) => {
    const addedA = Date.parse(a?.addedAt);
    const addedB = Date.parse(b?.addedAt);

    if (Number.isNaN(addedA) && Number.isNaN(addedB)) {
      return 0;
    }
    if (Number.isNaN(addedA)) {
      return 1;
    }
    if (Number.isNaN(addedB)) {
      return -1;
    }

    return addedB - addedA;
  });
}

function boundedLimit(limit, maximum) {
  const requestedLimit = Number.isSafeInteger(limit) && limit > 0
    ? limit
    : maximum;

  return Math.min(requestedLimit, maximum);
}

function limitRows(rows, limit, maximum = ADMIN_DIRECTORY_RESULT_LIMIT) {
  const boundedResultLimit = boundedLimit(limit, maximum);
  const totalCount = rows.length;
  const items = rows.slice(0, boundedResultLimit);

  return {
    items,
    totalCount,
    displayedCount: items.length,
    truncated: totalCount > items.length,
  };
}

function buildBotUserDirectory(users, { limit = ADMIN_DIRECTORY_RESULT_LIMIT } = {}) {
  const sorted = sortUsersByLastSeenDesc(users);
  const view = limitRows(sorted, limit);
  const { items, ...metadata } = view;

  return {
    ...metadata,
    users: items.map((user) => ({
      chatId: cappedText(String(user?.chatId ?? ''), null, 80),
      chatName: cappedText(user?.chatName, null),
      nickname: cappedText(user?.nickname, null),
      lang: user?.lang === 'he' ? 'he' : 'en',
      firstSeen: validIso(user?.firstSeen),
      lastSeen: validIso(user?.lastSeen),
    })),
  };
}

function buildWebUserDirectory(
  allowedUsers,
  registryUsers,
  { limit = ADMIN_DIRECTORY_RESULT_LIMIT } = {},
) {
  const registryByChatId = new Map(
    (Array.isArray(registryUsers) ? registryUsers : []).map((user) => [
      String(user?.chatId),
      user,
    ]),
  );
  const sorted = sortWebUsersByAddedAtDesc(allowedUsers);
  const view = limitRows(sorted, limit);
  const { items, ...metadata } = view;

  return {
    ...metadata,
    users: items.map((row) => {
      const chatId = cappedText(String(row?.chatId ?? ''), null, 80);
      const linkedUser = chatId ? registryByChatId.get(chatId) : null;

      return {
        email: cappedText(row?.email, null),
        chatId,
        linkedDisplay: cappedText(
          linkedUser?.nickname || linkedUser?.chatName,
          null,
        ),
        addedAt: validIso(row?.addedAt),
        addedBy: cappedText(String(row?.addedBy ?? ''), null, 80),
      };
    }),
  };
}

function buildVersionInfo(environment = {}) {
  return {
    commitId: cappedText(environment.COMMIT_ID, 'N/A', 120),
    commitMessage: cappedText(environment.COMMIT_MESSAGE, 'N/A'),
    commitLink: cappedText(environment.COMMIT_LINK, 'N/A'),
  };
}

function normalizeBillingMonth(month, { serviceLimit }) {
  const services = Array.isArray(month?.serviceBreakdown)
    ? month.serviceBreakdown
      .filter((service) => Number.isFinite(Number(service?.cost)))
      .slice(0, serviceLimit)
      .map((service) => ({
        serviceName: cappedText(service?.serviceName, 'Unknown service', 160),
        cost: Number(Number(service.cost).toFixed(2)),
        currency: cappedText(service?.currency, 'USD', 12),
      }))
    : [];
  const totalServices = Array.isArray(month?.serviceBreakdown)
    ? month.serviceBreakdown.length
    : 0;

  return {
    hasData: Boolean(month?.hasData),
    totalCost: Number.isFinite(Number(month?.totalCost))
      ? Number(Number(month.totalCost).toFixed(2))
      : 0,
    period: {
      monthName: cappedText(month?.period?.monthName, null, 80),
      year: Number.isSafeInteger(Number(month?.period?.year))
        ? Number(month.period.year)
        : null,
      startDate: cappedText(month?.period?.startDate, null, 32),
      endDate: cappedText(month?.period?.endDate, null, 32),
    },
    services,
    totalServices,
    truncated: totalServices > services.length,
  };
}

function billingComparison(currentMonth, previousMonth) {
  if (!currentMonth?.hasData || !previousMonth?.hasData) {
    return null;
  }

  const difference = currentMonth.totalCost - previousMonth.totalCost;
  const percentage = previousMonth.totalCost > 0
    ? (difference / previousMonth.totalCost) * 100
    : 0;

  return { difference, percentage };
}

function buildBillingView(
  billingData,
  { serviceLimit = BILLING_SERVICE_RESULT_LIMIT } = {},
) {
  const boundedServiceLimit = boundedLimit(
    serviceLimit,
    BILLING_SERVICE_RESULT_LIMIT,
  );
  const currentMonth = normalizeBillingMonth(billingData?.currentMonth, {
    serviceLimit: boundedServiceLimit,
  });
  const previousMonth = normalizeBillingMonth(billingData?.previousMonth, {
    serviceLimit: boundedServiceLimit,
  });

  const comparison = billingComparison(currentMonth, previousMonth);

  return {
    currentMonth,
    previousMonth,
    comparison: comparison
      ? {
        difference: Number(comparison.difference.toFixed(2)),
        percentage: Number(comparison.percentage.toFixed(1)),
      }
      : null,
  };
}

function buildBotfatherSetup(
  commands,
  { limit = BOTFATHER_COMMAND_RESULT_LIMIT } = {},
) {
  const boundedResultLimit = boundedLimit(
    limit,
    BOTFATHER_COMMAND_RESULT_LIMIT,
  );
  const safeCommands = (Array.isArray(commands) ? commands : []).map((cmd) => ({
    command: cappedText(String(cmd?.constant || '').replace(/^\//, ''), null, 80),
    description: cappedText(cmd?.description, null, 240),
  })).filter((cmd) => cmd.command && cmd.description);
  const items = safeCommands.slice(0, boundedResultLimit);

  return {
    commands: items,
    totalCount: safeCommands.length,
    displayedCount: items.length,
    truncated: safeCommands.length > items.length,
  };
}

module.exports = {
  ADMIN_DIRECTORY_RESULT_LIMIT,
  BILLING_SERVICE_RESULT_LIMIT,
  BOTFATHER_COMMAND_RESULT_LIMIT,
  cappedText,
  sortUsersByLastSeenDesc,
  sortWebUsersByAddedAtDesc,
  buildBotUserDirectory,
  buildWebUserDirectory,
  buildVersionInfo,
  billingComparison,
  buildBillingView,
  buildBotfatherSetup,
};

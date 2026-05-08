const { DefaultAzureCredential } = require('@azure/identity');

const MANAGEMENT_SCOPE = 'https://management.azure.com/.default';
const LOGIC_APP_API_VERSION = '2019-05-01';
const DEFAULT_RESOURCE_GROUP = 'f1-fantazy-bot';

const TRIGGER_MODES = {
  CALLBACK: 'callback',
  RUN: 'run',
};

const MANUAL_TRIGGERS = {
  scraper: {
    label: 'F1 Fantasy Scraper',
    workflowName: 'f1-fantasy-scraper-runner',
    triggerName: 'manual',
    mode: TRIGGER_MODES.CALLBACK,
  },
  api_data: {
    label: 'API Data',
    workflowName: 'f1-fantasy-api-data-runner',
    triggerName: 'manual',
    mode: TRIGGER_MODES.CALLBACK,
  },
  api_data_locked: {
    label: 'API Data Locked',
    workflowName: 'f1-fantasy-api-data-runner-locked',
    triggerName: 'manual',
    mode: TRIGGER_MODES.CALLBACK,
  },
  next_race_info: {
    label: 'Next Race Info Scheduler',
    workflowName: 'f1-fantasy-next-race-info-scheduler',
    triggerName: 'Every_Monday',
    mode: TRIGGER_MODES.RUN,
  },
  live_score_scheduler: {
    label: 'Live Score Scheduler',
    workflowName: 'f1-fantasy-live-score-scheduler',
    triggerName: 'Poll_Schedule',
    mode: TRIGGER_MODES.RUN,
  },
};

function getAzureConfig() {
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  if (!subscriptionId) {
    throw new Error(
      'Missing required Azure configuration: AZURE_SUBSCRIPTION_ID',
    );
  }

  return {
    subscriptionId,
    resourceGroup: process.env.AZURE_RESOURCE_GROUP || DEFAULT_RESOURCE_GROUP,
  };
}

function getCredential() {
  return new DefaultAzureCredential();
}

async function getManagementToken() {
  const token = await getCredential().getToken(MANAGEMENT_SCOPE);
  if (!token || !token.token) {
    throw new Error('Failed to acquire Azure Management API token');
  }

  return token.token;
}

function buildTriggerUrl({ subscriptionId, resourceGroup }, trigger, action) {
  const encodedResourceGroup = encodeURIComponent(resourceGroup);
  const encodedWorkflow = encodeURIComponent(trigger.workflowName);
  const encodedTrigger = encodeURIComponent(trigger.triggerName);

  return `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${encodedResourceGroup}/providers/Microsoft.Logic/workflows/${encodedWorkflow}/triggers/${encodedTrigger}/${action}?api-version=${LOGIC_APP_API_VERSION}`;
}

async function readErrorBody(response) {
  try {
    const text = await response.text();

    return text || response.statusText;
  } catch {
    return response.statusText;
  }
}

async function postManagementUrl(url, token) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new Error(`Azure Management API failed (${response.status}): ${body}`);
  }

  return response;
}

async function getCallbackUrl(azureConfig, trigger, token) {
  const response = await postManagementUrl(
    buildTriggerUrl(azureConfig, trigger, 'listCallbackUrl'),
    token,
  );
  const body = await response.json();

  if (!body || !body.value) {
    throw new Error('Azure Management API did not return a callback URL');
  }

  return body.value;
}

async function invokeCallbackTrigger(azureConfig, trigger, token) {
  const callbackUrl = await getCallbackUrl(azureConfig, trigger, token);
  const response = await fetch(callbackUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });

  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new Error(`Logic App callback failed (${response.status}): ${body}`);
  }
}

async function runSchedulerTrigger(azureConfig, trigger, token) {
  await postManagementUrl(buildTriggerUrl(azureConfig, trigger, 'run'), token);
}

async function triggerManualJob(triggerId) {
  const trigger = MANUAL_TRIGGERS[triggerId];
  if (!trigger) {
    return {
      success: false,
      error: `Unknown manual trigger: ${triggerId}`,
    };
  }

  try {
    const azureConfig = getAzureConfig();
    const token = await getManagementToken();

    if (trigger.mode === TRIGGER_MODES.CALLBACK) {
      await invokeCallbackTrigger(azureConfig, trigger, token);
    } else if (trigger.mode === TRIGGER_MODES.RUN) {
      await runSchedulerTrigger(azureConfig, trigger, token);
    } else {
      throw new Error(`Unsupported manual trigger mode: ${trigger.mode}`);
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  MANUAL_TRIGGERS,
  TRIGGER_MODES,
  triggerManualJob,
};

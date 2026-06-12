import type { Page, Route } from '@playwright/test';

type JsonBody = Record<string, unknown> | unknown[];
type NullHubFixtureOptions = {
  requests?: string[];
  spacesStatus?: number;
  status?: JsonBody;
  events?: Record<string, unknown>[];
  eventsStatus?: number;
  loopCatalog?: JsonBody;
  loopCatalogStatus?: number;
  nullticketsPipelines?: Record<string, unknown>[];
  nullticketsTasks?: Record<string, unknown>[];
  nullboilerRuns?: Record<string, unknown>[];
  nullwatchRuns?: Record<string, unknown>[];
  instances?: Record<string, Record<string, unknown>>;
  instanceConfig?: JsonBody;
  instanceUsage?: JsonBody;
};

async function fulfillJson(route: Route, body: JsonBody, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function fulfillText(route: Route, body: string, contentType: string) {
  await route.fulfill({
    status: 200,
    contentType,
    body,
  });
}

const fixtureStatus = {
  ok: true,
  version: 'playwright-fixture',
  components: {
    nulltickets: { status: 'stopped', running: 0 },
    nullboiler: { status: 'stopped', running: 0 },
    nullwatch: { status: 'stopped', running: 0 },
  },
  instances: {},
};

const fixtureComponents = {
  components: [
    {
      name: 'nullclaw',
      display_name: 'NullClaw',
      description: 'Autonomous AI agent runtime.',
      installable: true,
      instance_count: 0,
      stage: 'stable',
    },
    {
      name: 'nulltickets',
      display_name: 'NullTickets',
      description: 'Ticket-backed loop runtime.',
      installable: true,
      instance_count: 0,
      stage: 'stable',
    },
  ],
};

const fixtureSpaces = [
  { id: 'ops', name: 'Operations', kind: 'workspace', stage: 'active' },
  { id: 'lab', name: 'Lab', kind: 'workspace', stage: 'paused' },
];

const fixtureSettings = {
  port: 19800,
  host: '127.0.0.1',
  auth_token: null,
  auto_update_check: true,
  access: null,
};

const fixtureServiceStatus = {
  status: 'ok',
  message: '',
  registered: false,
  running: false,
  service_type: '',
  unit_path: '',
};

const missionControlState = {
  schema_version: 1,
  mode: 'deterministic_local_replay',
  scenario_id: 'mission-control-smoke',
  scenario_version: '1',
  generated_at_ms: 1_730_000_000_000,
  mission_id: 'mission-control-smoke',
  title: 'Mission Control Smoke',
  status: 'idle',
  phase: 'idle',
  headline: 'Mission ready. Launch the local agent stack.',
  elapsed_ms: 0,
  progress: 0,
  active_run_id: null,
  failed_run_id: null,
  recovered_run_id: null,
  controls: {
    can_launch: true,
    can_recover: false,
    can_reset: true,
  },
  agents: [],
  graph: {
    nodes: [],
    edges: [],
  },
  events: [],
  telemetry: {
    runs: 0,
    spans: 0,
    evals: 0,
    errors: 0,
    total_tokens: 0,
    total_cost_usd: 0,
    verdict: 'pass',
  },
  workflow_evidence: {
    status: 'not_configured',
    source: 'fixture',
    boiler_instance: null,
    failed_run: null,
    recovered_run: null,
    checkpoint: null,
    scanned_run_count: 0,
    reason: null,
  },
  replay_comparison: null,
  failure: null,
  recovery: null,
};

const missionControlReplays = {
  items: [],
  count: 0,
};

const fixtureLoopCatalog = [
  {
    key: 'support-triage',
    value: {
      slug: 'support-triage',
      name: 'Support Triage',
      category: 'Support',
      machine: 'Support Machine',
      tagline: 'Triage inbound support requests until each one has an owner.',
      goal: 'Every new support request has a clear owner and next action.',
      exit_condition: 'All incoming requests have an owner and next action.',
      check_instruction: 'Check each request for owner and next action. Continue until none are missing.',
      max_iterations: 4,
      starter: {
        title: 'Triage support inbox',
        description: 'Review the latest support requests and assign owners.',
        priority: 60,
      },
    },
  },
];

const fixtureEvents = [
  {
    id: 3,
    space_id: 'ops',
    type: 'loop.review_requested',
    source: 'nulltickets',
    subject_type: 'loop_run',
    subject_id: 'loop-3',
    title: 'Review requested',
    summary: 'Athena finished a support loop and needs approval.',
    severity: 'warning',
    evidence_ref: 'artifact://loop-3',
    created_at_ms: 1_780_000_000_000,
    payload: { agent: 'Athena' },
  },
  {
    id: 2,
    space_id: 'ops',
    type: 'workflow.completed',
    source: 'nullboiler',
    subject_type: 'workflow_run',
    subject_id: 'workflow-2',
    title: 'Workflow completed',
    summary: 'Iris delivered the onboarding workflow result.',
    severity: 'success',
    evidence_ref: 'artifact://workflow-2',
    created_at_ms: 1_779_999_700_000,
    payload: { agent: 'Iris' },
  },
  {
    id: 1,
    space_id: 'lab',
    type: 'agent.note',
    source: 'dispatcher',
    subject_type: 'task',
    subject_id: 'task-1',
    title: 'Lab note captured',
    summary: 'Lab space dispatcher recorded a note.',
    severity: 'info',
    evidence_ref: '',
    created_at_ms: 1_779_999_500_000,
    payload: { agent: 'Athena' },
  },
];

const fixtureInstanceConfig = {
  agents: {
    defaults: {
      model: {
        primary: 'openrouter/openai/gpt-5.5',
      },
    },
  },
  models: {
    providers: {
      openrouter: {
        api_key: 'fixture-key',
      },
    },
  },
};

const fixtureInstanceUsage = {
  window: '7d',
  generated_at: 1_780_870_800,
  rows: [
    {
      provider: 'openrouter',
      model: 'openai/gpt-5.5',
      prompt_tokens: 1200,
      completion_tokens: 480,
      total_tokens: 1680,
      requests: 6,
      last_used: 1_780_870_800,
    },
  ],
  totals: {
    prompt_tokens: 1200,
    completion_tokens: 480,
    total_tokens: 1680,
    requests: 6,
  },
};

function requestPath(route: Route): string {
  const url = new URL(route.request().url());
  return `${url.pathname}${url.search}`;
}

function recordRequest(route: Route, options: NullHubFixtureOptions) {
  options.requests?.push(requestPath(route));
}

async function jsonRoute(route: Route, options: NullHubFixtureOptions, body: JsonBody, status = 200) {
  recordRequest(route, options);
  await fulfillJson(route, body, status);
}

function fixtureProviders(space: string | null): JsonBody {
  if (space === 'ops') {
    return {
      providers: [
        {
          id: 'ops-provider',
          name: 'Ops Provider',
          provider: 'openrouter',
          model: 'openai/gpt-5.5',
          base_url: '',
          validated_at: '2026-06-11T00:00:00Z',
          last_validation_at: '2026-06-11T00:00:00Z',
          last_validation_ok: true,
        },
      ],
    };
  }
  if (space === 'lab') {
    return {
      providers: [
        {
          id: 'lab-provider',
          name: 'Lab Provider',
          provider: 'openrouter',
          model: 'openai/gpt-5.5-mini',
          base_url: '',
          validated_at: '2026-06-11T00:00:00Z',
          last_validation_at: '2026-06-11T00:00:00Z',
          last_validation_ok: true,
        },
      ],
    };
  }
  return { providers: [] };
}

async function spacesRoute(route: Route, options: NullHubFixtureOptions, spaces: typeof fixtureSpaces) {
  recordRequest(route, options);
  if (options.spacesStatus && options.spacesStatus >= 400) {
    await fulfillJson(route, { error: 'Spaces unavailable.' }, options.spacesStatus);
    return;
  }
  if (route.request().method() === 'POST') {
    const payload = route.request().postDataJSON() as { name?: string; kind?: string; stage?: string } | null;
    const name = String(payload?.name ?? '').trim();
    const created = {
      id: name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-') || `space-${spaces.length + 1}`,
      name: name || `Space ${spaces.length + 1}`,
      kind: payload?.kind || 'workspace',
      stage: payload?.stage || 'active',
    };
    spaces.push(created);
    await fulfillJson(route, created, 201);
    return;
  }
  await fulfillJson(route, { spaces });
}

async function loopCatalogRoute(route: Route, options: NullHubFixtureOptions) {
  recordRequest(route, options);
  if (options.loopCatalogStatus && options.loopCatalogStatus >= 400) {
    await fulfillJson(route, { error: 'Remote loop catalog unavailable.' }, options.loopCatalogStatus);
    return;
  }
  await fulfillJson(route, options.loopCatalog || fixtureLoopCatalog);
}

async function eventsRoute(route: Route, options: NullHubFixtureOptions) {
  recordRequest(route, options);
  if (options.eventsStatus && options.eventsStatus >= 400) {
    await fulfillJson(route, { error: 'Events unavailable.' }, options.eventsStatus);
    return;
  }

  const url = new URL(route.request().url());
  const space = url.searchParams.get('space');
  if (!space) {
    await fulfillJson(route, { error: 'Events require a selected space.' }, 400);
    return;
  }
  const source = url.searchParams.get('source');
  const level = url.searchParams.get('severity');
  const type = url.searchParams.get('type');
  const subjectType = url.searchParams.get('subject_type');
  const subjectId = url.searchParams.get('subject_id');
  const limit = Number(url.searchParams.get('limit') || '50');
  const events = (options.events || fixtureEvents).filter((event) => {
    if (space && event.space_id !== space) return false;
    if (source && event.source !== source) return false;
    if (level && event.severity !== level) return false;
    if (type && event.type !== type) return false;
    if (subjectType && event.subject_type !== subjectType) return false;
    if (subjectId && event.subject_id !== subjectId) return false;
    return true;
  });

  await fulfillJson(route, {
    events: events.slice(0, Number.isFinite(limit) ? limit : 50),
    has_more: false,
    next_cursor: null,
  });
}

function matchesFixtureSpace(record: Record<string, unknown>, space: string | null): boolean {
  const recordSpace = String(record.space_id ?? record.spaceId ?? '').trim();
  if (!space) return true;
  return !recordSpace || recordSpace === space;
}

async function instancesRoute(route: Route, options: NullHubFixtureOptions) {
  recordRequest(route, options);
  const url = new URL(route.request().url());
  const space = url.searchParams.get('space');
  const source = (options.status || fixtureStatus) as Record<string, any>;
  const sourceInstances = (options.instances || source.instances || {}) as Record<string, Record<string, unknown>>;
  const instances: Record<string, Record<string, unknown>> = {};

  for (const [component, componentInstances] of Object.entries(sourceInstances)) {
    const filtered = Object.fromEntries(
      Object.entries(componentInstances).filter(([, instance]) =>
        matchesFixtureSpace((instance || {}) as Record<string, unknown>, space),
      ),
    );
    if (Object.keys(filtered).length > 0) instances[component] = filtered;
  }

  await fulfillJson(route, { instances });
}

async function nullTicketsActionRoute(
  route: Route,
  options: NullHubFixtureOptions,
  pipelines: Record<string, unknown>[],
  tasks: Record<string, unknown>[],
) {
  recordRequest(route, options);
  const url = new URL(route.request().url());
  const payload = route.request().postDataJSON() as { method?: string; path?: string; payload?: any } | null;
  const method = String(payload?.method || 'GET').toUpperCase();
  const path = String(payload?.path || '');
  const parts = url.pathname.split('/').filter(Boolean);
  const instanceName = parts[3] || 'tickets';

  if (method === 'GET' && path === '/pipelines') {
    const space = url.searchParams.get('space');
    const instancePipelines = pipelines.filter((pipeline) => {
      const pipelineInstance = String(pipeline.tickets_instance ?? pipeline.ticketsInstance ?? instanceName);
      return pipelineInstance === instanceName && matchesFixtureSpace(pipeline, space);
    });
    await fulfillJson(route, { pipelines: instancePipelines });
    return;
  }

  if (method === 'GET' && (path === '/tasks' || path.startsWith('/tasks?'))) {
    const space = url.searchParams.get('space');
    const query = new URL(path, 'http://nulltickets.local').searchParams;
    const limit = Number(query.get('limit') || '50');
    const filteredTasks = tasks.filter((task) => matchesFixtureSpace(task, space));
    await fulfillJson(route, { items: filteredTasks.slice(0, Number.isFinite(limit) ? limit : 50) });
    return;
  }

  if (method === 'GET' && path.startsWith('/tasks/')) {
    const space = url.searchParams.get('space');
    const taskId = decodeURIComponent(path.split('/')[2] || '');
    const task = tasks.find((item) => String(item.id || '') === taskId && matchesFixtureSpace(item, space));
    await fulfillJson(route, task || { error: 'Task not found.' }, task ? 200 : 404);
    return;
  }

  if (method === 'POST' && path === '/pipelines') {
    const draft = payload?.payload || {};
    const name = String(draft.name || `pipeline-${pipelines.length + 1}`);
    const created = {
      id: name,
      name,
      definition: draft.definition || {},
      tickets_instance: instanceName,
      created_at_ms: Date.now(),
    };
    pipelines.push(created);
    await fulfillJson(route, { pipeline: created }, 201);
    return;
  }

  await fulfillJson(route, { error: 'Unsupported NullTickets fixture action.' }, 404);
}

async function instanceDetailRoute(route: Route, options: NullHubFixtureOptions) {
  recordRequest(route, options);
  const url = new URL(route.request().url());
  const parts = url.pathname.split('/').filter(Boolean);
  const action = parts[4] || '';

  if (action === 'config') {
    await fulfillJson(route, options.instanceConfig || fixtureInstanceConfig);
    return;
  }
  if (action === 'provider-health') {
    await fulfillJson(route, {
      provider: 'openrouter',
      model: 'openai/gpt-5.5',
      configured: true,
      live_ok: true,
      status: 'ok',
    });
    return;
  }
  if (action === 'usage') {
    await fulfillJson(route, options.instanceUsage || fixtureInstanceUsage);
    return;
  }
  if (action === 'integration') {
    await fulfillJson(route, {
      linked_watch: null,
      available_watches: [],
      current_link: null,
    });
    return;
  }
  if (action === 'onboarding') {
    await fulfillJson(route, {
      supported: true,
      pending: false,
    });
    return;
  }
  if (action === 'history') {
    if (url.searchParams.get('session_id')) {
      await fulfillJson(route, {
        messages: [
          {
            role: 'user',
            content: 'What is on your plate?',
            created_at: '2026-06-12T00:00:00Z',
          },
          {
            role: 'assistant',
            content: 'I am handling the current loop review.',
            created_at: '2026-06-12T00:01:00Z',
          },
        ],
        total: 2,
        offset: 0,
      });
      return;
    }
    await fulfillJson(route, {
      sessions: [
        {
          session_id: 'agent-main-claw',
          message_count: 2,
          first_message_at: '2026-06-12T00:00:00Z',
          last_message_at: '2026-06-12T00:01:00Z',
        },
      ],
      total: 1,
      offset: 0,
    });
    return;
  }
  if (action === 'memory') {
    if (url.searchParams.get('stats')) {
      await fulfillJson(route, {
        backend: 'fixture',
        retrieval: 'ready',
        entries: 2,
      });
      return;
    }
    await fulfillJson(route, { entries: [], items: [] });
    return;
  }
  if (action === 'skills') {
    await fulfillJson(route, []);
    return;
  }
  if (action === 'mcp') {
    await fulfillJson(route, []);
    return;
  }
  if (action === 'cron') {
    await fulfillJson(route, []);
    return;
  }
  if (action === 'docs') {
    await fulfillJson(route, { documents: [] });
    return;
  }

  await fulfillJson(route, { error: `Unsupported fixture instance action: ${action}` }, 404);
}

export async function installNullHubFixtureRoutes(page: Page, options: NullHubFixtureOptions = {}) {
  const spaces = fixtureSpaces.map((space) => ({ ...space }));
  const pipelines = (options.nullticketsPipelines || []).map((pipeline) => ({ ...pipeline }));
  const tasks = (options.nullticketsTasks || []).map((task) => ({ ...task }));

  await page.route('**/site.webmanifest', (route) =>
    fulfillJson(route, { name: 'NullHub', short_name: 'NullHub', start_url: '/', display: 'standalone' }),
  );
  await page.route('**/browserconfig.xml', (route) =>
    fulfillText(route, '<?xml version="1.0" encoding="utf-8"?><browserconfig></browserconfig>', 'application/xml'),
  );

  await page.route('**/api/status', (route) => fulfillJson(route, options.status || fixtureStatus));
  await page.route('**/nullhub-api/status', (route) => fulfillJson(route, options.status || fixtureStatus));
  await page.route('**/api/spaces', (route) => spacesRoute(route, options, spaces));
  await page.route('**/nullhub-api/spaces', (route) => spacesRoute(route, options, spaces));
  await page.route('**/api/mission-control/state', (route) => fulfillJson(route, missionControlState));
  await page.route('**/api/mission-control/replays', (route) => fulfillJson(route, missionControlReplays));
  await page.route('**/api/components', (route) => fulfillJson(route, fixtureComponents));
  await page.route('**/nullhub-api/components', (route) => fulfillJson(route, fixtureComponents));
  await page.route('**/api/settings', (route) => fulfillJson(route, fixtureSettings));
  await page.route('**/nullhub-api/settings', (route) => fulfillJson(route, fixtureSettings));
  await page.route('**/api/service/status', (route) => fulfillJson(route, fixtureServiceStatus));
  await page.route('**/nullhub-api/service/status', (route) => fulfillJson(route, fixtureServiceStatus));
  await page.route('**/api/nulltickets/store/loops.templates**', (route) => loopCatalogRoute(route, options));
  await page.route('**/nullhub-api/nulltickets/store/loops.templates**', (route) => loopCatalogRoute(route, options));
  await page.route('**/api/events**', (route) => eventsRoute(route, options));
  await page.route('**/nullhub-api/events**', (route) => eventsRoute(route, options));
  await page.route(/\/api\/instances(?:\?.*)?$/, (route) => instancesRoute(route, options));
  await page.route(/\/nullhub-api\/instances(?:\?.*)?$/, (route) => instancesRoute(route, options));
  await page.route('**/api/instances/*/*/config**', (route) => instanceDetailRoute(route, options));
  await page.route('**/nullhub-api/instances/*/*/config**', (route) => instanceDetailRoute(route, options));
  await page.route('**/api/instances/*/*/provider-health**', (route) => instanceDetailRoute(route, options));
  await page.route('**/nullhub-api/instances/*/*/provider-health**', (route) => instanceDetailRoute(route, options));
  await page.route('**/api/instances/*/*/usage**', (route) => instanceDetailRoute(route, options));
  await page.route('**/nullhub-api/instances/*/*/usage**', (route) => instanceDetailRoute(route, options));
  await page.route('**/api/instances/*/*/integration**', (route) => instanceDetailRoute(route, options));
  await page.route('**/nullhub-api/instances/*/*/integration**', (route) => instanceDetailRoute(route, options));
  await page.route('**/api/instances/*/*/onboarding**', (route) => instanceDetailRoute(route, options));
  await page.route('**/nullhub-api/instances/*/*/onboarding**', (route) => instanceDetailRoute(route, options));
  await page.route('**/api/instances/*/*/history**', (route) => instanceDetailRoute(route, options));
  await page.route('**/nullhub-api/instances/*/*/history**', (route) => instanceDetailRoute(route, options));
  await page.route('**/api/instances/*/*/memory**', (route) => instanceDetailRoute(route, options));
  await page.route('**/nullhub-api/instances/*/*/memory**', (route) => instanceDetailRoute(route, options));
  await page.route('**/api/instances/*/*/skills**', (route) => instanceDetailRoute(route, options));
  await page.route('**/nullhub-api/instances/*/*/skills**', (route) => instanceDetailRoute(route, options));
  await page.route('**/api/instances/*/*/mcp**', (route) => instanceDetailRoute(route, options));
  await page.route('**/nullhub-api/instances/*/*/mcp**', (route) => instanceDetailRoute(route, options));
  await page.route('**/api/instances/*/*/cron**', (route) => instanceDetailRoute(route, options));
  await page.route('**/nullhub-api/instances/*/*/cron**', (route) => instanceDetailRoute(route, options));
  await page.route('**/api/instances/*/*/docs**', (route) => instanceDetailRoute(route, options));
  await page.route('**/nullhub-api/instances/*/*/docs**', (route) => instanceDetailRoute(route, options));
  await page.route('**/api/instances/nulltickets/*/tickets**', (route) => nullTicketsActionRoute(route, options, pipelines, tasks));
  await page.route('**/nullhub-api/instances/nulltickets/*/tickets**', (route) =>
    nullTicketsActionRoute(route, options, pipelines, tasks),
  );
  await page.route('**/api/providers**', (route) =>
    jsonRoute(route, options, fixtureProviders(new URL(route.request().url()).searchParams.get('space'))),
  );
  await page.route('**/nullhub-api/providers**', (route) =>
    jsonRoute(route, options, fixtureProviders(new URL(route.request().url()).searchParams.get('space'))),
  );
  await page.route('**/api/channels**', (route) => jsonRoute(route, options, { channels: [] }));
  await page.route('**/nullhub-api/channels**', (route) => jsonRoute(route, options, { channels: [] }));
  await page.route('**/api/nullboiler/runs**', (route) =>
    jsonRoute(route, options, {
      items: (options.nullboilerRuns || []).filter((run) =>
        matchesFixtureSpace(run, new URL(route.request().url()).searchParams.get('space')),
      ),
      limit: 50,
      offset: 0,
      has_more: false,
    }),
  );
  await page.route('**/nullhub-api/nullboiler/runs**', (route) =>
    jsonRoute(route, options, {
      items: (options.nullboilerRuns || []).filter((run) =>
        matchesFixtureSpace(run, new URL(route.request().url()).searchParams.get('space')),
      ),
      limit: 50,
      offset: 0,
      has_more: false,
    }),
  );
  await page.route('**/api/nullboiler/workflows**', (route) => fulfillJson(route, { items: [] }));
  await page.route('**/nullhub-api/nullboiler/workflows**', (route) => fulfillJson(route, { items: [] }));
  await page.route('**/api/nullwatch/v1/summary**', (route) =>
    fulfillJson(route, { totals: {}, status: 'empty' }),
  );
  await page.route('**/nullhub-api/nullwatch/v1/summary**', (route) =>
    fulfillJson(route, { totals: {}, status: 'empty' }),
  );
  await page.route('**/api/nullwatch/v1/runs**', (route) =>
    jsonRoute(route, options, {
      items: (options.nullwatchRuns || []).filter((run) =>
        matchesFixtureSpace(run, new URL(route.request().url()).searchParams.get('space')),
      ),
    }),
  );
  await page.route('**/nullhub-api/nullwatch/v1/runs**', (route) =>
    jsonRoute(route, options, {
      items: (options.nullwatchRuns || []).filter((run) =>
        matchesFixtureSpace(run, new URL(route.request().url()).searchParams.get('space')),
      ),
    }),
  );
}

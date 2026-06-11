import type { Page, Route } from '@playwright/test';

type JsonBody = Record<string, unknown> | unknown[];
type NullHubFixtureOptions = {
  requests?: string[];
  spacesStatus?: number;
  status?: JsonBody;
  loopCatalog?: JsonBody;
  loopCatalogStatus?: number;
  nullticketsPipelines?: Record<string, unknown>[];
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

async function nullTicketsActionRoute(route: Route, options: NullHubFixtureOptions, pipelines: Record<string, unknown>[]) {
  recordRequest(route, options);
  const url = new URL(route.request().url());
  const payload = route.request().postDataJSON() as { method?: string; path?: string; payload?: any } | null;
  const method = String(payload?.method || 'GET').toUpperCase();
  const path = String(payload?.path || '');
  const parts = url.pathname.split('/').filter(Boolean);
  const instanceName = parts[3] || 'tickets';

  if (method === 'GET' && path === '/pipelines') {
    const instancePipelines = pipelines.filter((pipeline) => {
      const pipelineInstance = String(pipeline.tickets_instance ?? pipeline.ticketsInstance ?? instanceName);
      return pipelineInstance === instanceName;
    });
    await fulfillJson(route, { pipelines: instancePipelines });
    return;
  }

  if (method === 'GET' && (path === '/tasks' || path.startsWith('/tasks?'))) {
    await fulfillJson(route, { items: [] });
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

export async function installNullHubFixtureRoutes(page: Page, options: NullHubFixtureOptions = {}) {
  const spaces = fixtureSpaces.map((space) => ({ ...space }));
  const pipelines = (options.nullticketsPipelines || []).map((pipeline) => ({ ...pipeline }));

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
  await page.route('**/api/instances**', (route) => jsonRoute(route, options, { instances: {} }));
  await page.route('**/nullhub-api/instances**', (route) => jsonRoute(route, options, { instances: {} }));
  await page.route('**/api/instances/nulltickets/*/tickets**', (route) => nullTicketsActionRoute(route, options, pipelines));
  await page.route('**/nullhub-api/instances/nulltickets/*/tickets**', (route) => nullTicketsActionRoute(route, options, pipelines));
  await page.route('**/api/providers**', (route) =>
    jsonRoute(route, options, fixtureProviders(new URL(route.request().url()).searchParams.get('space'))),
  );
  await page.route('**/nullhub-api/providers**', (route) =>
    jsonRoute(route, options, fixtureProviders(new URL(route.request().url()).searchParams.get('space'))),
  );
  await page.route('**/api/channels**', (route) => jsonRoute(route, options, { channels: [] }));
  await page.route('**/nullhub-api/channels**', (route) => jsonRoute(route, options, { channels: [] }));
  await page.route('**/api/nullboiler/runs**', (route) =>
    fulfillJson(route, { items: [], limit: 50, offset: 0, has_more: false }),
  );
  await page.route('**/nullhub-api/nullboiler/runs**', (route) =>
    fulfillJson(route, { items: [], limit: 50, offset: 0, has_more: false }),
  );
  await page.route('**/api/nullboiler/workflows**', (route) => fulfillJson(route, { items: [] }));
  await page.route('**/nullhub-api/nullboiler/workflows**', (route) => fulfillJson(route, { items: [] }));
  await page.route('**/api/nullwatch/v1/summary**', (route) =>
    fulfillJson(route, { totals: {}, status: 'empty' }),
  );
  await page.route('**/nullhub-api/nullwatch/v1/summary**', (route) =>
    fulfillJson(route, { totals: {}, status: 'empty' }),
  );
  await page.route('**/api/nullwatch/v1/runs**', (route) => fulfillJson(route, { items: [] }));
  await page.route('**/nullhub-api/nullwatch/v1/runs**', (route) => fulfillJson(route, { items: [] }));
}

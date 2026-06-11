import { expect, test, type Page } from '@playwright/test';
import { installNullHubFixtureRoutes } from './fixtures/nullhub';

function collectRuntimeFailures(page: Page) {
  const runtimeErrors: string[] = [];
  const failedResponses: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  page.on('pageerror', (error) => {
    runtimeErrors.push(error.message);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });

  return { runtimeErrors, failedResponses };
}

test('renders /work/runs/[id] from task, event, and artifact fixtures', async ({ page }, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];
  const nullticketsActions: string[] = [];
  const nowMs = 1_780_000_000_000;

  await installNullHubFixtureRoutes(page, {
    requests,
    nullticketsActions,
    instances: {
      nulltickets: {
        tickets: { status: 'running', port: 19001, space_id: 'ops' },
      },
      nullclaw: {
        Athena: { status: 'running', port: 19002, space_id: 'ops' },
      },
    },
    nullticketsPipelines: [
      {
        id: 'support-triage',
        name: 'Support Triage',
        definition: {},
        space_id: 'ops',
      },
    ],
    nullticketsTasks: [
      {
        id: 'task-loop-1',
        pipeline_id: 'support-triage',
        stage: 'done',
        title: 'Triage support inbox',
        description: 'Review incoming support requests.',
        priority: 60,
        created_at_ms: nowMs - 20 * 60_000,
        updated_at_ms: nowMs - 2 * 60_000,
        space_id: 'ops',
        latest_run: {
          id: 'loop-run-1',
          task_id: 'task-loop-1',
          status: 'completed',
          agent_id: 'Athena',
          attempt: 2,
          started_at_ms: nowMs - 20 * 60_000,
          ended_at_ms: nowMs - 2 * 60_000,
        },
      },
    ],
    nullticketsRunEvents: [
      {
        id: 1,
        run_id: 'loop-run-1',
        ts_ms: nowMs - 18 * 60_000,
        kind: 'claimed',
        data: { worker_id: 'nullclaw-Athena' },
        space_id: 'ops',
      },
      {
        id: 2,
        run_id: 'loop-run-1',
        ts_ms: nowMs - 3 * 60_000,
        kind: 'check_completed',
        data: {
          usage: { prompt_tokens: 900, completion_tokens: 310, total_tokens: 1210, cost_usd: 0.0042, requests: 1 },
        },
        space_id: 'ops',
      },
      {
        id: 3,
        run_id: 'loop-run-1',
        ts_ms: nowMs - 2 * 60_000,
        kind: 'judge_decision',
        data: { decision: 'approved', reason: 'The exit condition is satisfied.', judge: 'Iris' },
        space_id: 'ops',
      },
    ],
    nullticketsArtifacts: [
      {
        id: 'artifact-1',
        task_id: 'task-loop-1',
        run_id: 'loop-run-1',
        created_at_ms: nowMs - 60_000,
        kind: 'report',
        uri: 'artifact://loop-run-1/report.md',
        size_bytes: 2048,
        meta: {},
        space_id: 'ops',
      },
    ],
    nullclawHistorySessions: [{ session_id: 'webhook:local-nullboiler-worker' }],
    nullclawHistoryMessages: {
      'webhook:local-nullboiler-worker': [
        {
          role: 'user',
          content: 'Run loop-run-1 for task task-loop-1 until the support inbox has owners.',
          created_at: '2026-06-11T22:00:00Z',
        },
        {
          role: 'assistant',
          content: 'History confirms every support request has an owner and next action.',
          created_at: '2026-06-11T22:02:00Z',
        },
      ],
    },
  });

  await page.goto('/work/runs/loop-run-1?space=ops&task_id=task-loop-1&tickets_instance=tickets');

  await expect(page.getByRole('heading', { name: 'Run Detail' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Work tabs' }).getByRole('link', { name: 'Loop Runs' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const checkOutput = page.getByRole('region', { name: 'Check output' });
  const judgeDecisions = page.getByRole('region', { name: 'Judge decisions' });
  const costSummary = page.getByRole('region', { name: 'Cost summary' });
  await expect(page.getByRole('heading', { name: 'Triage support inbox' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'All loop runs' })).toHaveAttribute(
    'href',
    '/work/loops/runs?tickets_instance=tickets&space=ops',
  );
  await expect(checkOutput.getByText('History confirms every support request has an owner and next action.', { exact: true })).toBeVisible();
  await expect(page.getByText('Judge decisions')).toBeVisible();
  await expect(judgeDecisions.getByText('The exit condition is satisfied.')).toBeVisible();
  await expect(costSummary.getByText('1,210')).toBeVisible();
  await expect(costSummary.getByText('$0.0042')).toBeVisible();
  await expect(page.getByText('artifact://loop-run-1/report.md · 2 KB')).toBeVisible();

  const screenshotPath = testInfo.outputPath('work-run-detail.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(nullticketsActions).toContain('GET /tasks/task-loop-1');
  expect(nullticketsActions).toContain('GET /runs/loop-run-1/events?limit=100');
  expect(nullticketsActions).toContain('GET /artifacts?task_id=task-loop-1&run_id=loop-run-1&limit=50');
  expect(requests.some((request) => request.startsWith('/api/instances/nullclaw/Athena/history?limit=12'))).toBe(true);
  expect(
    requests.some((request) =>
      request.startsWith('/api/instances/nullclaw/Athena/history?session_id=webhook%3Alocal-nullboiler-worker&limit=100'),
    ),
  ).toBe(true);
  expect(requests.some((request) => request.startsWith('/api/instances/nulltickets/tickets/tickets') && request.includes('space=ops'))).toBe(
    true,
  );
  expect(failedResponses).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

test('reloads /work/runs/[id] when NullTickets instance or Space changes', async ({ page }) => {
  const requests: string[] = [];
  const nullticketsActions: string[] = [];
  const nowMs = 1_780_000_000_000;
  const instances = {
    nulltickets: {
      tickets: { status: 'running', port: 19001 },
      altickets: { status: 'running', port: 19002 },
    },
    nullclaw: {
      Athena: { status: 'running', port: 19003 },
    },
  };

  await installNullHubFixtureRoutes(page, {
    requests,
    nullticketsActions,
    status: {
      ok: true,
      version: 'playwright-fixture',
      components: {},
      instances,
    },
    instances,
    nullticketsPipelines: [
      {
        id: 'support-triage',
        name: 'Support Triage',
        definition: {},
        tickets_instance: 'tickets',
        space_id: 'ops',
      },
      {
        id: 'support-triage',
        name: 'Alt Support Triage',
        definition: {},
        tickets_instance: 'altickets',
        space_id: 'ops',
      },
      {
        id: 'support-triage',
        name: 'Lab Support Triage',
        definition: {},
        tickets_instance: 'altickets',
        space_id: 'lab',
      },
    ],
    nullticketsTasks: [
      {
        id: 'task-loop-1',
        pipeline_id: 'support-triage',
        stage: 'done',
        title: 'Ops scoped inbox',
        description: 'Ops run detail.',
        priority: 60,
        created_at_ms: nowMs - 20 * 60_000,
        updated_at_ms: nowMs - 2 * 60_000,
        tickets_instance: 'tickets',
        space_id: 'ops',
        latest_run: {
          id: 'loop-run-2',
          task_id: 'task-loop-1',
          status: 'completed',
          agent_id: 'Athena',
          attempt: 1,
          started_at_ms: nowMs - 20 * 60_000,
          ended_at_ms: nowMs - 2 * 60_000,
        },
      },
      {
        id: 'task-loop-1',
        pipeline_id: 'support-triage',
        stage: 'done',
        title: 'Alt instance inbox',
        description: 'Alternative NullTickets run detail.',
        priority: 60,
        created_at_ms: nowMs - 20 * 60_000,
        updated_at_ms: nowMs - 2 * 60_000,
        tickets_instance: 'altickets',
        space_id: 'ops',
        latest_run: {
          id: 'loop-run-1',
          task_id: 'task-loop-1',
          status: 'completed',
          agent_id: 'Athena',
          attempt: 1,
          started_at_ms: nowMs - 20 * 60_000,
          ended_at_ms: nowMs - 2 * 60_000,
        },
      },
      {
        id: 'task-loop-1',
        pipeline_id: 'support-triage',
        stage: 'done',
        title: 'Lab scoped inbox',
        description: 'Lab run detail.',
        priority: 60,
        created_at_ms: nowMs - 20 * 60_000,
        updated_at_ms: nowMs - 2 * 60_000,
        tickets_instance: 'altickets',
        space_id: 'lab',
        latest_run: {
          id: 'loop-run-1',
          task_id: 'task-loop-1',
          status: 'completed',
          agent_id: 'Athena',
          attempt: 1,
          started_at_ms: nowMs - 20 * 60_000,
          ended_at_ms: nowMs - 2 * 60_000,
        },
      },
    ],
    nullclawHistorySessions: [{ session_id: 'webhook:local-nullboiler-worker' }],
    nullclawHistoryMessages: {
      'webhook:local-nullboiler-worker': [
        {
          role: 'user',
          content: 'Run loop-run-1 for task task-loop-1 until scoped work is complete.',
          created_at: '2026-06-11T22:00:00Z',
        },
        {
          role: 'assistant',
          content: 'Bare Athena history confirms the scoped run detail.',
          created_at: '2026-06-11T22:02:00Z',
        },
      ],
    },
  });

  await page.goto('/work/runs/loop-run-1?space=ops&task_id=task-loop-1&tickets_instance=tickets');

  await expect(page.getByRole('heading', { name: 'Ops scoped inbox' })).toBeVisible();
  await expect(page.getByText('Bare Athena history confirms the scoped run detail.', { exact: true })).toHaveCount(0);
  await page.getByLabel('NullTickets').selectOption('altickets');
  await expect(page).toHaveURL(/tickets_instance=altickets/);
  await expect(page.getByRole('heading', { name: 'Alt instance inbox' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ops scoped inbox' })).toHaveCount(0);
  await expect(page.getByText('Bare Athena history confirms the scoped run detail.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'All loop runs' })).toHaveAttribute(
    'href',
    '/work/loops/runs?tickets_instance=altickets&space=ops',
  );

  await page.getByRole('button', { name: /Operations Workspace - Active/ }).click();
  await page.getByRole('menuitem', { name: /Lab Workspace - Paused/ }).click();
  await expect(page).toHaveURL(/(?:\?|&)space=lab(?:&|$)/);
  await expect(page.getByRole('heading', { name: 'Lab scoped inbox' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Alt instance inbox' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'All loop runs' })).toHaveAttribute(
    'href',
    '/work/loops/runs?tickets_instance=altickets&space=lab',
  );
  await page.getByRole('link', { name: 'All loop runs' }).click();
  await expect(page).toHaveURL(/\/work\/loops\/runs\?tickets_instance=altickets&space=lab$/);
  await expect(page.getByRole('heading', { name: 'Loop Runs' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lab scoped inbox' })).toBeVisible();
  await expect(page.getByText('Ops scoped inbox')).toHaveCount(0);

  expect(
    requests.some((request) => request.startsWith('/api/instances/nulltickets/altickets/tickets') && request.includes('space=ops')),
  ).toBe(true);
  expect(
    requests.some((request) => request.startsWith('/api/instances/nulltickets/altickets/tickets') && request.includes('space=lab')),
  ).toBe(true);
  expect(requests.some((request) => request.startsWith('/api/instances/nullclaw/Athena/history'))).toBe(true);
  expect(requests.some((request) => request.startsWith('/api/instances/nullclaw/claw/history'))).toBe(false);
  expect(nullticketsActions.filter((action) => action === 'GET /tasks/task-loop-1').length).toBeGreaterThanOrEqual(3);
});

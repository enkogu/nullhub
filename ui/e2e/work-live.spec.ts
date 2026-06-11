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

test('renders /work/live from loop, workflow, and agent sources', async ({ page }, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];
  const nowMs = 1_780_000_000_000;

  await installNullHubFixtureRoutes(page, {
    requests,
    status: {
      ok: true,
      version: 'playwright-fixture',
      components: {
        nulltickets: { status: 'running', running: 1, total: 1 },
        nullboiler: { status: 'running', running: 1, total: 1 },
        nullwatch: { status: 'running', running: 1, total: 1 },
        nullclaw: { status: 'running', running: 1, total: 1 },
      },
      instances: {
        nulltickets: {
          tickets: { status: 'running', port: 19001, space_id: 'ops' },
        },
        nullboiler: {
          boiler: { status: 'running', port: 19002, space_id: 'ops' },
        },
        nullwatch: {
          watch: { status: 'running', port: 19003, space_id: 'ops' },
        },
        nullclaw: {
          Athena: {
            status: 'running',
            space_id: 'ops',
          },
        },
      },
    },
    instances: {
      nulltickets: {
        tickets: { status: 'running', port: 19001, space_id: 'ops' },
          labtickets: { status: 'running', port: 19101, space_id: 'lab' },
      },
      nullboiler: {
        boiler: { status: 'running', port: 19002, space_id: 'ops' },
        labboiler: { status: 'running', port: 19102, space_id: 'lab' },
      },
      nullwatch: {
        watch: { status: 'running', port: 19003, space_id: 'ops' },
        labwatch: { status: 'running', port: 19103, space_id: 'lab' },
      },
      nullclaw: {
        Athena: {
          status: 'running',
          space_id: 'ops',
        },
        LabAgent: {
          status: 'running',
          space_id: 'lab',
        },
      },
    },
    nullticketsPipelines: [
      {
        id: 'support-triage',
        name: 'Support Triage',
        definition: {},
        space_id: 'ops',
      },
      {
        id: 'lab-process',
        name: 'Lab Process',
        definition: {},
        space_id: 'lab',
      },
    ],
    nullticketsTasks: [
      {
        id: 'task-loop-1',
        pipeline_id: 'support-triage',
        stage: 'done',
        title: 'Triage support inbox',
        description: 'Review incoming support requests.',
        created_at_ms: nowMs - 20 * 60_000,
        updated_at_ms: nowMs - 8 * 60_000,
        space_id: 'ops',
        latest_run: {
          id: 'loop-run-1',
          task_id: 'task-loop-1',
          status: 'running',
          agent_id: 'Athena',
          attempt: 1,
          started_at_ms: nowMs - 20 * 60_000,
        },
      },
      {
        id: 'task-agent-1',
        pipeline_id: 'support-triage',
        stage: 'queued',
        title: 'Draft response',
        description: 'Waiting for an agent.',
        created_at_ms: nowMs - 3 * 60_000,
        updated_at_ms: nowMs - 2 * 60_000,
        metadata: { owner: 'Athena' },
        space_id: 'ops',
      },
      {
        id: 'task-loop-1',
        pipeline_id: 'lab-process',
        stage: 'done',
        title: 'Lab-only task',
        description: 'This belongs to the Lab space.',
        created_at_ms: nowMs - 20 * 60_000,
        updated_at_ms: nowMs - 8 * 60_000,
        space_id: 'lab',
        latest_run: {
          id: 'lab-loop-run-1',
          task_id: 'task-loop-1',
          status: 'running',
          agent_id: 'LabAgent',
          started_at_ms: nowMs - 3 * 60_000,
        },
      },
    ],
    nullboilerRuns: [
      {
        id: 'workflow-run-1',
        workflow_id: 'onboarding',
        workflow_name: 'Onboarding Graph',
        status: 'running',
        started_at_ms: nowMs - 12 * 60_000,
        updated_at_ms: nowMs - 11 * 60_000,
        worker_id: 'boiler',
        space_id: 'ops',
      },
      {
        id: 'workflow-run-lab',
        workflow_id: 'lab',
        workflow_name: 'Lab Graph',
        status: 'running',
        started_at_ms: nowMs - 12 * 60_000,
        updated_at_ms: nowMs - 11 * 60_000,
        worker_id: 'labboiler',
        space_id: 'lab',
      },
    ],
    nullwatchRuns: [{ run_id: 'loop-run-1', space_id: 'ops' }],
  });

  await page.goto('/work');
  await expect(page.getByRole('navigation', { name: 'Work tabs' }).getByRole('link', { name: 'Live' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Work tabs' }).getByRole('link', { name: 'Live' }).click();
  requests.length = 0;
  failedResponses.length = 0;
  runtimeErrors.length = 0;

  await expect(page).toHaveURL(/\/work\/live(?:\?space=ops)?$/);
  await expect(page.getByRole('heading', { name: 'Live', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Live Runs' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Triage support inbox Loop run' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Onboarding Graph Workflow run' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Draft response Agent task' })).toBeVisible();
  await expect(page.getByText('Lab-only task')).toHaveCount(0);
  await expect(page.getByText('Lab Graph')).toHaveCount(0);
  await expect(page.getByText('Lab-only work')).toHaveCount(0);
  await expect(
    page.getByRole('article', { name: 'Onboarding Graph Workflow run' }).getByText('Graph execution', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('article', { name: 'Triage support inbox Loop run' }).getByText('Work evidence', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('article', { name: 'Draft response Agent task' }).getByText('Agent work', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('article', { name: 'Triage support inbox Loop run' }).getByText('Watch observed', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('article', { name: 'Onboarding Graph Workflow run' }).getByText('Watch not seen', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Triage support inbox' })).toHaveAttribute(
    'href',
    '/work/runs/loop-run-1?task_id=task-loop-1&tickets_instance=tickets&space=ops',
  );

  await page.getByRole('button', { name: /Operations Workspace - Active/ }).click();
  await page.getByRole('menuitem', { name: /Lab Workspace - Paused/ }).click();
  await expect(page).toHaveURL(/(?:\?|&)space=lab(?:&|$)/);
  await expect(page.getByRole('article', { name: 'Lab-only task Loop run' })).toBeVisible();
  await expect(page.getByText('Triage support inbox')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open Lab-only task' })).toHaveAttribute(
    'href',
    '/work/runs/lab-loop-run-1?task_id=task-loop-1&tickets_instance=labtickets&space=lab',
  );

  await page.getByRole('button', { name: /Lab Workspace - Paused/ }).click();
  await page.getByRole('menuitem', { name: /Operations Workspace - Active/ }).click();
  await expect(page).toHaveURL(/(?:\?|&)space=ops(?:&|$)/);
  await expect(page.getByRole('article', { name: 'Triage support inbox Loop run' })).toBeVisible();

  await page.getByRole('combobox', { name: 'source' }).selectOption('workflow');
  await expect(page.getByText('Onboarding Graph')).toBeVisible();
  await expect(page.getByText('Triage support inbox')).toHaveCount(0);

  const screenshotPath = testInfo.outputPath('work-live.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(requests.some((request) => request === '/api/events?space=ops&limit=50')).toBe(true);
  expect(requests.some((request) => request === '/api/instances?space=ops')).toBe(true);
  expect(requests.some((request) => request.startsWith('/api/nullwatch/v1/runs') && request.includes('space=ops'))).toBe(true);
  expect(requests.some((request) => request.startsWith('/api/nullboiler/runs') && request.includes('space=ops'))).toBe(true);
  expect(
    requests.some((request) => request.startsWith('/api/instances/nulltickets/tickets/tickets') && request.includes('space=ops')),
  ).toBe(true);
  expect(failedResponses).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

test('does not invent a NullBoiler selector when the selected Space has no scoped boiler', async ({ page }) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];
  const nowMs = 1_780_000_000_000;

  await installNullHubFixtureRoutes(page, {
    requests,
    instances: {
      nulltickets: {
        tickets: { status: 'running', port: 19001, space_id: 'ops' },
      },
      nullclaw: {
        Athena: { status: 'running', space_id: 'ops' },
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
        stage: 'in_progress',
        title: 'Triage support inbox',
        description: 'Review incoming support requests.',
        created_at_ms: nowMs - 20 * 60_000,
        updated_at_ms: nowMs - 8 * 60_000,
        space_id: 'ops',
        latest_run: {
          id: 'loop-run-1',
          task_id: 'task-loop-1',
          status: 'running',
          agent_id: 'Athena',
          attempt: 1,
          started_at_ms: nowMs - 20 * 60_000,
        },
      },
    ],
    nullboilerRuns: [],
  });

  await page.goto('/work/live?space=ops');

  await expect(page.getByRole('heading', { name: 'Live', exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Triage support inbox Loop run' })).toBeVisible();
  expect(requests.some((request) => request.startsWith('/api/nullboiler/runs'))).toBe(true);
  expect(requests.some((request) => request.includes('boiler_instance=boiler'))).toBe(false);
  expect(failedResponses).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

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

async function expectNonBlankShell(page: Page, label: string) {
  await expect(page.locator('.shadcn-app')).toBeVisible();
  await expect(page.locator('main.real-content')).toBeVisible();
  const text = (await page.locator('main.real-content').innerText()).trim();
  expect(text.length, `${label} should render nonblank content`).toBeGreaterThan(24);
}

function requestsSince(requests: string[], start: number): string[] {
  return requests.slice(start);
}

function requestUrl(path: string): URL {
  return new URL(path, 'http://nullhub.local');
}

function expectRequestWithSpace(requests: string[], start: number, pathname: string, space: string) {
  const matching = requestsSince(requests, start).filter((request) => {
    const url = requestUrl(request);
    return url.pathname === pathname && url.searchParams.get('space') === space;
  });
  expect(matching, `${pathname} should be requested with space=${space}`).not.toHaveLength(0);
}

async function expectAbsentText(page: Page, texts: string[]) {
  for (const text of texts) {
    await expect(page.getByText(text)).toHaveCount(0);
  }
}

const seededIsolationFixture = {
  status: {
    ok: true,
    version: 'playwright-fixture',
    components: {
      nulltickets: { status: 'running', running: 2, total: 2 },
      nullboiler: { status: 'running', running: 2, total: 2 },
      nullwatch: { status: 'running', running: 2, total: 2 },
      nullclaw: { status: 'running', running: 2, total: 2 },
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
        Athena: { status: 'running', space_id: 'ops' },
        LabAgent: { status: 'running', space_id: 'lab' },
      },
    },
  },
  nullticketsPipelines: [
    { id: 'ops-loop', name: 'Ops-only Loop', definition: {}, tickets_instance: 'tickets', space_id: 'ops' },
    { id: 'lab-loop', name: 'Lab-only Loop', definition: {}, tickets_instance: 'labtickets', space_id: 'lab' },
  ],
  nullticketsTasks: [
    {
      id: 'ops-task',
      pipeline_id: 'ops-loop',
      stage: 'done',
      title: 'Ops-only work item',
      description: 'This fixture row must stay in Operations.',
      tickets_instance: 'tickets',
      space_id: 'ops',
      latest_run: {
        id: 'ops-loop-run',
        task_id: 'ops-task',
        status: 'running',
        agent_id: 'Athena',
        started_at_ms: 1_780_000_000_000,
      },
    },
    {
      id: 'lab-task',
      pipeline_id: 'lab-loop',
      stage: 'done',
      title: 'Lab-only work item',
      description: 'This fixture row must stay in Lab.',
      tickets_instance: 'labtickets',
      space_id: 'lab',
      latest_run: {
        id: 'lab-loop-run',
        task_id: 'lab-task',
        status: 'running',
        agent_id: 'LabAgent',
        started_at_ms: 1_780_000_000_000,
      },
    },
  ],
  nullboilerRuns: [
    {
      id: 'ops-workflow-run',
      workflow_id: 'ops-workflow',
      workflow_name: 'Ops-only workflow run',
      status: 'running',
      worker_id: 'boiler',
      space_id: 'ops',
      started_at_ms: 1_780_000_000_000,
      updated_at_ms: 1_780_000_000_000,
    },
    {
      id: 'lab-workflow-run',
      workflow_id: 'lab-workflow',
      workflow_name: 'Lab-only workflow run',
      status: 'running',
      worker_id: 'labboiler',
      space_id: 'lab',
      started_at_ms: 1_780_000_000_000,
      updated_at_ms: 1_780_000_000_000,
    },
  ],
  nullwatchRuns: [
    { run_id: 'ops-loop-run', space_id: 'ops' },
    { run_id: 'lab-loop-run', space_id: 'lab' },
  ],
};

async function expectIsolatedSurfaces(
  page: Page,
  requests: string[],
  space: string,
  options: {
    absent: string[];
    expectedLiveText?: string;
    expectedActivityText?: string;
  },
) {
  let start = requests.length;
  await page.goto(`/orders?space=${space}`);
  await expect(page).toHaveURL(new RegExp(`/orders\\?space=${space}$`));
  await expect(page.getByRole('heading', { name: 'Orders', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Charter', exact: true })).toBeVisible();
  await expect(page.getByText('No orders')).toBeVisible();
  await expectAbsentText(page, options.absent);
  expectRequestWithSpace(requests, start, '/api/orders', space);

  start = requests.length;
  await page.goto(`/work/activity?space=${space}`);
  await expect(page).toHaveURL(new RegExp(`/work/activity\\?space=${space}$`));
  await expect(page.getByRole('heading', { name: 'Activity', exact: true, level: 1 })).toBeVisible();
  if (options.expectedActivityText) await expect(page.getByText(options.expectedActivityText)).toBeVisible();
  else await expect(page.getByText('No activity events')).toBeVisible();
  await expectAbsentText(page, options.absent);
  expectRequestWithSpace(requests, start, '/api/events', space);

  start = requests.length;
  await page.goto(`/work/live?space=${space}`);
  await expect(page).toHaveURL(new RegExp(`/work/live\\?space=${space}$`));
  await expect(page.getByRole('heading', { name: 'Live', exact: true })).toBeVisible();
  if (options.expectedLiveText) await expect(page.getByText(options.expectedLiveText)).toBeVisible();
  else await expect(page.getByText('No live runs')).toBeVisible();
  await expectAbsentText(page, options.absent);
  expectRequestWithSpace(requests, start, '/api/instances', space);
  expectRequestWithSpace(requests, start, '/api/events', space);
}

test('creates an empty Space and keeps the scoped shell visible @smoke', async ({ page }, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];
  await installNullHubFixtureRoutes(page, { requests, ...seededIsolationFixture });

  await page.goto('/spaces/new');
  await expect(page.getByRole('heading', { name: 'New Space' })).toBeVisible();
  await expectNonBlankShell(page, 'new-space route');

  await page.getByLabel('Space name').fill('Launch Room');
  await page.getByRole('radio', { name: /Empty Space/ }).click();
  await page.getByRole('button', { name: 'Create empty Space' }).click();

  await expect(page).toHaveURL(/\/\?space=launch-room$/);
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Launch Room 0 pending/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Charter', exact: true })).toBeVisible();
  await expect(page.getByText('Charter fields are empty')).toBeVisible();
  await expect(page.getByText('Mission, bounds, and metrics are not set for this Space.')).toBeVisible();
  await expectAbsentText(page, [
    'Nightly digest run failed',
    'Weekly pipeline review',
    'Ops-only work item',
    'Lab-only work item',
    'Lab note captured',
  ]);
  await expectNonBlankShell(page, 'empty-space home');

  const screenshotPath = testInfo.outputPath('new-space-empty.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(requests).toContain('/api/spaces');
  expect(requests).toContain('/api/market/catalog');
  expect(requests).toContain('/api/charter?space=launch-room');
  expect(requests).toContain('/api/approvals?space=launch-room&status=pending&limit=100');
  await expectIsolatedSurfaces(page, requests, 'launch-room', {
    absent: [
      'Nightly digest run failed',
      'Which tone should the newsletter use?',
      'Weekly pipeline review',
      'Morning report',
      'Review requested',
      'Workflow completed',
      'Lab note captured',
      'Ops-only work item',
      'Lab-only work item',
      'Ops-only workflow run',
      'Lab-only workflow run',
    ],
  });

  await page.getByRole('button', { name: /Launch Room 0 pending/ }).click();
  await page.getByRole('menuitem', { name: /Lab paused/ }).click();
  await expect(page).toHaveURL(/(?:\?|&)space=lab(?:&|$)/);
  await expect(page.getByRole('button', { name: /Lab 0 pending/ })).toBeVisible();
  await page.goto('/?space=lab');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Charter', exact: true })).toBeVisible();
  await expect(page.getByText('Charter fields are empty')).toBeVisible();
  expect(requests).toContain('/api/charter?space=lab');
  await expectIsolatedSurfaces(page, requests, 'lab', {
    expectedActivityText: 'Lab note captured',
    expectedLiveText: 'Lab-only work item',
    absent: [
      'Nightly digest run failed',
      'Which tone should the newsletter use?',
      'Weekly pipeline review',
      'Morning report',
      'Review requested',
      'Workflow completed',
      'Ops-only work item',
      'Ops-only workflow run',
    ],
  });

  expect(failedResponses).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

test('creates a Space from a Blueprint and hands off to the install wizard', async ({ page }, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];
  await installNullHubFixtureRoutes(page, { requests });

  await page.goto('/spaces/new');
  await page.getByLabel('Space name').fill('Support Desk');
  await page.getByRole('radio', { name: /From Blueprint/ }).click();
  await page.getByRole('button', { name: /Space Operations Blueprint/ }).click();
  await page.getByRole('button', { name: 'Create and open installer' }).click();

  await expect(page).toHaveURL(/\/market\/install\/builtin\.space-operations\?space=support-desk$/);
  await expect(page.getByRole('heading', { name: 'Space Operations Blueprint' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Blueprint install' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Support Desk 0 pending/ })).toBeVisible();
  await expect(page.getByLabel('Space')).toHaveValue('support-desk');
  await expectNonBlankShell(page, 'blueprint install handoff');

  const screenshotPath = testInfo.outputPath('new-space-blueprint.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(requests).toContain('/api/spaces');
  expect(requests).toContain('/api/market/catalog');
  expect(requests).toContain('/api/market/installed?space=support-desk');
  expect(failedResponses).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

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

async function expectNonBlankMain(page: Page, label: string) {
  await expect(page.locator('main.real-content')).toBeVisible();
  await expect(page.locator('main.real-content')).not.toContainText('Loading workspace...');
  const text = (await page.locator('main.real-content').innerText()).trim();
  expect(text.length, `${label} should render nonblank content`).toBeGreaterThan(40);
}

const teamStatus = {
  ok: true,
  version: 'playwright-fixture',
  components: {
    nullclaw: { status: 'running', running: 1, total: 1 },
  },
  instances: {
    nullclaw: {
      Athena: {
        status: 'running',
        version: 'playwright-fixture',
        port: 19801,
        role: 'ops lead',
        profile: 'ops lead',
        launch_mode: 'gateway',
        model: 'openai-codex/gpt-5.5',
        current_work: 'Triaging support loops',
        current_runs: 1,
        orders_as_executor: 2,
        uptime_seconds: 900,
        auto_start: true,
        space_id: 'ops',
      },
    },
  },
};

const runningLoopStatus = {
  ok: true,
  version: 'playwright-fixture',
  components: {
    nulltickets: { status: 'running', running: 1, total: 1 },
    nullboiler: { status: 'running', running: 1, total: 1 },
    nullclaw: { status: 'running', running: 1, total: 1 },
  },
  instances: {
    nulltickets: {
      tickets: { status: 'running', running: true, port: 19001, space_id: 'ops' },
    },
    nullboiler: {
      boiler: { status: 'running', running: true, port: 19002, space_id: 'ops' },
    },
    nullclaw: {
      Athena: {
        status: 'running',
        version: 'playwright-fixture',
        port: 19801,
        role: 'ops lead',
        profile: 'ops lead',
        current_work: 'Support escalation sweep',
        current_runs: 1,
        orders_as_executor: 0,
        uptime_seconds: 1800,
        auto_start: true,
        space_id: 'ops',
      },
    },
  },
};

const supportLoop = {
  id: 'pipeline-support',
  name: 'Support Triage',
  tickets_instance: 'tickets',
  space_id: 'ops',
  created_at_ms: 1_780_000_000_000,
  definition: {
    initial: 'todo',
    states: {
      todo: { description: 'Classify inbound support requests and assign an owner.' },
      done: { terminal: true, description: 'All support requests have an owner and next action.' },
    },
    loop: {
      slug: 'support-triage',
      source: 'builtin',
      category: 'Support',
      machine: 'Support Machine',
      goal: 'Every request has an owner and next action.',
      exit_condition: 'All inbound requests are assigned.',
    },
  },
};

const supportTask = {
  id: 'task-support-repeat-1',
  pipeline_id: 'pipeline-support',
  stage: 'in_progress',
  title: 'Support escalation sweep',
  description: 'Repeated support triage task promoted into a durable order.',
  priority: 80,
  tickets_instance: 'tickets',
  space_id: 'ops',
  created_at_ms: 1_780_000_030_000,
  updated_at_ms: 1_780_000_040_000,
  latest_run: {
    id: 'run-support-repeat-1',
    task_id: 'task-support-repeat-1',
    status: 'running',
    agent_id: 'Athena',
    attempt: 2,
    started_at_ms: 1_780_000_035_000,
  },
};

test('UJ-10 hires a Team agent and opens the new agent detail route', async ({ page }, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];

  await installNullHubFixtureRoutes(page, {
    requests,
    status: teamStatus,
  });

  await page.goto('/team/agents?space=ops');
  await expect(page.getByRole('heading', { name: 'Agents', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hire agent' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Athena' })).toBeVisible();
  await expectNonBlankMain(page, 'Team agents');

  const wizard = page.locator('[data-slot="wizard-shell"]').filter({ hasText: 'Hire agent' });
  await wizard.getByLabel('Agent name').fill('support-analyst');
  await wizard.getByRole('button', { name: 'Continue' }).click();
  await wizard.getByLabel('Role').fill('support analyst');
  await wizard.getByRole('button', { name: 'Continue' }).click();
  await expect(wizard.getByLabel('Model')).toHaveValue('google/gemma-4-31b-it:free');
  await wizard.getByRole('button', { name: 'Continue' }).click();
  await wizard.getByLabel('Skills').fill('support, triage, escalation');
  await wizard.getByRole('button', { name: 'Continue' }).click();
  await expect(wizard.getByText('support-analyst')).toBeVisible();
  await expect(wizard.getByText('support analyst')).toBeVisible();
  await wizard.getByRole('button', { name: 'Hire', exact: true }).click();
  await expect(wizard.getByText('Created support-analyst.')).toBeVisible();

  const hiredCard = page.locator('.agent-card').filter({ hasText: 'support-analyst' });
  await expect(hiredCard).toBeVisible();
  await expect(hiredCard).toContainText('Role: support analyst');
  await expect(hiredCard).toContainText('Ready for first assignment');
  await expect(hiredCard).toContainText('Running');

  await hiredCard.getByRole('link', { name: 'Open' }).click();
  await expect(page).toHaveURL(/\/team\/instances\/nullclaw\/support-analyst(?:[?#]|$)/);
  await expect(page.getByRole('heading', { name: 'support-analyst', level: 1 })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Current runs', exact: true })).toBeVisible();
  await expect(page.getByText('Gateway port')).toBeVisible();
  await expect(page.getByText('19802', { exact: true })).toBeVisible();
  await expectNonBlankMain(page, 'Hired agent detail');

  const screenshotPath = testInfo.outputPath('team-hire-journey.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(requests).toContain('/api/wizard/nullclaw');
  expect(failedResponses).toEqual([]);
  expect(runtimeErrors.filter((entry) => !entry.includes('Failed to load resource'))).toEqual([]);
});

test('UJ-8 promotes repeated Work into a draft Order and verifies the Orders registry', async ({ page }, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];
  const orders: Record<string, unknown>[] = [];
  const nullticketsActions: string[] = [];

  await installNullHubFixtureRoutes(page, {
    requests,
    orders,
    nullticketsActions,
    status: runningLoopStatus,
    nullticketsPipelines: [supportLoop],
    nullticketsTasks: [supportTask],
  });

  await page.goto('/work/live?space=ops');
  await expect(page.getByRole('heading', { name: 'Live', exact: true })).toBeVisible();
  const liveRun = page.getByRole('article', { name: 'Support escalation sweep Loop run' });
  await expect(liveRun).toBeVisible();
  await expect(liveRun).toContainText('Work evidence');
  await expect(liveRun).toContainText('Athena');
  await expectNonBlankMain(page, 'Work live');

  await page.getByLabel('Primary navigation').getByRole('link', { name: 'Orders' }).click();
  await expect(page).toHaveURL(/\/orders(?:\?space=ops)?$/);
  await expect(page.getByRole('heading', { name: 'Orders', exact: true, level: 1 })).toBeVisible();
  await expect(page.getByText('No orders')).toBeVisible();

  await page.goto('/orders/loops?space=ops');
  await expect(page.getByRole('heading', { name: 'Loops', exact: true })).toBeVisible();
  const loopCard = page.locator('.loop-card').filter({ hasText: 'Support Triage' });
  await expect(loopCard).toBeVisible();
  await expect(loopCard).toContainText('1 active');
  await loopCard.getByRole('button', { name: 'Promote to Order' }).click();

  await expect(page.getByText('Order draft created for Support Triage.')).toBeVisible();
  const draftLink = page.getByRole('link', { name: 'Open Support Triage' });
  await expect(draftLink).toHaveAttribute('href', '/orders/order-1?space=ops');
  expect(orders).toHaveLength(1);
  expect(orders[0]).toMatchObject({
    id: 'order-1',
    space_id: 'ops',
    title: 'Support Triage',
    kind: 'loop',
    status: 'draft',
  });
  expect(String(orders[0].content)).toContain('loop_id: "pipeline-support"');

  await draftLink.click();
  await expect(page).toHaveURL(/\/orders\/order-1\?space=ops$/);
  await expect(page.getByRole('heading', { name: 'Support Triage', level: 2 })).toBeVisible();
  await expect(page.getByLabel('Order facts').getByText('Loop', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Order facts').getByText('Draft', { exact: true })).toBeVisible();

  await page.goto('/orders?space=ops');
  const registryRow = page.getByRole('article', { name: 'Support Triage Loop order' });
  await expect(registryRow).toBeVisible();
  await expect(registryRow).toContainText('Draft');
  await expect(registryRow).toContainText('Loop trigger');
  await expectNonBlankMain(page, 'Orders registry after promotion');

  const screenshotPath = testInfo.outputPath('work-to-orders-promote-journey.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(requests).toContain('/api/orders?space=ops');
  expect(requests).toContain('/api/orders/order-1?space=ops');
  expect(nullticketsActions).toContain('GET /tasks?limit=200');
  expect(failedResponses).toEqual([]);
  expect(runtimeErrors.filter((entry) => !entry.includes('Failed to load resource'))).toEqual([]);
});

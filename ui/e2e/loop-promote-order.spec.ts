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

const runningStatus = {
  ok: true,
  version: 'playwright-fixture',
  components: {
    nulltickets: { status: 'running', running: 1, total: 1 },
    nullboiler: { status: 'running', running: 1, total: 1 },
    nullclaw: { status: 'running', running: 1, total: 1 },
  },
  instances: {
    nulltickets: {
      tickets: { status: 'running', running: true, space_id: 'ops' },
    },
    nullboiler: {
      boiler: { status: 'running', running: true, space_id: 'ops' },
    },
    nullclaw: {
      claw: { status: 'running', running: true, space_id: 'ops' },
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
      todo: { description: 'Ready for support review' },
      done: { terminal: true, description: 'Exit condition met' },
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

test('promotes an installed Loop into a draft Order', async ({ page }, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];
  const orders: Record<string, unknown>[] = [];

  await installNullHubFixtureRoutes(page, {
    requests,
    orders,
    status: runningStatus,
    nullticketsPipelines: [supportLoop],
    nullticketsTasks: [],
  });

  await page.goto('/orders/loops?space=ops');

  const card = page.locator('.loop-card').filter({ hasText: 'Support Triage' });
  await expect(page.getByRole('heading', { name: 'Loops', exact: true })).toBeVisible();
  await expect(card).toBeVisible();

  await card.getByRole('button', { name: 'Promote to Order' }).click();

  await expect(page.getByText('Order draft created for Support Triage.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Support Triage' })).toHaveAttribute(
    'href',
    '/orders/order-1?space=ops',
  );
  expect(orders).toHaveLength(1);
  expect(orders[0]).toMatchObject({
    id: 'order-1',
    space_id: 'ops',
    title: 'Support Triage',
    kind: 'loop',
    status: 'draft',
  });
  expect(String(orders[0].content)).toContain('loop_id: "pipeline-support"');
  expect(String(orders[0].content)).toContain('## BOUNDS');

  await page.getByRole('link', { name: 'Open Support Triage' }).click();
  await expect(page).toHaveURL(/\/orders\/order-1\?space=ops$/);
  await expect(page.getByRole('heading', { name: 'Support Triage', level: 2 })).toBeVisible();
  await expect(page.getByLabel('Order facts').getByText('Loop', { exact: true })).toBeVisible();

  const screenshotPath = testInfo.outputPath('loop-promote-order.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(requests).toContain('/api/orders?space=ops');
  expect(requests).toContain('/api/orders/order-1?space=ops');
  expect(failedResponses).toEqual([]);
  expect(runtimeErrors.filter((entry) => !entry.includes('Failed to load resource'))).toEqual([]);
});

test('does not show promotion success when Orders API rejects the draft', async ({ page }) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);

  await installNullHubFixtureRoutes(page, {
    ordersStatus: 503,
    status: runningStatus,
    nullticketsPipelines: [supportLoop],
    nullticketsTasks: [],
  });

  await page.goto('/orders/loops?space=ops');
  const card = page.locator('.loop-card').filter({ hasText: 'Support Triage' });

  await card.getByRole('button', { name: 'Promote to Order' }).click();

  await expect(page.getByText('Orders unavailable.')).toBeVisible();
  await expect(page.getByText('Order draft created')).toHaveCount(0);
  expect(failedResponses.some((response) => response.startsWith('503 ') && response.includes('/api/orders'))).toBe(true);
  expect(runtimeErrors.filter((entry) => !entry.includes('Failed to load resource'))).toEqual([]);
});

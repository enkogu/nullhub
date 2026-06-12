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

test('renders /orders registry rows, filters, Charter stub, and remounted tabs', async ({ page }, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];
  await installNullHubFixtureRoutes(page, { requests, status: runningStatus });

  await page.goto('/orders?space=ops');

  await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible();
  await expect(page.locator('[data-slot="orders-registry"]')).toBeVisible();
  await expect(page.getByRole('article', { name: /Weekly pipeline review Workflow order/ })).toBeVisible();
  await expect(page.getByText('Tier Managed')).toBeVisible();
  await expect(page.getByText('12 execs')).toBeVisible();
  await expect(page.getByText('0 10 * * 1')).toBeVisible();
  await expect(page.getByText('Monday review signal')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Charter' })).toBeVisible();
  await expect(page.getByText('Stub')).toBeVisible();

  await page.getByRole('combobox', { name: 'type' }).selectOption('workflow');
  await expect(page.getByText('Weekly pipeline review')).toBeVisible();
  await expect(page.getByText('Morning report')).toHaveCount(0);

  await page.getByRole('combobox', { name: 'type' }).selectOption('');
  await page.getByRole('combobox', { name: 'status' }).selectOption('draft');
  await expect(page.getByText('Morning report')).toBeVisible();
  await expect(page.getByText('Weekly pipeline review')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Loops' }).click();
  await expect(page.getByRole('heading', { name: 'Loops', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
  await expect(page.locator('[data-slot="orders-remount-panel"]')).toContainText(/My Loops|Ticket store offline|Needs attention/);

  await page.getByRole('tab', { name: 'Workflows' }).click();
  await expect(page.getByRole('tablist', { name: 'NullBoiler views' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New Workflow' })).toBeVisible();
  await expect(page.getByText('No workflows')).toBeVisible();

  const screenshotPath = testInfo.outputPath('orders-registry-tabs.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(requests).toContain('/api/orders?space=ops');
  expect(failedResponses).toEqual([]);
  expect(runtimeErrors.filter((entry) => !entry.includes('Failed to load resource'))).toEqual([]);
});

test('renders /orders error state when the Orders API is unavailable', async ({ page }) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  await installNullHubFixtureRoutes(page, { ordersStatus: 503 });

  await page.goto('/orders?space=ops');

  await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible();
  await expect(page.getByText('Orders unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText('Orders unavailable.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Charter' })).toBeVisible();

  expect(failedResponses.some((entry) => entry.startsWith('503 ') && entry.includes('/api/orders'))).toBe(true);
  expect(runtimeErrors.filter((entry) => !entry.includes('Failed to load resource'))).toEqual([]);
});

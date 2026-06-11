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

const runningTicketsStatus = {
  ok: true,
  version: 'playwright-fixture',
  components: {
    nulltickets: { status: 'running', running: 1, total: 2 },
  },
  instances: {
    nulltickets: {
      tickets: { status: 'running', version: 'playwright-fixture', port: 7711 },
      selected: { status: 'running', version: 'playwright-fixture', port: 7712 },
    },
  },
};

test('loop marketplace browses remote templates and installs into Library', async ({ page }) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];
  await installNullHubFixtureRoutes(page, {
    requests,
    status: runningTicketsStatus,
    nullticketsPipelines: [],
  });

  await page.goto('/market/loops?tickets_instance=selected');

  const card = page.locator('.template-card').filter({ hasText: 'Support Triage' });
  await expect(page.getByRole('heading', { name: 'Loop Marketplace' })).toBeVisible();
  await expect(card).toBeVisible();
  await expect(card).toContainText('Support Machine');
  await expect(card).toContainText('All incoming requests have an owner and next action.');

  await card.getByRole('button', { name: 'Install' }).click();

  await expect(page.getByText('Support Triage installed into Library.')).toBeVisible();
  await expect(card.getByText('installed')).toBeVisible();
  expect(requests.some((request) => request.startsWith('/api/nulltickets/store/loops.templates'))).toBe(true);
  expect(requests.some((request) => request.startsWith('/api/instances/nulltickets/selected/tickets'))).toBe(true);

  await page.getByRole('link', { name: 'Open Library' }).click();
  await expect(page).toHaveURL(/\/orders\/loops\/library\?tickets_instance=selected$/);
  await expect(page.getByRole('heading', { name: 'Installed loops' })).toBeVisible();
  await expect(page.getByText('support-triage')).toBeVisible();
  expect(requests.filter((request) => request.startsWith('/api/instances/nulltickets/selected/tickets')).length).toBeGreaterThanOrEqual(3);
  expect(failedResponses).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

test('loop marketplace renders an ErrorState when the remote catalog is unavailable', async ({ page }) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  await installNullHubFixtureRoutes(page, {
    status: runningTicketsStatus,
    loopCatalogStatus: 503,
  });

  await page.goto('/market/loops');

  await expect(page.getByText('Unable to load loop marketplace')).toBeVisible();
  await expect(page.getByText('Remote loop catalog unavailable.')).toBeVisible();
  await expect(page.getByText('Marketplace service is not connected')).toHaveCount(0);
  expect(failedResponses.some((response) => response.includes('/api/nulltickets/store/loops.templates'))).toBe(true);
  expect(runtimeErrors.filter((message) => !message.includes('Failed to load resource'))).toEqual([]);
});

test('loop marketplace renders empty state when the remote catalog is connected but empty', async ({ page }) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  await installNullHubFixtureRoutes(page, {
    status: runningTicketsStatus,
    loopCatalog: [],
  });

  await page.goto('/market/loops');

  await expect(page.getByText('No remote loop templates')).toBeVisible();
  await expect(page.getByText('Marketplace service is not connected')).toHaveCount(0);
  expect(failedResponses).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

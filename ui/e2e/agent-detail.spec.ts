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

test('agent detail route renders overview and remounted product tabs', async ({ page }, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  await installNullHubFixtureRoutes(page, {
    status: {
      ok: true,
      version: 'playwright-fixture',
      components: {},
      instances: {
        nullclaw: {
          claw: {
            status: 'running',
            version: 'playwright-fixture',
            port: 19801,
            current_runs: 2,
            orders_as_executor: 3,
            uptime_seconds: 3600,
            auto_start: true,
          },
        },
      },
    },
  });

  await page.goto('/team/instances/nullclaw/claw');
  await expect(page.getByRole('heading', { name: 'claw' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Current runs', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Orders as executor', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '7d cost', exact: true })).toBeVisible();
  await expect(page.getByText('Usage exists (1,680 tokens, 6 requests), but no cost field is reported.')).toBeVisible();
  await expect(page.getByText('Healthy')).toBeVisible();
  await expect(page.getByText('Telemetry', { exact: true })).toBeVisible();
  await expect(page.getByText('No NullWatch linked yet.')).toBeVisible();

  const expectedTabs = ['Overview', 'Knowledge', 'Skills', 'Integrations', 'Schedules', 'Sessions'];
  for (const label of expectedTabs) {
    await expect(page.getByRole('tab', { name: label })).toBeVisible();
  }

  await page.getByRole('tab', { name: 'Knowledge' }).click();
  await page.waitForURL(/#knowledge$/);
  await expect(page.getByRole('heading', { name: 'Memory' })).toBeVisible();

  await page.getByRole('tab', { name: 'Integrations' }).click();
  await page.waitForURL(/#integrations$/);
  await expect(page.getByRole('heading', { name: 'MCP Servers' })).toBeVisible();

  await page.getByRole('tab', { name: 'Schedules' }).click();
  await page.waitForURL(/#schedules$/);
  await expect(page.getByRole('heading', { name: 'Cron Jobs' })).toBeVisible();

  await page.getByRole('tab', { name: 'Sessions' }).click();
  await page.waitForURL(/#sessions$/);
  await expect(page.getByRole('heading', { name: 'Conversation History' })).toBeVisible();

  await page.goto('/team/instances/nullclaw/claw#memory');
  await expect(page.getByRole('tab', { name: 'Knowledge' })).toHaveAttribute('data-state', 'active');
  await page.waitForURL(/#knowledge$/);

  const screenshotPath = testInfo.outputPath('agent-detail-overview.png');
  await page.goto('/team/instances/nullclaw/claw');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(failedResponses).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

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

test('system usage route renders usage stats and table from /api/usage', async ({ page }, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];
  await installNullHubFixtureRoutes(page, { requests });

  await page.goto('/system/usage');
  await expect(page.getByRole('heading', { name: 'System Usage' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Spend' })).toBeVisible();
  await expect(page.getByText('Not reported').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Total tokens' })).toBeVisible();
  await expect(page.getByText('7,000').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Usage by agent' })).toBeVisible();
  await expect(page.getByText('All spaces').first()).toBeVisible();
  await expect(page.getByText('nullclaw/athena')).toBeVisible();
  await expect(page.getByText('openai/gpt-5.5')).toBeVisible();
  expect(requests).toContain('/api/usage?window=7d');

  const screenshotPath = testInfo.outputPath('system-usage.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(failedResponses).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

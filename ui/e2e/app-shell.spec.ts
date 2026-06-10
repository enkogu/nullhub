import { expect, test } from '@playwright/test';
import { installNullHubFixtureRoutes } from './fixtures/nullhub';

test('renders the app shell in fixture mode without console errors', async ({ page }, testInfo) => {
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

  await installNullHubFixtureRoutes(page);
  await page.goto('/');

  await expect(page).toHaveURL(/\/work$/);
  await expect(page.locator('.shadcn-app')).toBeVisible();
  await expect(page.locator('main.real-content')).toBeVisible();
  await expect(page.getByRole('link', { name: /NullHub Workspace/ })).toBeVisible();
  await expect(page.locator('a[data-sidebar="menu-button"][href="/work"][data-size="default"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expect(page.getByText('No NullTickets instances installed.')).toBeVisible();

  const shellText = (await page.locator('.shadcn-app').innerText()).trim();
  expect(shellText.length).toBeGreaterThan(80);

  const screenshotPath = testInfo.outputPath('app-shell-fixture.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(failedResponses).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

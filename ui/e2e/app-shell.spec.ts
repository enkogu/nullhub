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

  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.shadcn-app')).toBeVisible();
  await expect(page.locator('main.real-content')).toBeVisible();
  await expect(page.getByRole('button', { name: /Local space Studio workspace/ })).toBeVisible();
  await expect(page.getByLabel('Primary navigation').getByRole('link', { name: 'Home' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.getByText('No instances installed yet.')).toBeVisible();

  const shellText = (await page.locator('.shadcn-app').innerText()).trim();
  expect(shellText.length).toBeGreaterThan(80);

  const screenshotPath = testInfo.outputPath('app-shell-fixture.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(failedResponses).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

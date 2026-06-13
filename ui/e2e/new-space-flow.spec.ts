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

test('creates an empty Space and keeps the scoped shell visible', async ({ page }, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];
  await installNullHubFixtureRoutes(page, { requests });

  await page.goto('/spaces/new');
  await expect(page.getByRole('heading', { name: 'New Space' })).toBeVisible();
  await expectNonBlankShell(page, 'new-space route');

  await page.getByLabel('Space name').fill('Launch Room');
  await page.getByRole('radio', { name: /Empty Space/ }).click();
  await page.getByRole('button', { name: 'Create empty Space' }).click();

  await expect(page).toHaveURL(/\/\?space=launch-room$/);
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Launch Room 0 pending/ })).toBeVisible();
  await expectNonBlankShell(page, 'empty-space home');

  const screenshotPath = testInfo.outputPath('new-space-empty.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(requests).toContain('/api/spaces');
  expect(requests).toContain('/api/market/catalog');
  expect(requests).toContain('/api/approvals?space=launch-room&status=pending&limit=100');
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

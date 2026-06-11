import { expect, test } from '@playwright/test';
import { installNullHubFixtureRoutes } from './fixtures/nullhub';

const SELECTED_SPACE_STORAGE_KEY = 'nullhub:selected-space';
const ALL_SPACES_STORAGE_VALUE = '__all__';

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

  await expect(page).toHaveURL(/\/(?:\?space=ops)?$/);
  await expect(page.locator('.shadcn-app')).toBeVisible();
  await expect(page.locator('main.real-content')).toBeVisible();
  await expect(page.getByRole('button', { name: /Operations Workspace - Active/ })).toBeVisible();
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

test('space switcher reloads product reads with the selected space scope', async ({ page }) => {
  const requests: string[] = [];
  await installNullHubFixtureRoutes(page, { requests });

  await page.goto('/system/providers');

  await expect(page.getByRole('button', { name: /Operations Workspace - Active/ })).toBeVisible();
  await expect(page.getByText('Ops Provider')).toBeVisible();

  await page.getByRole('button', { name: /Operations Workspace - Active/ }).click();
  await page.getByRole('menuitem', { name: /Lab Workspace - Paused/ }).click();

  await expect(page).toHaveURL(/(?:\?|&)space=lab(?:&|$)/);
  await expect(page.getByRole('button', { name: /Lab Workspace - Paused/ })).toBeVisible();
  await expect(page.getByText('Lab Provider')).toBeVisible();
  await expect(page.getByText('Ops Provider')).toHaveCount(0);

  expect(requests).toContain('/api/spaces');
  expect(requests.filter((request) => request.startsWith('/api/providers'))).toEqual([
    '/api/providers?space=ops',
    '/api/providers?space=lab',
  ]);
});

test('explicit All spaces selection keeps product reads unscoped and visible in the sidebar', async ({ page }) => {
  const requests: string[] = [];
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: SELECTED_SPACE_STORAGE_KEY, value: ALL_SPACES_STORAGE_VALUE },
  );
  await installNullHubFixtureRoutes(page, { requests });

  await page.goto('/system/providers');

  await expect(page.getByRole('button', { name: /All spaces\s+Aggregate view/ })).toBeVisible();
  await expect(page.getByText('Ops Provider')).toHaveCount(0);
  await expect(page.getByText('Lab Provider')).toHaveCount(0);

  expect(requests).toContain('/api/spaces');
  expect(requests.filter((request) => request.startsWith('/api/providers'))).toEqual(['/api/providers']);
});

test('fresh sessions do not render product routes unscoped when spaces fail to load', async ({ page }) => {
  const requests: string[] = [];
  await installNullHubFixtureRoutes(page, { requests, spacesStatus: 503 });

  await page.goto('/system/providers');

  await expect(page.getByRole('alert')).toContainText('Unable to load workspaces.');
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Saved Providers' })).toHaveCount(0);
  expect(requests).toContain('/api/spaces');
  expect(requests.filter((request) => request.startsWith('/api/providers'))).toEqual([]);
});

test('space deep links persist selection before sidebar navigation drops the query string', async ({ page }) => {
  const requests: string[] = [];
  await page.addInitScript(
    ({ key }) => window.localStorage.setItem(key, 'ops'),
    { key: SELECTED_SPACE_STORAGE_KEY },
  );
  await installNullHubFixtureRoutes(page, { requests });

  await page.goto('/system/providers?space=lab');

  await expect(page.getByRole('button', { name: /Lab Workspace - Paused/ })).toBeVisible();
  await expect(page.getByText('Lab Provider')).toBeVisible();
  await expect(page.getByText('Ops Provider')).toHaveCount(0);
  await expect(page.evaluate((key) => window.localStorage.getItem(key), SELECTED_SPACE_STORAGE_KEY)).resolves.toBe('lab');

  await page.getByLabel('Primary navigation').getByRole('link', { name: 'Home' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('No instances installed yet.')).toBeVisible();
  await page.getByRole('button', { name: 'System' }).click();
  await page.getByRole('link', { name: 'Channels' }).click();

  await expect(page).toHaveURL(/\/channels$/);
  await expect(page.getByRole('heading', { name: 'Saved Channels' })).toBeVisible();
  expect(requests.filter((request) => request.startsWith('/api/providers'))).toEqual(['/api/providers?space=lab']);
  await expect
    .poll(() => requests.filter((request) => request.startsWith('/api/channels')))
    .toEqual(['/api/channels?space=lab']);
});

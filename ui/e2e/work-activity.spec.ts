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

test('renders /work/activity from the space-scoped events API', async ({ page }, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];
  await installNullHubFixtureRoutes(page, { requests });

  await page.goto('/work/activity');

  await expect(page).toHaveURL(/\/work\/activity(?:\?space=ops)?$/);
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
  await expect(page.getByText('Review requested')).toBeVisible();
  await expect(page.getByText('Workflow completed')).toBeVisible();
  await expect(
    page.getByRole('article', { name: 'Review requested from Nulltickets' }).getByText('Athena', { exact: true }),
  ).toBeVisible();

  await page.getByRole('combobox', { name: 'source' }).selectOption('nullboiler');
  await expect(page.getByText('Workflow completed')).toBeVisible();
  await expect(page.getByText('Review requested')).toHaveCount(0);

  const screenshotPath = testInfo.outputPath('work-activity.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(requests.filter((request) => request.startsWith('/api/events'))).toEqual([
    '/api/events?space=ops&limit=100',
    '/api/events?space=lab&limit=100',
    '/api/events?space=ops&limit=50',
  ]);
  expect(failedResponses).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

test('renders /work/activity error state when events are unavailable', async ({ page }) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  await installNullHubFixtureRoutes(page, { eventsStatus: 503 });

  await page.goto('/work/activity');

  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
  await expect(page.getByText('Activity unavailable')).toBeVisible();
  await expect(page.getByText('Events unavailable.')).toBeVisible();
  expect(failedResponses.some((entry) => entry.startsWith('503 ') && entry.includes('/api/events'))).toBe(true);
  expect(runtimeErrors.filter((entry) => !entry.includes('Failed to load resource'))).toEqual([]);
});

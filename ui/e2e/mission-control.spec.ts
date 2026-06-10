import { expect, test } from '@playwright/test';
import { installNullHubFixtureRoutes } from './fixtures/nullhub';

test('loads Mission Control under the Work route and preserves the legacy redirect', async ({ page }) => {
  const missionControlResponses: string[] = [];
  const runtimeErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  page.on('pageerror', (error) => {
    runtimeErrors.push(error.message);
  });
  page.on('response', (response) => {
    if (response.url().includes('/api/mission-control/')) {
      missionControlResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  await installNullHubFixtureRoutes(page);
  await page.goto('/mission-control');

  await expect(page).toHaveURL(/\/work\/mission-control$/);
  await expect(page.getByRole('heading', { name: 'Mission Control' })).toBeVisible();
  await expect(page.getByText('Mission control is ready.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Launch Mission' })).toBeVisible();

  expect(missionControlResponses.some((entry) => entry.startsWith('200 ') && entry.includes('/api/mission-control/state'))).toBe(true);
  expect(missionControlResponses.some((entry) => entry.startsWith('200 ') && entry.includes('/api/mission-control/replays'))).toBe(true);
  expect(runtimeErrors).toEqual([]);
});

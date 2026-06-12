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

test('loads and edits the selected Space charter from Home', async ({ page }, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];
  await installNullHubFixtureRoutes(page, { requests });

  await page.goto('/?space=ops');

  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Charter' })).toBeVisible();
  await expect(page.getByText('Alpha')).toBeVisible();
  await expect(page.getByText('Keep operator work visible, reviewed, and moving.')).toBeVisible();
  await expect(page.getByText('T1 until a policy order raises the tier.')).toBeVisible();

  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit charter' })).toBeVisible();
  await page.getByLabel('Mission').fill('Keep launch decisions reviewed.');
  await page.getByLabel('Stage').selectOption('active');
  await page.getByLabel('Metrics').fill('release quality\nweekly spend');
  await page.getByRole('button', { name: 'Save charter' }).click();

  await expect(page.getByRole('dialog', { name: 'Edit charter' })).toHaveCount(0);
  await expect(page.getByText('Active')).toBeVisible();
  await expect(page.getByText('Keep launch decisions reviewed.')).toBeVisible();
  await expect(page.getByText('release quality')).toBeVisible();

  const screenshotPath = testInfo.outputPath('home-charter-edit.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(requests.filter((request) => request === '/api/charter?space=ops').length).toBeGreaterThanOrEqual(2);
  expect(failedResponses).toEqual([]);
  expect(runtimeErrors.filter((entry) => !entry.includes('Failed to load resource'))).toEqual([]);
});

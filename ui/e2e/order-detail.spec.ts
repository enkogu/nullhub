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

test('renders /orders/:id document facts, history run link, and suspend action', async ({ page }, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];
  await installNullHubFixtureRoutes(page, { requests });

  await page.goto('/orders/order-2?space=ops');

  await expect(page.getByRole('heading', { name: 'Weekly pipeline review', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Frontmatter' })).toBeVisible();
  const facts = page.getByLabel('Order facts');
  await expect(facts.getByText('Ops', { exact: true })).toBeVisible();
  await expect(facts.getByText('weekly', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Execution history' })).toBeVisible();
  await expect(page.getByText('order.executed')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open run run-order-2' })).toHaveAttribute(
    'href',
    '/work/runs/run-order-2?space=ops',
  );
  await expect(page.getByRole('button', { name: 'Edit' })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0);
  await expect(page.getByText('review_cycle: weekly')).toHaveCount(0);

  await page.getByRole('button', { name: 'Suspend' }).click();
  await expect(page.getByRole('dialog', { name: 'Suspend order' })).toBeVisible();
  await page.getByRole('button', { name: 'Suspend order' }).click();
  await expect(facts.getByText('Suspended', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();

  const screenshotPath = testInfo.outputPath('order-detail.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(requests).toContain('/api/orders/order-2?space=ops');
  expect(requests).toContain('/api/events?space=ops&subject_type=order&subject_id=order-2&limit=100');
  expect(requests).toContain('/api/orders/order-2/suspend?space=ops');
  expect(failedResponses).toEqual([]);
  expect(runtimeErrors.filter((entry) => !entry.includes('Failed to load resource'))).toEqual([]);
});

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

test('market catalog renders populated package grid, filters, and package detail', async ({ page }, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];
  await installNullHubFixtureRoutes(page, { requests });

  await page.goto('/market?space=ops');

  await expect(page.getByRole('heading', { name: 'Market' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Built-in Loop Templates' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'MCP Server Starters' })).toBeVisible();
  await expect(page.getByText('Installed', { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel('Market recommendation stages')).toContainText('Foundation');
  await expect(page.getByLabel('Market recommendation stages')).toContainText('Capability');

  await page.getByRole('combobox', { name: 'Type' }).selectOption('mcp_server');
  await expect(page.getByRole('heading', { name: 'MCP Server Starters' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Built-in Loop Templates' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Review package MCP Server Starters' }).click();
  await expect(page).toHaveURL(/\/market\/builtin\.mcp-server-starters/);
  await expect(page.getByRole('heading', { name: 'MCP Server Starters' })).toBeVisible();
  await expect(page.getByText('providers.search.api_key')).toBeVisible();
  await expect(page.getByText('Install impact')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Install into Space' })).toHaveAttribute(
    'href',
    '/market/install/builtin.mcp-server-starters',
  );

  const screenshotPath = testInfo.outputPath('market-detail.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(requests).toContain('/api/market/catalog');
  expect(requests).toContain('/api/market/installed?space=ops');
  expect(failedResponses).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

test('market pack wizard exports a selected package and refreshes My Packages', async ({ page }, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];
  await installNullHubFixtureRoutes(page, { requests });

  await page.goto('/market?space=ops');
  await expect(page.getByRole('heading', { name: 'Space packages' })).toBeVisible();

  await page.getByRole('tab', { name: 'Pack wizard' }).click();
  await page.getByRole('radio', { name: /Selection/ }).click();
  await page.getByRole('checkbox', { name: /NullClaw Agent Component/ }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Package id' }).fill('export.ops.agent-kit');
  await page.getByRole('textbox', { name: 'Name' }).fill('Ops Agent Kit');
  await page.getByRole('textbox', { name: 'Summary' }).fill('Reusable package exported from the Operations Space.');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Export package' }).click();

  await expect(page.getByText('Export created')).toBeVisible();
  await expect(page.getByText('export.ops.agent-kit').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download JSON' })).toHaveAttribute(
    'href',
    '/api/market/library/export.ops.agent-kit.json?space=ops',
  );

  await page.getByRole('tab', { name: 'My Packages' }).click();
  await expect(page.getByRole('heading', { name: 'Ops Agent Kit' })).toBeVisible();
  await expect(page.getByText('My package', { exact: true })).toBeVisible();

  const screenshotPath = testInfo.outputPath('market-pack-wizard.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(requests).toContain('/api/market/export?space=ops');
  expect(requests.filter((request) => request === '/api/market/installed?space=ops').length).toBeGreaterThanOrEqual(2);
  expect(failedResponses).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

test('market catalog renders loading state while package reads are pending', async ({ page }) => {
  await installNullHubFixtureRoutes(page, { marketCatalogDelayMs: 1200 });

  await page.goto('/market?space=ops');

  await expect(page.getByRole('status').filter({ hasText: 'Loading Market' })).toContainText('Loading Market');
});

test('market catalog renders empty state from an empty built-in catalog', async ({ page }) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  await installNullHubFixtureRoutes(page, { marketCatalog: { packages: [] }, marketInstalled: { packages: [] } });

  await page.goto('/market?space=ops');

  await expect(page.getByText('No packages in the built-in catalog')).toBeVisible();
  expect(failedResponses).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

test('market catalog renders error state when package reads fail', async ({ page }) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  await installNullHubFixtureRoutes(page, { marketCatalogStatus: 503 });

  await page.goto('/market?space=ops');

  await expect(page.getByText('Market unavailable')).toBeVisible();
  await expect(page.getByText('Market catalog unavailable.')).toBeVisible();
  expect(failedResponses.some((entry) => entry.startsWith('503 '))).toBe(true);
  expect(runtimeErrors.filter((entry) => !entry.includes('Failed to load resource'))).toEqual([]);
});

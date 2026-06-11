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

const redirectCases = [
  ['/dashboard', '/'],
  ['/loops', '/orders/loops'],
  ['/loops/library', '/orders/loops/library'],
  ['/loops/runs?filter=active', '/work/loops/runs?filter=active'],
  ['/loops/marketplace', '/market/loops'],
  ['/automations/workflows', '/orders/workflows'],
  ['/automations/runs/example-run', '/orders/workflows/runs/example-run'],
  ['/nullboiler/runs/example-run/fork', '/orders/workflows/runs/example-run/fork'],
  ['/task-flows', '/orders/task-flows'],
  ['/dispatch/queue', '/work/dispatch/queue'],
  ['/mission-control', '/work/mission-control'],
  ['/agents/roles', '/team/agents/roles'],
  ['/capabilities/skills', '/team/capabilities/skills'],
  ['/instances/nullclaw/claw', '/team/instances/nullclaw/claw'],
  ['/instances/nullclaw/claw?tab=skills#skills', '/team/instances/nullclaw/claw?tab=skills#skills'],
  ['/inventory/components', '/market/components'],
  ['/install/nullclaw', '/market/install/nullclaw'],
  ['/nulltickets/store', '/market/nulltickets/store'],
  ['/providers', '/system/providers'],
  ['/channels', '/system/channels'],
  ['/settings', '/system/settings'],
  ['/nullwatch?watch=watcher', '/system/observability?watch=watcher'],
  ['/artifacts', '/work/artifacts'],
  ['/report', '/work/reports'],
] as const;

for (const [legacyPath, targetPath] of redirectCases) {
  test(`redirects ${legacyPath} to ${targetPath}`, async ({ page }) => {
    const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
    await installNullHubFixtureRoutes(page);
    await page.goto(legacyPath);
    await page.waitForURL((url) => `${url.pathname}${url.search}${url.hash}` === targetPath);

    const url = new URL(page.url());
    expect(`${url.pathname}${url.search}${url.hash}`).toBe(targetPath);
    await expect(page.locator('main.real-content')).toBeVisible();
    expect(failedResponses).toEqual([]);
    expect(runtimeErrors).toEqual([]);
  });
}

test('canonical IA routes render nonblank shell content in fixture mode', async ({ page }, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);

  await installNullHubFixtureRoutes(page);

  for (const path of ['/', '/inbox', '/work', '/orders/loops', '/orders/workflows/runs', '/team/agents', '/team/instances', '/market', '/system/observability']) {
    await page.goto(path);
    await expect(page.locator('.shadcn-app')).toBeVisible();
    await expect(page.locator('main.real-content')).toBeVisible();
    await expect(page.locator('main.real-content')).not.toContainText('Loading workspace...');

    const text = (await page.locator('main.real-content').innerText()).trim();
    expect(text.length, `${path} should not render blank content`).toBeGreaterThan(24);

    const screenshotPath = testInfo.outputPath(`route-${path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home'}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`screenshot: ${screenshotPath}`);
  }

  await page.goto('/team/agents');
  await expect(page.getByRole('heading', { name: 'Agents' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hire agent' })).toBeVisible();

  expect(failedResponses).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

test('team agents status payload does not synthesize work or cost values', async ({ page }) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  await installNullHubFixtureRoutes(page, {
    status: {
      ok: true,
      version: 'playwright-fixture',
      components: {},
      instances: {
        nullclaw: {
          claw: {
            status: 'running',
            version: 'playwright-fixture',
            port: 19801,
          },
        },
      },
    },
  });

  await page.goto('/team/agents');

  const card = page.locator('.agent-card').filter({ hasText: 'claw' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Idle');
  await expect(card).not.toContainText('Daily cost');
  await expect(card).not.toContainText('$0.00/day');
  await expect(card).not.toContainText('Running on playwright-fixture');
  await expect(card).not.toContainText('port 19801');

  expect(failedResponses).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

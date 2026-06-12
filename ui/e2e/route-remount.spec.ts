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
  ['/automations', '/orders/workflows'],
  ['/automations/workflows', '/orders/workflows'],
  ['/automations/workflows/example-workflow', '/orders/workflows/example-workflow'],
  ['/automations/runs', '/orders/workflows/runs'],
  ['/automations/runs/example-run', '/orders/workflows/runs/example-run'],
  ['/automations/runs/example-run/fork', '/orders/workflows/runs/example-run/fork'],
  ['/nullboiler', '/orders/workflows'],
  ['/nullboiler/workflows', '/orders/workflows'],
  ['/nullboiler/workflows/example-workflow', '/orders/workflows/example-workflow'],
  ['/nullboiler/runs', '/orders/workflows/runs'],
  ['/nullboiler/runs/example-run', '/orders/workflows/runs/example-run'],
  ['/nullboiler/runs/example-run/fork', '/orders/workflows/runs/example-run/fork'],
  ['/task-flows', '/orders/task-flows'],
  ['/dispatch', '/work/dispatch'],
  ['/dispatch/queue', '/work/dispatch/queue'],
  ['/dispatch/runs', '/work/dispatch/runs'],
  ['/dispatch/failures', '/work/dispatch/failures'],
  ['/dispatch/telemetry', '/work/dispatch/telemetry'],
  ['/mission-control', '/work/mission-control'],
  ['/agents', '/team/agents'],
  ['/agents/profiles', '/team/agents/profiles'],
  ['/agents/roles', '/team/agents/roles'],
  ['/capabilities', '/team/capabilities/skills'],
  ['/capabilities/skills', '/team/capabilities/skills'],
  ['/capabilities/mcp', '/team/capabilities/mcp'],
  ['/capabilities/hooks', '/team/capabilities/hooks'],
  ['/capabilities/instructions', '/team/capabilities/instructions'],
  ['/capabilities/memory', '/team/capabilities/memory'],
  ['/capabilities/schedules', '/team/capabilities/schedules'],
  ['/team/capabilities', '/team/capabilities/skills'],
  ['/instances/nullboiler', '/team/instances/nullboiler'],
  ['/instances/nullclaw/claw', '/team/instances/nullclaw/claw'],
  ['/instances/nullclaw/claw?tab=skills#skills', '/team/instances/nullclaw/claw?tab=skills#skills'],
  ['/inventory/instances', '/team/instances'],
  ['/inventory/components', '/market/components'],
  ['/inventory/providers', '/system/providers'],
  ['/inventory/channels', '/system/channels'],
  ['/install', '/market'],
  ['/install/nullclaw', '/market/install/nullclaw'],
  ['/nulltickets', '/orders/loops'],
  ['/nulltickets/store', '/market/nulltickets/store'],
  ['/providers', '/system/providers'],
  ['/channels', '/system/channels'],
  ['/configs', '/system/configs'],
  ['/settings', '/system/settings'],
  ['/observability', '/system/observability'],
  ['/nullwatch?watch=watcher', '/system/observability?watch=watcher'],
  ['/artifacts', '/work/artifacts'],
  ['/report', '/work/reports'],
] as const;

function pathOnly(path: string): string {
  return path.split(/[?#]/, 1)[0] || '/';
}

function searchWithoutSpace(search: string): string {
  const params = new URLSearchParams(search);
  params.delete('space');
  params.sort();
  const value = params.toString();
  return value ? `?${value}` : '';
}

function matchesTargetLocation(url: URL, targetPath: string): boolean {
  const expected = new URL(targetPath, 'http://fixture.local');
  if (url.pathname !== expected.pathname || url.hash !== expected.hash) return false;
  return searchWithoutSpace(url.search) === searchWithoutSpace(expected.search);
}

for (const [legacyPath, targetPath] of redirectCases) {
  test(`redirects ${legacyPath} to ${targetPath}`, async ({ page }) => {
    const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
    await installNullHubFixtureRoutes(page);
    await page.goto(legacyPath);
    await page.waitForURL((url) => matchesTargetLocation(url, targetPath));

    const url = new URL(page.url());
    expect(matchesTargetLocation(url, targetPath)).toBe(true);
    await expect(page.locator('main.real-content')).toBeVisible();
    const breadcrumb = page.getByRole('navigation', { name: 'breadcrumb' });
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb).not.toContainText(pathOnly(legacyPath));
    await expect(breadcrumb).not.toContainText(pathOnly(targetPath));
    if (legacyPath === '/dashboard') {
      await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Installed loops' })).toHaveCount(0);
    }
    expect(failedResponses).toEqual([]);
    expect(runtimeErrors).toEqual([]);
  });
}

test('canonical IA routes render nonblank shell content in fixture mode', async ({ page }, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);

  await installNullHubFixtureRoutes(page);

  for (const path of ['/', '/inbox', '/work', '/orders', '/orders/loops', '/orders/workflows/runs', '/team', '/team/agents', '/team/instances', '/market', '/system', '/system/observability']) {
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

test('section overview shells stay on canonical routes and expose panel links', async ({ page }, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  await installNullHubFixtureRoutes(page);

  const cases = [
    {
      path: '/team?space=ops',
      heading: 'Team',
      tabs: [
        { name: 'Staff', links: ['Agents', 'Profiles', 'Roles'] },
        { name: 'Runtime', links: ['Instances', 'NullClaw agents'] },
        { name: 'Capabilities', links: ['Skills', 'MCP', 'Memory'] },
      ],
    },
    {
      path: '/system?space=ops',
      heading: 'System',
      tabs: [
        { name: 'Access', links: ['Providers', 'Channels'] },
        { name: 'Configuration', links: ['Settings', 'Configs'] },
        { name: 'Operations', links: ['Usage', 'Observability'] },
      ],
    },
  ];

  for (const item of cases) {
    await page.goto(item.path);
    const url = new URL(page.url());
    expect(url.pathname).toBe(pathOnly(item.path));
    await expect(page.getByRole('heading', { name: item.heading })).toBeVisible();
    await expect(page.locator('.header-breadcrumb').getByText(item.heading, { exact: true })).toBeVisible();
    await expect(page.locator('[data-slot="section-overview"]')).toBeVisible();
    for (const tab of item.tabs) {
      await page.getByRole('tab', { name: tab.name }).click();
      await expect(page.getByRole('tab', { name: tab.name })).toHaveAttribute('aria-selected', 'true');
      for (const link of tab.links) {
        await expect(page.getByRole('heading', { name: link }).first()).toBeVisible();
      }
    }
    const screenshotPath = testInfo.outputPath(`section-overview-${item.heading.toLowerCase()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`screenshot: ${screenshotPath}`);
  }

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

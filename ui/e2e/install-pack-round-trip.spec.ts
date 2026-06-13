import { expect, test, type Page } from '@playwright/test';
import { installNullHubFixtureRoutes } from './fixtures/nullhub';

type FixtureRecord = Record<string, any>;

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

async function expectNonBlankMain(page: Page, label: string) {
  await expect(page.locator('.shadcn-app')).toBeVisible();
  await expect(page.locator('main.real-content')).toBeVisible();
  await expect(page.locator('main.real-content')).not.toContainText('Loading workspace...');
  const text = (await page.locator('main.real-content').innerText()).trim();
  expect(text.length, `${label} should render nonblank content`).toBeGreaterThan(40);
}

async function installPackage(page: Page, packageId: string, space: string): Promise<FixtureRecord> {
  return page.evaluate(
    async ({ packageId: selectedPackageId, space: selectedSpace }) => {
      const response = await fetch(`/api/market/install?space=${encodeURIComponent(selectedSpace)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ package_id: selectedPackageId }),
      });
      if (!response.ok) throw new Error(`install failed ${response.status}: ${await response.text()}`);
      return response.json();
    },
    { packageId, space },
  );
}

async function fetchOrder(page: Page, id: string, space = 'ops'): Promise<FixtureRecord> {
  return page.evaluate(
    async ({ orderId, selectedSpace }) => {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}?space=${encodeURIComponent(selectedSpace)}`);
      if (!response.ok) throw new Error(`order fetch failed ${response.status}: ${await response.text()}`);
      return response.json();
    },
    { orderId: id, selectedSpace: space },
  );
}

async function fetchJson(page: Page, path: string): Promise<FixtureRecord> {
  return page.evaluate(async (requestPath) => {
    const response = await fetch(requestPath);
    if (!response.ok) throw new Error(`fetch failed ${response.status}: ${await response.text()}`);
    return response.json();
  }, path);
}

const runningFixtureStatus = {
  ok: true,
  version: 'playwright-fixture',
  components: {
    nulltickets: { status: 'running', running: 1, total: 1 },
    nullclaw: { status: 'running', running: 1, total: 1 },
  },
  instances: {
    nulltickets: {
      tickets: { status: 'running', port: 19001, space_id: 'ops' },
    },
    nullclaw: {
      Athena: {
        status: 'running',
        version: 'playwright-fixture',
        role: 'loop operator',
        current_work: 'Waiting for reviewed fixture runs',
        current_runs: 0,
        space_id: 'ops',
        auto_start: true,
      },
    },
  },
};

const triggerPipeline = {
  id: 'triggered-orders',
  name: 'Triggered Orders',
  definition: {},
  tickets_instance: 'tickets',
  space_id: 'ops',
  created_at_ms: 1_780_000_000_000,
};

test('E2E-4/E2E-7 installs multiplication kit, clears probation, packs a blueprint, and opens a recreated Space', async ({
  page,
}, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];
  const orders: FixtureRecord[] = [];
  const events: FixtureRecord[] = [];
  const approvals: FixtureRecord[] = [];
  const tasks: FixtureRecord[] = [];

  await installNullHubFixtureRoutes(page, {
    requests,
    orders,
    events,
    approvals,
    status: runningFixtureStatus,
    instances: runningFixtureStatus.instances,
    marketInstalled: { packages: [] },
    nullticketsPipelines: [triggerPipeline],
    nullticketsTasks: tasks,
  });

  await page.goto('/market/install/builtin.multiplication-demo?space=ops');
  await expect(page.getByRole('heading', { name: 'Multiplication Demo Kit', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kit install' })).toBeVisible();
  await expect(page.getByText('Loop: Multiplication Demo Loop')).toBeVisible();
  await expectNonBlankMain(page, 'multiplication install preview');

  await page.getByLabel('Accept install preview').click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('providers.fake_llm.api_key')).toBeVisible();
  await page.getByLabel('Confirm providers.fake_llm.api_key').click();
  await page.getByLabel('Acknowledge dependencies').click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Assigned to Athena (running)')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByLabel('Install label')).toHaveValue('Multiplication Demo Kit');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Confirm enactment review').click();
  await page.getByRole('button', { name: 'Stage install' }).click();
  await expect(page.getByText('Multiplication Demo Kit install plan is staged for Operations.')).toBeVisible();

  const installResult = await installPackage(page, 'builtin.multiplication-demo', 'ops');
  expect(installResult).toMatchObject({
    status: 'installed',
    package_id: 'builtin.multiplication-demo',
    probation: {
      status: 'approval_required',
      order_id: 'multiplication-demo-loop',
    },
  });
  expect(installResult.applied).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'package',
        id: 'builtin.multiplication-demo',
        source_tag: 'market://package/builtin.multiplication-demo@1.0.0#package:builtin.multiplication-demo',
      }),
      expect.objectContaining({
        kind: 'order',
        id: 'multiplication-demo-loop',
        source_tag: 'market://package/builtin.multiplication-demo@1.0.0#order:multiplication-demo-loop',
      }),
      expect.objectContaining({
        kind: 'approval',
        source_tag: 'market://package/builtin.multiplication-demo@1.0.0#approval:first-run',
      }),
    ]),
  );

  await page.goto('/market?space=ops');
  await page.getByRole('tab', { name: 'Installed' }).click();
  const installedPackageCard = page.locator('[data-slot="library-package-card"]').filter({ hasText: 'Multiplication Demo Kit' });
  await expect(installedPackageCard).toBeVisible();
  await expect(installedPackageCard.getByText('builtin.multiplication-demo')).toBeVisible();
  await expectNonBlankMain(page, 'installed package library');

  await page.goto('/inbox?space=ops');
  await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible();
  await expect(page.getByText('Approve first Multiplication Demo run')).toBeVisible();
  await expect(page.getByText('Probation requires approval before the installed multiplication Loop can move to automatic dispatch.')).toBeVisible();
  await expect(page.getByTestId('inbox-pending-badge')).toHaveText('1');
  await expectNonBlankMain(page, 'probation approval inbox');

  const approvalId = String(installResult.probation.approval_id);
  const decideRequest = page.waitForRequest(
    (request) => request.url().includes(`/approvals/${approvalId}/decide`) && request.method() === 'POST',
    { timeout: 15_000 },
  );
  const approvalCard = page.getByRole('article', { name: 'Question: Approve first Multiplication Demo run' });
  await approvalCard.getByLabel('Reply to the waiting run').fill('Approve the fixture multiplication result.');
  await approvalCard.getByRole('button', { name: 'Send reply' }).click();
  const request = await decideRequest;
  expect(request.postDataJSON()).toMatchObject({
    decision: 'approved',
    feedback: 'Approve the fixture multiplication result.',
  });
  await expect(page.locator('[data-slot="question-card"]')).toHaveCount(0);

  const approvedOrder = await fetchOrder(page, 'multiplication-demo-loop');
  expect(approvedOrder).toMatchObject({
    id: 'multiplication-demo-loop',
    status: 'active',
    exec_count: 1,
    safety: {
      status: 'clear',
      probation: false,
      safe_executions: 1,
      required_safe_executions: 1,
    },
  });
  expect(tasks).toHaveLength(1);
  expect(tasks[0]).toMatchObject({
    title: 'Multiplication demo run: 6 x 7',
    latest_run: {
      id: 'run-multiplication-demo-6x7',
      agent_id: 'Athena',
    },
  });

  await page.goto('/work/live?space=ops');
  await expect(page.getByRole('heading', { name: 'Live', exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Multiplication demo run: 6 x 7 Loop run' })).toContainText('Athena');
  await expectNonBlankMain(page, 'Work after approved multiplication run');

  await page.goto('/market?space=ops');
  await page.getByRole('tab', { name: 'Pack wizard' }).click();
  await page.getByRole('radio', { name: /Whole Space/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Package id' }).fill('export.ops.multiplication-blueprint');
  await page.getByRole('textbox', { name: 'Name' }).fill('Multiplication Space Blueprint');
  await page
    .getByRole('textbox', { name: 'Summary' })
    .fill('Recreates the reviewed multiplication demo Space from a packed blueprint.');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Export package' }).click();
  await expect(page.getByText('Export created')).toBeVisible();
  await expect(page.getByText('export.ops.multiplication-blueprint').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download JSON' })).toHaveAttribute(
    'href',
    '/api/market/library/export.ops.multiplication-blueprint.json?space=ops',
  );

  await page.goto('/spaces/new');
  await expect(page.getByRole('heading', { name: 'New Space', level: 1 })).toBeVisible();
  await page.getByLabel('Space name').fill('Multiplier Lab');
  await page.getByRole('radio', { name: /From Blueprint/ }).click();
  await page.getByRole('button', { name: /Multiplication Space Blueprint/ }).click();
  await page.getByRole('button', { name: 'Create and open installer' }).click();
  await expect(page).toHaveURL(/\/market\/install\/export\.ops\.multiplication-blueprint\?space=multiplier-lab$/);
  await expect(page.getByRole('heading', { name: 'Multiplication Space Blueprint', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Space')).toHaveValue('multiplier-lab');

  const blueprintInstall = await installPackage(page, 'export.ops.multiplication-blueprint', 'multiplier-lab');
  expect(blueprintInstall).toMatchObject({
    status: 'installed',
    space_id: 'multiplier-lab',
    package_id: 'export.ops.multiplication-blueprint',
  });
  expect(blueprintInstall.applied).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'package',
        id: 'export.ops.multiplication-blueprint',
        source_tag:
          'market://package/export.ops.multiplication-blueprint@1.0.0#package:export.ops.multiplication-blueprint',
      }),
      expect.objectContaining({
        kind: 'order',
        id: 'multiplication-demo-loop',
        source_tag: 'market://package/export.ops.multiplication-blueprint@1.0.0#order:multiplication-demo-loop',
      }),
    ]),
  );

  const recreatedOrder = await fetchOrder(page, 'multiplication-demo-loop', 'multiplier-lab');
  expect(recreatedOrder).toMatchObject({
    id: 'multiplication-demo-loop',
    space_id: 'multiplier-lab',
    title: 'Multiplication Demo Loop',
    summary: 'Multiply fixture inputs and attach Work evidence.',
    kind: 'trigger',
    status: 'active',
    schedule: 'event:demo.multiply.requested',
  });
  expect(recreatedOrder.tags).toEqual(
    expect.arrayContaining([
      'package:export.ops.multiplication-blueprint',
      'market://package/export.ops.multiplication-blueprint@1.0.0#order:multiplication-demo-loop',
    ]),
  );

  const multiplierLibrary = await fetchJson(page, '/api/market/installed?space=multiplier-lab');
  const multiplierPackageIds = (multiplierLibrary.packages as FixtureRecord[]).map((pkg) => String(pkg.id));
  expect(multiplierPackageIds).toContain('export.ops.multiplication-blueprint');
  expect(multiplierPackageIds).not.toContain('builtin.multiplication-demo');

  const multiplierEvents = await fetchJson(page, '/api/events?space=multiplier-lab&type=package.installed&limit=20');
  expect(multiplierEvents.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        space_id: 'multiplier-lab',
        type: 'package.installed',
        subject_id: 'export.ops.multiplication-blueprint',
        payload: expect.objectContaining({
          source_tag:
            'market://package/export.ops.multiplication-blueprint@1.0.0#package:export.ops.multiplication-blueprint',
        }),
      }),
    ]),
  );

  await page.goto('/orders?space=multiplier-lab');
  await expect(page.getByRole('heading', { name: 'Orders', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Multiplication Demo Loop' })).toBeVisible();
  await expectNonBlankMain(page, 'Orders for recreated blueprint Space');

  await page.goto('/market?space=multiplier-lab');
  await page.getByRole('tab', { name: 'Installed' }).click();
  const recreatedPackageCard = page.locator('[data-slot="library-package-card"]').filter({
    hasText: 'Multiplication Space Blueprint',
  });
  await expect(recreatedPackageCard).toBeVisible();
  await expect(recreatedPackageCard.getByText('export.ops.multiplication-blueprint')).toBeVisible();
  await expect(page.locator('[data-slot="library-package-card"]').filter({ hasText: 'builtin.multiplication-demo' })).toHaveCount(0);
  await expectNonBlankMain(page, 'Installed packages for recreated blueprint Space');

  await page.goto('/?space=multiplier-lab');
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /Multiplier Lab 0 pending/ })).toBeVisible();
  await expectNonBlankMain(page, 'Home for recreated blueprint Space');

  const screenshotPath = testInfo.outputPath('install-pack-round-trip-home.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(requests).toContain('/api/market/install?space=ops');
  expect(requests).toContain('/api/approvals?space=ops&status=pending&limit=100');
  expect(requests).toContain(`/api/approvals/${approvalId}/decide?space=ops`);
  expect(requests).toContain('/api/orders/multiplication-demo-loop?space=ops');
  expect(requests).toContain('/api/market/export?space=ops');
  expect(requests).toContain('/api/spaces');
  expect(requests).toContain('/api/market/install?space=multiplier-lab');
  expect(requests).toContain('/api/approvals?space=multiplier-lab&status=pending&limit=25');
  expect(requests.some((entry) => entry.startsWith('/api/events?space=multiplier-lab&limit='))).toBe(true);
  expect(failedResponses).toEqual([]);
  expect(runtimeErrors.filter((entry) => !entry.includes('Failed to load resource'))).toEqual([]);
});

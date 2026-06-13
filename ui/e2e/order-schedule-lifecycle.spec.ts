import { expect, test, type Page } from '@playwright/test';
import { installNullHubFixtureRoutes } from './fixtures/nullhub';

type FixtureRecord = Record<string, any>;

const orderId = 'vd38-scheduled-order';
const spaceId = 'ops';
const firstRunRef = 'scheduled-order-run-1';
const secondRunRef = 'scheduled-order-run-2';

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

async function createScheduledOrder(page: Page) {
  return page.evaluate(async ({ id, space }) => {
    const response = await fetch(`/api/orders?space=${encodeURIComponent(space)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id,
        title: 'Customer escalation digest',
        summary: 'Check active customer escalations and produce a Work run.',
        kind: 'schedule',
        schedule: '*/5 * * * *',
        signal: 'Every five minutes',
        tier: 'Core',
        content: `---
kind: "schedule"
source: "human"
title: "Customer escalation digest"
summary: "Check active customer escalations and produce a Work run."
schedule: "*/5 * * * *"
autonomy_tier: "T1"
---
## WHEN
- Every five minutes while the order is active.

## WHAT
- Review customer escalations and produce a short digest.

## BOUNDS
- Write Work evidence and stop after the digest is queued.
`,
      }),
    });
    if (!response.ok) throw new Error(`create failed ${response.status}: ${await response.text()}`);
    return response.json();
  }, { id: orderId, space: spaceId });
}

async function enactOrder(page: Page) {
  return page.evaluate(async ({ id, space }) => {
    const response = await fetch(`/api/orders/${encodeURIComponent(id)}/enact?space=${encodeURIComponent(space)}`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error(`enact failed ${response.status}: ${await response.text()}`);
    return response.json();
  }, { id: orderId, space: spaceId });
}

async function fireSchedule(page: Page, input: {
  runRef: string;
  title: string;
  nowMs: number;
}): Promise<FixtureRecord> {
  return page.evaluate(async ({ id, space, runRef, title, nowMs }) => {
    const response = await fetch(`/api/fixtures/schedule-fire?space=${encodeURIComponent(space)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        order_id: id,
        run_ref: runRef,
        title,
        now_ms: nowMs,
        component: 'nullclaw',
        instance: 'Athena',
        cron_job_id: `cron-${id}`,
      }),
    });
    if (!response.ok) throw new Error(`schedule fire failed ${response.status}: ${await response.text()}`);
    return response.json();
  }, { id: orderId, space: spaceId, ...input });
}

test('E2E-38 scheduled order fires work evidence and pause blocks future runs @smoke', async ({ page }, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];
  const orders: FixtureRecord[] = [];
  const events: FixtureRecord[] = [];
  const tasks: FixtureRecord[] = [];
  const nowMs = Date.now();

  await installNullHubFixtureRoutes(page, {
    requests,
    orders,
    events,
    instances: {
      nulltickets: {
        tickets: { status: 'running', port: 19001, space_id: spaceId },
      },
      nullclaw: {
        Athena: { status: 'running', space_id: spaceId },
      },
    },
    status: {
      ok: true,
      version: 'playwright-fixture',
      components: {
        nulltickets: { status: 'running', running: 1, total: 1 },
        nullclaw: { status: 'running', running: 1, total: 1 },
      },
      instances: {
        nulltickets: {
          tickets: { status: 'running', port: 19001, space_id: spaceId },
        },
        nullclaw: {
          Athena: { status: 'running', space_id: spaceId },
        },
      },
    },
    nullticketsPipelines: [
      {
        id: 'scheduled-orders',
        name: 'Scheduled Orders',
        definition: {},
        tickets_instance: 'tickets',
        space_id: spaceId,
      },
    ],
    nullticketsTasks: tasks,
  });

  await page.goto('/orders?space=ops');
  await expect(page.getByRole('heading', { name: 'Orders', exact: true, level: 1 })).toBeVisible();
  await expect(page.getByText('No orders')).toBeVisible();

  await expect(createScheduledOrder(page)).resolves.toMatchObject({
    id: orderId,
    status: 'draft',
    schedule: '*/5 * * * *',
  });

  await page.goto('/orders?space=ops');
  const draftRow = page.getByRole('article', { name: 'Customer escalation digest Schedule order' });
  await expect(draftRow).toBeVisible();
  await expect(draftRow).toContainText('Draft');
  await expect(draftRow).toContainText('*/5 * * * *');

  await expect(enactOrder(page)).resolves.toMatchObject({ id: orderId, status: 'active' });

  await page.goto(`/orders/${orderId}?space=ops`);
  await expect(page.getByRole('heading', { name: 'Customer escalation digest', level: 2 })).toBeVisible();
  await expect(page.getByLabel('Order facts').getByText('Active', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Suspend' })).toBeVisible();

  const firstFire = await fireSchedule(page, {
    runRef: firstRunRef,
    title: 'Customer escalation digest',
    nowMs: nowMs + 5 * 60_000,
  });
  expect(firstFire).toMatchObject({
    fired: true,
    event: {
      space_id: spaceId,
      type: 'order.executed',
      source: 'cron',
      subject_type: 'order',
      subject_id: orderId,
      title: 'Order executed',
      summary: 'A schedule order cron run completed.',
      payload: {
        component: 'nullclaw',
        instance: 'Athena',
        cron_job_id: `cron-${orderId}`,
        run_ref: 'scheduled-order-run-1',
      },
    },
    task: {
      space_id: spaceId,
      tickets_instance: 'tickets',
      title: 'Customer escalation digest',
      description: `Work evidence created from scheduled order ${orderId}.`,
      latest_run: {
        id: firstRunRef,
        status: 'running',
        agent_id: 'Athena',
      },
    },
    order: {
      id: orderId,
      space_id: spaceId,
      status: 'active',
      exec_count: 1,
    },
  });
  expect(firstFire.event.payload.run_id).toBeUndefined();
  expect(firstFire.event.payload.runRef).toBeUndefined();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Execution history' })).toBeVisible();
  await expect(page.getByText('order.executed')).toBeVisible();
  const historyRunLink = page.getByRole('link', { name: `Open run ${firstRunRef}` });
  await expect(historyRunLink).toHaveAttribute(
    'href',
    `/work/runs/${firstRunRef}?space=${spaceId}`,
  );
  await historyRunLink.click();
  await expect(page).toHaveURL(new RegExp(`/work/runs/${firstRunRef}\\?space=${spaceId}$`));
  await expect(page.getByRole('heading', { name: 'Run Detail' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Customer escalation digest' })).toBeVisible();
  await expect(page.getByText(firstRunRef).first()).toBeVisible();
  await expect(page.getByText(`Work evidence created from scheduled order ${orderId}.`, { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Attempt summary' }).getByText('Athena', { exact: true })).toBeVisible();

  await page.goto('/orders?space=lab');
  await expect(page.getByRole('heading', { name: 'Orders', exact: true, level: 1 })).toBeVisible();
  await expect(page.getByText('Customer escalation digest')).toHaveCount(0);

  await page.goto('/work/activity?space=ops');
  await expect(page.getByRole('heading', { name: 'Activity', exact: true, level: 1 })).toBeVisible();
  const activityEvent = page.getByRole('article', { name: 'Order executed from Cron' });
  await expect(activityEvent).toBeVisible();
  await expect(activityEvent).toContainText('A schedule order cron run completed.');
  await expect(activityEvent).toContainText('order.executed');

  await page.goto('/work/activity?space=lab');
  await expect(page.getByRole('heading', { name: 'Activity', exact: true, level: 1 })).toBeVisible();
  await expect(page.getByText('Customer escalation digest')).toHaveCount(0);
  await expect(page.getByText('A schedule order cron run completed.')).toHaveCount(0);
  await expect(page.getByText('order.executed')).toHaveCount(0);

  await page.goto('/work/live?space=ops');
  await expect(page.getByRole('heading', { name: 'Live', exact: true })).toBeVisible();
  const liveRun = page.getByRole('article', { name: 'Customer escalation digest Loop run' });
  await expect(liveRun).toBeVisible();
  await expect(liveRun).toContainText('Work evidence');
  await expect(liveRun).toContainText('Athena');
  await expect(page.getByRole('link', { name: 'Open Customer escalation digest' })).toHaveAttribute(
    'href',
    `/work/runs/${firstRunRef}?task_id=task-${firstRunRef}&tickets_instance=tickets&space=${spaceId}`,
  );

  await page.goto('/work/live?space=lab');
  await expect(page.getByRole('heading', { name: 'Live', exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Customer escalation digest Loop run' })).toHaveCount(0);
  await expect(page.getByText(firstRunRef)).toHaveCount(0);

  await page.goto(`/work/runs/${firstRunRef}?space=lab`);
  await expect(page.getByRole('heading', { name: 'Run Detail' })).toBeVisible();
  await expect(page.getByText('Run context needed')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Customer escalation digest' })).toHaveCount(0);
  await expect(page.getByText(`Work evidence created from scheduled order ${orderId}.`)).toHaveCount(0);

  await page.goto(`/orders/${orderId}?space=ops`);
  await page.getByRole('button', { name: 'Suspend' }).click();
  await expect(page.getByRole('dialog', { name: 'Suspend order' })).toBeVisible();
  await page.getByRole('button', { name: 'Suspend order' }).click();
  await expect(page.getByLabel('Order facts').getByText('Suspended', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();

  await expect(
    fireSchedule(page, {
      runRef: secondRunRef,
      title: 'Second customer escalation digest',
      nowMs: nowMs + 10 * 60_000,
    }),
  ).resolves.toMatchObject({ fired: false, reason: 'order_not_active', order_status: 'suspended' });

  await page.goto('/work/live?space=ops');
  await expect(page.getByRole('article', { name: 'Customer escalation digest Loop run' })).toBeVisible();
  await expect(page.getByText('Second customer escalation digest')).toHaveCount(0);

  await page.goto('/work/activity?space=ops');
  await expect(page.getByRole('article', { name: 'Order executed from Cron' })).toBeVisible();
  await expect(page.getByText('Second customer escalation digest')).toHaveCount(0);

  const screenshotPath = testInfo.outputPath('order-schedule-lifecycle.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(requests).toContain('/api/orders?space=ops');
  expect(requests).toContain('/api/orders?space=lab');
  expect(requests).toContain(`/api/orders/${orderId}/enact?space=ops`);
  expect(requests).toContain(`/api/orders/${orderId}/suspend?space=ops`);
  expect(requests.filter((request) => request === '/api/fixtures/schedule-fire?space=ops')).toHaveLength(2);
  expect(requests).toContain(`/api/events?space=ops&subject_type=order&subject_id=${orderId}&limit=100`);
  expect(requests.some((request) => request.startsWith('/api/events?space=ops&limit='))).toBe(true);
  expect(requests.some((request) => request.startsWith('/api/events?space=lab&limit='))).toBe(true);
  expect(
    requests.some((request) => request.startsWith('/api/instances/nulltickets/tickets/tickets') && request.includes('space=ops')),
  ).toBe(true);
  expect(
    requests.some((request) => request.startsWith('/api/instances/nulltickets/tickets/tickets') && request.includes('space=lab')),
  ).toBe(true);
  expect(failedResponses).toEqual([]);
  expect(runtimeErrors.filter((entry) => !entry.includes('Failed to load resource'))).toEqual([]);
});

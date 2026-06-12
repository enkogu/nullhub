import { expect, test, type Page } from '@playwright/test';
import { installNullHubFixtureRoutes } from './fixtures/nullhub';

type FixtureRecord = Record<string, any>;

const orderId = 'vd38-scheduled-order';
const spaceId = 'ops';

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

function fireScheduleIfActive(input: {
  orders: FixtureRecord[];
  events: FixtureRecord[];
  tasks: FixtureRecord[];
  runId: string;
  title: string;
  nowMs: number;
}): boolean {
  const order = input.orders.find((entry) => entry.id === orderId && entry.space_id === spaceId);
  if (!order || order.status !== 'active') return false;

  const taskId = `task-${input.runId}`;
  order.exec_count = Number(order.exec_count || 0) + 1;
  order.updated_at_ms = input.nowMs;

  input.events.unshift({
    id: input.events.length + 10_000,
    space_id: spaceId,
    type: 'order.executed',
    source: 'orders',
    subject_type: 'order',
    subject_id: orderId,
    title: `${input.title} fired`,
    summary: `Scheduled order created Work run ${input.runId} with artifact://${input.runId}.`,
    severity: 'success',
    evidence_ref: `artifact://${input.runId}`,
    created_at_ms: input.nowMs,
    payload: { run_id: input.runId, status: 'running', agent: 'Athena' },
  });

  input.tasks.unshift({
    id: taskId,
    pipeline_id: 'scheduled-orders',
    stage: 'in_progress',
    title: input.title,
    description: `Work evidence created from scheduled order ${orderId}.`,
    priority: 80,
    created_at_ms: input.nowMs,
    updated_at_ms: input.nowMs,
    tickets_instance: 'tickets',
    space_id: spaceId,
    latest_run: {
      id: input.runId,
      task_id: taskId,
      status: 'running',
      agent_id: 'Athena',
      attempt: 1,
      started_at_ms: input.nowMs,
    },
  });

  return true;
}

test('E2E-38 scheduled order fires work evidence and pause blocks future runs', async ({ page }, testInfo) => {
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

  expect(
    fireScheduleIfActive({
      orders,
      events,
      tasks,
      runId: 'scheduled-order-run-1',
      title: 'Customer escalation digest',
      nowMs: nowMs + 5 * 60_000,
    }),
  ).toBe(true);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Execution history' })).toBeVisible();
  await expect(page.getByText('order.executed')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open run scheduled-order-run-1' })).toHaveAttribute(
    'href',
    '/work/runs/scheduled-order-run-1?space=ops',
  );

  await page.goto('/work/activity?space=ops');
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
  const activityEvent = page.getByRole('article', { name: 'Customer escalation digest fired from Orders' });
  await expect(activityEvent).toBeVisible();
  await expect(activityEvent).toContainText('artifact://scheduled-order-run-1');

  await page.goto('/work/live?space=ops');
  await expect(page.getByRole('heading', { name: 'Live', exact: true })).toBeVisible();
  const liveRun = page.getByRole('article', { name: 'Customer escalation digest Loop run' });
  await expect(liveRun).toBeVisible();
  await expect(liveRun).toContainText('Work evidence');
  await expect(liveRun).toContainText('Athena');

  await page.goto(`/orders/${orderId}?space=ops`);
  await page.getByRole('button', { name: 'Suspend' }).click();
  await expect(page.getByRole('dialog', { name: 'Suspend order' })).toBeVisible();
  await page.getByRole('button', { name: 'Suspend order' }).click();
  await expect(page.getByLabel('Order facts').getByText('Suspended', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();

  expect(
    fireScheduleIfActive({
      orders,
      events,
      tasks,
      runId: 'scheduled-order-run-2',
      title: 'Second customer escalation digest',
      nowMs: nowMs + 10 * 60_000,
    }),
  ).toBe(false);

  await page.goto('/work/live?space=ops');
  await expect(page.getByRole('article', { name: 'Customer escalation digest Loop run' })).toBeVisible();
  await expect(page.getByText('Second customer escalation digest')).toHaveCount(0);

  await page.goto('/work/activity?space=ops');
  await expect(page.getByRole('article', { name: 'Customer escalation digest fired from Orders' })).toBeVisible();
  await expect(page.getByText('Second customer escalation digest')).toHaveCount(0);

  const screenshotPath = testInfo.outputPath('order-schedule-lifecycle.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(requests).toContain('/api/orders?space=ops');
  expect(requests).toContain(`/api/orders/${orderId}/enact?space=ops`);
  expect(requests).toContain(`/api/orders/${orderId}/suspend?space=ops`);
  expect(requests).toContain(`/api/events?space=ops&subject_type=order&subject_id=${orderId}&limit=100`);
  expect(requests.some((request) => request.startsWith('/api/events?space=ops&limit='))).toBe(true);
  expect(
    requests.some((request) => request.startsWith('/api/instances/nulltickets/tickets/tickets') && request.includes('space=ops')),
  ).toBe(true);
  expect(failedResponses).toEqual([]);
  expect(runtimeErrors.filter((entry) => !entry.includes('Failed to load resource'))).toEqual([]);
});

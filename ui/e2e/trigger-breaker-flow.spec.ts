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
  await expect(page.locator('main.real-content')).toBeVisible();
  await expect(page.locator('main.real-content')).not.toContainText('Loading workspace...');
  const text = (await page.locator('main.real-content').innerText()).trim();
  expect(text.length, `${label} should render nonblank content`).toBeGreaterThan(40);
}

async function fireTrigger(page: Page, input: FixtureRecord): Promise<FixtureRecord> {
  return page.evaluate(async (body) => {
    const response = await fetch('/api/fixtures/trigger-fire?space=ops', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`trigger fire failed ${response.status}: ${await response.text()}`);
    return response.json();
  }, input);
}

async function fetchOrder(page: Page, id: string): Promise<FixtureRecord> {
  return page.evaluate(async (orderId) => {
    const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}?space=ops`);
    if (!response.ok) throw new Error(`order fetch failed ${response.status}: ${await response.text()}`);
    return response.json();
  }, id);
}

const runningTriggerStatus = {
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
        role: 'ops lead',
        current_work: 'Waiting for trigger events',
        current_runs: 0,
        space_id: 'ops',
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

function activeTriggerOrder(input: {
  id: string;
  title: string;
  tier: 'T0' | 'T1' | 'T2';
  eventType: string;
  source: string;
  subjectType: string;
  target: string;
}): FixtureRecord {
  return {
    id: input.id,
    space_id: 'ops',
    title: input.title,
    summary: `${input.eventType} fixture trigger.`,
    kind: 'trigger',
    goal: '',
    status: 'active',
    schedule: `event:${input.eventType}`,
    tier: input.tier,
    exec_count: 0,
    doc_path: `orders/${input.id}.md`,
    content: JSON.stringify({
      trigger: {
        event_type: input.eventType,
        source: input.source,
        subject_type: input.subjectType,
      },
      tier: input.tier,
      action: {
        type: 'run_agent',
        target: input.target,
        instructions: 'Handle the matching event and write Work evidence.',
      },
    }),
    created_at_ms: 1_780_000_000_000,
    updated_at_ms: 1_780_000_000_000,
  };
}

test('E2E-47 trigger order fires event into Work and gates tiered execution through Inbox', async ({ page }, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];
  const orders: FixtureRecord[] = [];
  const events: FixtureRecord[] = [];
  const approvals: FixtureRecord[] = [];
  const tasks: FixtureRecord[] = [];
  const nowMs = Date.now();

  await installNullHubFixtureRoutes(page, {
    requests,
    orders,
    events,
    approvals,
    status: runningTriggerStatus,
    instances: runningTriggerStatus.instances,
    nullticketsPipelines: [triggerPipeline],
    nullticketsTasks: tasks,
  });

  await page.goto('/orders/new?space=ops&type=trigger&source=ai_decision');
  await expect(page.getByRole('heading', { name: 'New Order', level: 1 })).toBeVisible();
  await expect(page.getByText('AI decision draft')).toBeVisible();
  await page.getByLabel('Title').fill('Ticket event dispatcher');
  await page.getByLabel('Summary').fill('Create Work evidence when a support ticket appears.');
  await page.getByLabel('Event type').fill('work.ticket.created');
  await page.getByLabel('Source filter').fill('nulltickets');
  await page.getByLabel('Subject type').fill('ticket');
  await page.getByLabel('Agent or instance').fill('Athena');
  await page.getByLabel('Instructions').fill('Triage the ticket, assign an owner, and attach evidence.');
  await page.getByRole('button', { name: /T0 Observe/ }).click();
  await page.getByRole('button', { name: 'Approve & enact' }).first().click();

  await expect(page).toHaveURL(/\/orders\/order-1\?space=ops$/);
  await expect(page.getByRole('heading', { name: 'Ticket event dispatcher', level: 2 })).toBeVisible();
  await expect(page.getByLabel('Order facts').getByText('Active', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Order facts').getByText('Trigger', { exact: true })).toBeVisible();
  await expectNonBlankMain(page, 'Trigger order detail');

  orders.push(
    activeTriggerOrder({
      id: 'gated-ticket-dispatcher',
      title: 'Gated ticket dispatcher',
      tier: 'T2',
      eventType: 'work.ticket.created',
      source: 'nulltickets',
      subjectType: 'ticket',
      target: 'Athena',
    }),
  );

  const gated = await fireTrigger(page, {
    order_id: 'gated-ticket-dispatcher',
    event_type: 'work.ticket.created',
    source: 'nulltickets',
    subject_type: 'ticket',
    subject_id: 'ticket-gated-1',
    run_ref: 'trigger-run-gated-1',
    title: 'Gated ticket triage',
    now_ms: nowMs + 1_000,
  });
  expect(gated).toMatchObject({
    fired: false,
    status: 'approval_required',
    approval: {
      kind: 'question',
      queue: 'dispatcher',
      status: 'pending',
      title: 'Approve dispatcher run_agent: Gated ticket dispatcher',
    },
  });
  expect(tasks.find((task) => task.latest_run?.id === 'trigger-run-gated-1')).toBeUndefined();

  await page.goto('/inbox?space=ops');
  await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible();
  await expect(page.getByText('Approve dispatcher run_agent: Gated ticket dispatcher')).toBeVisible();
  await expect(page.getByText(/Tier T2 approval for event/)).toBeVisible();
  await expect(page.getByTestId('inbox-pending-badge')).toContainText('1');
  await expectNonBlankMain(page, 'Inbox after gated trigger');

  const gatedQuestion = page.getByRole('article', {
    name: 'Question: Approve dispatcher run_agent: Gated ticket dispatcher',
  });
  const approvalId = String(gated.approval.id);
  const decideRequest = page.waitForRequest(
    (request) => request.url().includes(`/approvals/${approvalId}/decide`) && request.method() === 'POST',
    { timeout: 15_000 },
  );
  await gatedQuestion.getByLabel('Reply to the waiting run').fill('Approved for supervised ticket triage.');
  await gatedQuestion.getByRole('button', { name: 'Send reply' }).click();

  const request = await decideRequest;
  expect(request.postDataJSON()).toMatchObject({
    decision: 'approved',
    feedback: 'Approved for supervised ticket triage.',
  });
  await expect(page.locator('[data-slot="question-card"]')).toHaveCount(0);

  const approvedGatedOrder = await fetchOrder(page, 'gated-ticket-dispatcher');
  expect(approvedGatedOrder).toMatchObject({
    id: 'gated-ticket-dispatcher',
    status: 'active',
    exec_count: 1,
    safety: {
      status: 'probation',
      safe_executions: 1,
      consecutive_failures: 0,
    },
  });
  expect(tasks).toHaveLength(1);
  expect(tasks[0]).toMatchObject({
    title: 'Gated ticket triage',
    latest_run: {
      id: 'trigger-run-gated-1',
      agent_id: 'Athena',
    },
  });

  await page.goto('/work/activity?space=ops');
  await expect(page.getByRole('heading', { name: 'Activity', level: 1 })).toBeVisible();
  await expect(page.getByText('Dispatcher approval requested: Gated ticket dispatcher')).toBeVisible();
  await expect(page.getByText('Dispatcher executed: Gated ticket dispatcher')).toBeVisible();
  await expect(page.getByText('work.ticket.created').first()).toBeVisible();
  await expectNonBlankMain(page, 'Activity after trigger execution');

  await page.goto('/work/live?space=ops');
  await expect(page.getByRole('heading', { name: 'Live', exact: true })).toBeVisible();
  const liveRun = page.getByRole('article', { name: 'Gated ticket triage Loop run' });
  await expect(liveRun).toBeVisible();
  await expect(liveRun).toContainText('Work evidence');
  await expect(liveRun).toContainText('Athena');
  await expect(page.getByRole('article', { name: 'Triage ticket event Loop run' })).toHaveCount(0);
  await expectNonBlankMain(page, 'Live after trigger execution');

  const screenshotPath = testInfo.outputPath('trigger-order-journey.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(requests).toContain('/api/orders?space=ops');
  expect(requests).toContain('/api/orders/order-1/enact?space=ops');
  expect(requests.filter((request) => request === '/api/fixtures/trigger-fire?space=ops')).toHaveLength(1);
  expect(requests).toContain('/api/approvals?space=ops&status=pending&limit=100');
  expect(requests).toContain(`/api/approvals/${approvalId}/decide?space=ops`);
  expect(requests).toContain('/api/orders/gated-ticket-dispatcher?space=ops');
  expect(requests.some((request) => request.startsWith('/api/events?space=ops&limit='))).toBe(true);
  expect(
    requests.some((request) => request.startsWith('/api/instances/nulltickets/tickets/tickets') && request.includes('space=ops')),
  ).toBe(true);
  expect(failedResponses).toEqual([]);
  expect(runtimeErrors.filter((entry) => !entry.includes('Failed to load resource'))).toEqual([]);
});

test('E2E-47 breaker flow opens the circuit and keeps Work surfaces nonblank', async ({ page }, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];
  const events: FixtureRecord[] = [];
  const tasks: FixtureRecord[] = [];
  const orders: FixtureRecord[] = [
    activeTriggerOrder({
      id: 'breaker-trigger-order',
      title: 'Breaker trigger order',
      tier: 'T0',
      eventType: 'work.ticket.failed',
      source: 'nulltickets',
      subjectType: 'ticket',
      target: 'Athena',
    }),
  ];
  const nowMs = Date.now();

  await installNullHubFixtureRoutes(page, {
    requests,
    orders,
    events,
    approvals: [],
    status: runningTriggerStatus,
    instances: runningTriggerStatus.instances,
    nullticketsPipelines: [triggerPipeline],
    nullticketsTasks: tasks,
  });

  await page.goto('/orders?space=ops');
  await expect(page.getByRole('heading', { name: 'Orders', exact: true, level: 1 })).toBeVisible();
  await expectNonBlankMain(page, 'Orders before breaker fires');

  let thirdFailure: FixtureRecord | null = null;
  for (const attempt of [1, 2, 3]) {
    const result = await fireTrigger(page, {
      order_id: 'breaker-trigger-order',
      event_type: 'work.ticket.failed',
      source: 'nulltickets',
      subject_type: 'ticket',
      subject_id: `ticket-breaker-${attempt}`,
      run_ref: `breaker-run-${attempt}`,
      title: `Breaker retry ${attempt}`,
      outcome: 'failure',
      now_ms: nowMs + attempt * 1_000,
    });
    expect(result.status).toBe('failed');
    expect(result.safety.consecutive_failures).toBe(attempt);
    if (attempt === 3) thirdFailure = result;
  }
  expect(thirdFailure).toMatchObject({
    order: { status: 'suspended' },
    safety_event: {
      type: 'dispatcher.circuit_opened',
    },
  });

  const openOrder = await fetchOrder(page, 'breaker-trigger-order');
  expect(openOrder).toMatchObject({
    status: 'suspended',
    safety: {
      status: 'inactive',
      circuit_open: false,
      consecutive_failures: 3,
      failure_threshold: 3,
    },
  });
  expect(openOrder.safety.circuit_opened_event_id).toBeGreaterThan(0);

  const suspended = await fireTrigger(page, {
    order_id: 'breaker-trigger-order',
    event_type: 'work.ticket.failed',
    source: 'nulltickets',
    subject_type: 'ticket',
    subject_id: 'ticket-breaker-4',
    run_ref: 'breaker-run-4',
    title: 'Breaker retry 4',
    now_ms: nowMs + 4_000,
  });
  expect(suspended).toMatchObject({
    fired: false,
    status: 'order_not_active',
    order: {
      status: 'suspended',
    },
    safety: {
      status: 'inactive',
      circuit_open: false,
    },
  });
  expect(tasks).toHaveLength(0);

  await page.goto('/inbox?space=ops');
  await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible();
  const failureCard = page.getByRole('article', { name: 'Failure: Circuit breaker opened: Breaker trigger order' });
  await expect(failureCard).toBeVisible();
  await expect(failureCard).toContainText('Three automatic dispatcher attempts failed.');
  await expect(failureCard).toContainText('Run: order:breaker-trigger-order:circuit:');
  await expect(page.getByTestId('inbox-pending-badge')).toContainText('1');
  await expectNonBlankMain(page, 'Inbox after circuit breaker failure card');

  await page.goto('/orders/breaker-trigger-order?space=ops');
  await expect(page.getByRole('heading', { name: 'Breaker trigger order', level: 2 })).toBeVisible();
  await expect(page.getByLabel('Order facts').getByText('Suspended', { exact: true })).toBeVisible();
  await expect(page.getByText('order.suspended')).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('dialog', { name: 'Resume order' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume order' }).click();
  await expect(page.getByLabel('Order facts').getByText('Active', { exact: true })).toBeVisible();
  await expect(page.getByText('order.resumed')).toBeVisible();

  const resumedOrder = await fetchOrder(page, 'breaker-trigger-order');
  expect(resumedOrder).toMatchObject({
    status: 'active',
    safety: {
      status: 'probation',
      circuit_open: false,
      consecutive_failures: 0,
      safe_executions: 0,
    },
  });

  const recovered = await fireTrigger(page, {
    order_id: 'breaker-trigger-order',
    event_type: 'work.ticket.failed',
    source: 'nulltickets',
    subject_type: 'ticket',
    subject_id: 'ticket-breaker-recovered',
    run_ref: 'breaker-run-recovered',
    title: 'Breaker recovered',
    now_ms: nowMs + 5_000,
  });
  expect(recovered).toMatchObject({
    fired: true,
    status: 'executed',
    order: {
      status: 'active',
      exec_count: 1,
    },
    task: {
      title: 'Breaker recovered',
      latest_run: {
        id: 'breaker-run-recovered',
        agent_id: 'Athena',
      },
    },
    safety: {
      status: 'probation',
      circuit_open: false,
      consecutive_failures: 0,
      safe_executions: 1,
    },
  });
  expect(tasks).toHaveLength(1);

  await page.goto('/work/activity?space=ops');
  await expect(page.getByRole('heading', { name: 'Activity', level: 1 })).toBeVisible();
  await expect(page.getByText('Dispatcher circuit opened: Breaker trigger order')).toBeVisible();
  await expect(page.getByText('Repeated automatic execution failures opened the circuit breaker')).toBeVisible();
  await expect(page.getByText('Order suspended: Breaker trigger order')).toBeVisible();
  await expect(page.getByText('Order resumed: Breaker trigger order')).toBeVisible();
  await expect(page.getByText('Dispatcher executed: Breaker trigger order')).toBeVisible();
  await expectNonBlankMain(page, 'Activity after breaker resume');

  await page.goto('/work/live?space=ops');
  await expect(page.getByRole('heading', { name: 'Live', exact: true })).toBeVisible();
  const recoveredRun = page.getByRole('article', { name: 'Breaker recovered Loop run' });
  await expect(recoveredRun).toBeVisible();
  await expect(recoveredRun).toContainText('Work evidence');
  await expect(recoveredRun).toContainText('Athena');
  await expect(page.getByRole('article', { name: 'Breaker retry 4 Loop run' })).toHaveCount(0);
  await expectNonBlankMain(page, 'Live after breaker resume');

  const screenshotPath = testInfo.outputPath('trigger-breaker-circuit.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(requests.filter((request) => request === '/api/fixtures/trigger-fire?space=ops')).toHaveLength(5);
  expect(requests).toContain('/api/orders/breaker-trigger-order?space=ops');
  expect(requests).toContain('/api/orders/breaker-trigger-order/resume?space=ops');
  expect(requests).toContain('/api/approvals?space=ops&status=pending&limit=100');
  expect(requests.some((request) => request.startsWith('/api/events?space=ops&limit='))).toBe(true);
  expect(failedResponses).toEqual([]);
  expect(runtimeErrors.filter((entry) => !entry.includes('Failed to load resource'))).toEqual([]);
});

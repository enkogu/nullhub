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

test('creates a trigger order from the order editor flow', async ({ page }) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];
  const orders: Record<string, unknown>[] = [];
  await installNullHubFixtureRoutes(page, { requests, orders, events: [] });

  await page.goto('/orders/new?space=ops&type=trigger');
  await expect(page.getByRole('heading', { name: 'New Order' })).toBeVisible();

  await page.getByLabel('Title').fill('Ticket created dispatcher');
  await page.getByLabel('Summary').fill('Create triage work when a ticket appears.');
  await page.getByLabel('Event type').fill('work.ticket.created');
  await page.getByLabel('Source filter').fill('nulltickets');
  await page.getByLabel('Subject type').fill('ticket');
  await page.getByLabel('Agent or instance').fill('triage');
  await page.getByLabel('Instructions').fill('Create a triage ticket for the new event.');
  await page.getByRole('button', { name: 'Save draft' }).click();

  await expect(page).toHaveURL(/\/orders\/order-1\?space=ops$/);
  await expect(page.getByRole('heading', { name: 'Ticket created dispatcher', level: 2 })).toBeVisible();

  expect(orders).toHaveLength(1);
  expect(orders[0]).toMatchObject({
    id: 'order-1',
    space_id: 'ops',
    title: 'Ticket created dispatcher',
    kind: 'trigger',
    goal: '',
    schedule: 'event:work.ticket.created',
  });
  expect(JSON.parse(String(orders[0].content))).toMatchObject({
    trigger: {
      event_type: 'work.ticket.created',
      source: 'nulltickets',
      subject_type: 'ticket',
    },
    action: {
      type: 'run_agent',
      target: 'triage',
      instructions: 'Create a triage ticket for the new event.',
    },
  });
  expect(requests).toContain('/api/orders?space=ops');
  expect(failedResponses).toEqual([]);
  expect(runtimeErrors.filter((entry) => !entry.includes('Failed to load resource'))).toEqual([]);
});

test('edits a mandate order and blocks active mandate save without a goal', async ({ page }) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];
  const orders: Record<string, unknown>[] = [
    {
      id: 'mandate-1',
      space_id: 'ops',
      title: 'Subscriber mandate',
      summary: 'Keep subscriber outreach current.',
      kind: 'mandate',
      goal: 'subscribers-25',
      status: 'active',
      schedule: '',
      doc_path: 'orders/mandate-1.md',
      content: JSON.stringify({
        goal: 'subscribers-25',
        condition: { event_type: 'subscribers.goal_met' },
        check_cadence_ms: 60000,
        tier: 'T1',
        action: { type: 'run_agent', target: 'growth-agent' },
      }),
      created_at_ms: 1_779_000_000_000,
      updated_at_ms: 1_780_000_000_000,
    },
  ];
  await installNullHubFixtureRoutes(page, { requests, orders, events: [] });

  await page.goto('/orders/mandate-1/edit?space=ops');
  await expect(page.getByRole('heading', { name: 'Edit Subscriber mandate' })).toBeVisible();
  await expect(page.getByLabel('Goal')).toHaveValue('subscribers-25');
  const detailRequestCountBeforeInvalidSave = requests.filter((request) => request === '/api/orders/mandate-1?space=ops').length;

  await page.getByLabel('Goal').fill('');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Goal is required for a mandate order.')).toBeVisible();
  expect(requests.filter((request) => request === '/api/orders/mandate-1?space=ops')).toHaveLength(
    detailRequestCountBeforeInvalidSave,
  );
  expect(orders[0].goal).toBe('subscribers-25');

  await page.getByLabel('Goal').fill('subscribers-50');
  await page.getByLabel('Unmet event type').fill('subscribers.goal_unmet');
  await page.getByLabel('Check cadence ms').fill('120000');
  await page.getByLabel('Agent or instance').fill('growth-agent-v2');
  await page.getByRole('button', { name: 'Save draft' }).click();

  await expect(page).toHaveURL(/\/orders\/mandate-1\?space=ops$/);
  await expect(page.getByRole('heading', { name: 'Subscriber mandate', level: 2 })).toBeVisible();
  expect(orders[0]).toMatchObject({
    kind: 'mandate',
    goal: 'subscribers-50',
  });
  expect(JSON.parse(String(orders[0].content))).toMatchObject({
    goal: 'subscribers-50',
    condition: {
      event_type: 'subscribers.goal_met',
      unmet_event_type: 'subscribers.goal_unmet',
    },
    check_cadence_ms: 120000,
    action: {
      type: 'run_agent',
      target: 'growth-agent-v2',
    },
  });
  expect(requests).toContain('/api/orders/mandate-1?space=ops');
  expect(failedResponses).toEqual([]);
  expect(runtimeErrors.filter((entry) => !entry.includes('Failed to load resource'))).toEqual([]);
});

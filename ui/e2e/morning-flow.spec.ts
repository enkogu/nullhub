import { expect, test, type Page } from '@playwright/test';
import { installNullHubFixtureRoutes } from './fixtures/nullhub';

const SELECTED_SPACE_STORAGE_KEY = 'nullhub:selected-space';
const ALL_SPACES_STORAGE_VALUE = '__all__';

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

async function expectNonBlankShell(page: Page, label: string) {
  await expect(page.locator('.shadcn-app')).toBeVisible();
  await expect(page.locator('main.real-content')).toBeVisible();

  const content = (await page.locator('main.real-content').innerText()).trim();
  expect(content.length, `${label} should render nonblank content`).toBeGreaterThan(24);
}

async function expectDigestMetric(page: Page, label: string, value: string) {
  const metric = page.locator('[data-slot="digest-metric"]').filter({ hasText: label });
  await expect(metric).toBeVisible();
  await expect(metric).toContainText(value);
}

function morningEvents(nowMs: number) {
  return [
    {
      id: 601,
      space_id: 'ops',
      type: 'task.completed',
      source: 'nulltickets',
      subject_type: 'task',
      subject_id: 'support-inbox-sweep',
      title: 'Support inbox sweep closed',
      summary: 'Athena closed the overnight support sweep.',
      severity: 'success',
      evidence_ref: 'artifact://support-inbox-sweep',
      created_at_ms: nowMs - 40 * 60_000,
      payload: { status: 'completed', agent: 'Athena' },
    },
    {
      id: 602,
      space_id: 'ops',
      type: 'result.review_requested',
      source: 'nulltickets',
      subject_type: 'deliverable',
      subject_id: 'producer-summary',
      title: 'Producer summary ready',
      summary: 'The morning producer summary is ready for sign-off.',
      severity: 'info',
      evidence_ref: 'artifact://producer-summary',
      created_at_ms: nowMs - 35 * 60_000,
      payload: { status: 'needs_review', agent: 'Athena' },
    },
    {
      id: 603,
      space_id: 'ops',
      type: 'order.completed',
      source: 'nullboiler',
      subject_type: 'order',
      subject_id: 'morning-digest-order',
      title: 'Morning digest order executed',
      summary: 'The daily digest order finished.',
      severity: 'success',
      evidence_ref: 'artifact://morning-digest-order',
      created_at_ms: nowMs - 30 * 60_000,
      payload: { status: 'completed', agent: 'Iris' },
    },
  ];
}

function producerEvents(nowMs: number) {
  return [
    {
      id: 701,
      space_id: 'ops',
      type: 'task.completed',
      source: 'nulltickets',
      subject_type: 'task',
      subject_id: 'ops-cleanup',
      title: 'Ops cleanup closed',
      summary: 'Operations has no pending producer review.',
      severity: 'success',
      evidence_ref: 'artifact://ops-cleanup',
      created_at_ms: nowMs - 50 * 60_000,
      payload: { status: 'completed', agent: 'Athena' },
    },
    {
      id: 702,
      space_id: 'lab',
      type: 'result.review_requested',
      source: 'dispatcher',
      subject_type: 'deliverable',
      subject_id: 'creator-launch-brief',
      title: 'Creator launch brief ready',
      summary: 'The Lab launch brief needs producer attention.',
      severity: 'info',
      evidence_ref: 'artifact://creator-launch-brief',
      created_at_ms: nowMs - 20 * 60_000,
      payload: { status: 'needs_review', agent: 'Iris' },
    },
    {
      id: 703,
      space_id: 'lab',
      type: 'agent.blocked',
      source: 'dispatcher',
      subject_type: 'task',
      subject_id: 'creator-handoff',
      title: 'Creator handoff blocked',
      summary: 'The launch handoff is waiting on producer budget approval.',
      severity: 'warning',
      evidence_ref: 'artifact://creator-handoff',
      created_at_ms: nowMs - 10 * 60_000,
      payload: { status: 'blocked', agent: 'Iris' },
    },
  ];
}

test('E2E-1 morning digest leads to inbox decision and quiet work state', async ({ page }, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];
  const nowMs = Date.now();

  await installNullHubFixtureRoutes(page, {
    requests,
    approvals: [
      {
        id: 601,
        space_id: 'ops',
        kind: 'signature',
        queue: 'daily-review',
        target_ref: 'order:morning-digest',
        title: 'Approve morning support summary',
        summary: 'Athena prepared the overnight support summary for producer sign-off.',
        status: 'pending',
        feedback: '',
        created_at_ms: nowMs - 25 * 60_000,
        decided_at_ms: 0,
      },
    ],
    events: morningEvents(nowMs),
    usage: {
      totals: { total_cost_usd: 0.42 },
      by_instance: [],
      by_model: [],
      timeseries: [
        {
          bucket_start: nowMs - 45 * 60_000,
          total_cost_usd: 0.42,
        },
      ],
    },
  });

  await page.goto('/');
  await expect(page).toHaveURL(/\/(?:\?space=ops)?$/);
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'While you were away' })).toBeVisible();
  await expectDigestMetric(page, 'Tasks closed', '1');
  await expectDigestMetric(page, 'Results awaiting review', '1');
  await expectDigestMetric(page, 'Orders executed', '1');
  await expect(page.getByRole('region', { name: 'Needs you' }).getByText('Approve morning support summary')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Running now' }).getByText('Nothing is running')).toBeVisible();
  await expectNonBlankShell(page, 'Home digest');

  const digestScreenshot = testInfo.outputPath('morning-flow-home-digest.png');
  await page.screenshot({ path: digestScreenshot, fullPage: true });
  console.log(`screenshot: ${digestScreenshot}`);

  await page.getByRole('link', { name: 'Open inbox' }).click();
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Signature request: Approve morning support summary' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^All/ })).toContainText('1');

  const decideRequest = page.waitForRequest(
    (request) => request.url().includes('/approvals/601/decide') && request.method() === 'POST',
    { timeout: 15_000 },
  );
  await page.getByRole('button', { name: 'Sign', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();

  const request = await decideRequest;
  expect(request.postDataJSON()).toMatchObject({ decision: 'approved' });
  await expect(page.getByRole('button', { name: /^All/ })).toContainText('0');
  await expect(page.getByText('No pending requests')).toBeVisible();
  await expect(page.getByTestId('inbox-pending-badge')).toHaveCount(0);

  await page.getByLabel('Primary navigation').getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('region', { name: 'Needs you' }).getByText('Nothing needs you')).toBeVisible();
  await expectNonBlankShell(page, 'Home after decision');

  await page.getByLabel('Primary navigation').getByRole('link', { name: 'Work' }).click();
  await expect(page).toHaveURL(/\/work$/);
  await expect(page.getByRole('navigation', { name: 'Work tabs' }).getByRole('link', { name: 'Live' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Work tabs' }).getByRole('link', { name: 'Live' }).click();
  await expect(page).toHaveURL(/\/work\/live$/);
  await expect(page.getByRole('heading', { name: 'Live', exact: true })).toBeVisible();
  await expect(page.getByText('No live runs')).toBeVisible();
  await expectNonBlankShell(page, 'Work quiet state');

  const quietScreenshot = testInfo.outputPath('morning-flow-quiet.png');
  await page.screenshot({ path: quietScreenshot, fullPage: true });
  console.log(`screenshot: ${quietScreenshot}`);

  expect(requests).toContain('/api/approvals?space=ops&status=pending&limit=25');
  expect(requests).toContain('/api/events?space=ops&limit=100');
  expect(requests).toContain('/api/usage?window=7d');
  expect(requests.some((entry) => entry.startsWith('/api/instances?space=ops'))).toBe(true);
  expect(failedResponses).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

test('E2E-9 All spaces drill-in opens the attention Space in fixture mode', async ({ page }, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];
  const nowMs = Date.now();

  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: SELECTED_SPACE_STORAGE_KEY, value: ALL_SPACES_STORAGE_VALUE },
  );
  await installNullHubFixtureRoutes(page, {
    requests,
    approvals: [
      {
        id: 701,
        space_id: 'lab',
        kind: 'signature',
        queue: 'producer',
        target_ref: 'order:creator-launch',
        title: 'Review creator launch budget',
        summary: 'The Lab launch needs a producer budget decision before the next handoff.',
        status: 'pending',
        feedback: '',
        created_at_ms: nowMs - 15 * 60_000,
        decided_at_ms: 0,
      },
    ],
    events: producerEvents(nowMs),
    usageBySpace: {
      ops: {
        totals: { total_cost_usd: 3.1 },
        by_instance: [],
        by_model: [],
        timeseries: [],
      },
      lab: {
        totals: { total_cost_usd: 18.2 },
        by_instance: [],
        by_model: [],
        timeseries: [],
      },
    },
    usage: {
      totals: { total_cost_usd: 21.3 },
      by_instance: [],
      by_model: [],
      timeseries: [],
    },
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.getByRole('button', { name: /All spaces\s+2 spaces/ })).toBeVisible();
  await expectNonBlankShell(page, 'All spaces Home');

  await page.getByRole('button', { name: /All spaces\s+2 spaces/ }).click();
  await expect(page.getByRole('menuitem', { name: /Operations active 0 pending 0 live \$3\.10 spend/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Lab paused 1 pending 1 live \$18\.20 spend/ })).toBeVisible();
  await page.getByRole('menuitem', { name: /Lab paused 1 pending 1 live \$18\.20 spend/ }).click();

  await expect(page).toHaveURL(/(?:\?|&)space=lab(?:&|$)/);
  await expect(page.getByRole('button', { name: /Lab 1 pending/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'While you were away' })).toBeVisible();
  await expectDigestMetric(page, 'Results awaiting review', '1');
  await expect(page.getByRole('region', { name: 'Needs you' }).getByText('Review creator launch budget')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Creator handoff blocked Agent task' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Creator handoff blocked Agent task' }).getByText('Agent work')).toBeVisible();
  await expectNonBlankShell(page, 'Lab attention Home');

  const screenshotPath = testInfo.outputPath('producer-all-spaces-drill-in.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(requests).toContain('/api/approvals?space=lab&status=pending&limit=100');
  expect(requests).toContain('/api/events?space=lab&limit=100');
  expect(requests).toContain('/api/usage?space=lab&window=7d');
  expect(failedResponses).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

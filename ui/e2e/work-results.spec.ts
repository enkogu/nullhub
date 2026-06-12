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

const nowMs = 1_780_000_000_000;

const fixtureSetup = {
  instances: {
    nulltickets: {
      tickets: { status: 'running', port: 19001, space_id: 'ops' },
    },
    nullclaw: {
      Athena: { status: 'running', space_id: 'ops' },
    },
  },
  nullticketsPipelines: [
    {
      id: 'support-triage',
      name: 'Support Triage',
      definition: {},
      space_id: 'ops',
    },
  ],
  nullticketsTasks: [
    {
      id: 'task-review-1',
      pipeline_id: 'support-triage',
      stage: 'review',
      title: 'Q2 onboarding playbook',
      description: 'Draft playbook awaiting reviewer sign-off.',
      created_at_ms: nowMs - 60 * 60_000,
      updated_at_ms: nowMs - 12 * 60_000,
      space_id: 'ops',
    },
    {
      id: 'task-lab-1',
      pipeline_id: 'support-triage',
      stage: 'review',
      title: 'Lab-only deliverable',
      description: 'This belongs to the Lab space.',
      created_at_ms: nowMs - 60 * 60_000,
      updated_at_ms: nowMs - 12 * 60_000,
      space_id: 'lab',
    },
  ],
  nullticketsArtifacts: [
    {
      id: 'artifact-app-1',
      task_id: 'task-review-1',
      run_id: 'loop-run-7',
      created_at_ms: nowMs - 5 * 60_000,
      kind: 'app',
      uri: '',
      meta: {
        title: 'Support Portal',
        summary: 'The support portal app produced by the loop.',
        lifecycle: 'delivered',
        app: { component: 'nullclaw', name: 'Athena' },
      },
      space_id: 'ops',
    },
    {
      id: 'artifact-doc-1',
      task_id: 'task-review-1',
      run_id: 'loop-run-7',
      created_at_ms: nowMs - 8 * 60_000,
      kind: 'document',
      uri: 'https://example.com/report',
      meta: {
        title: 'Triage report',
        summary: 'Summary of the latest triage run.',
        lifecycle: 'approved',
      },
      space_id: 'ops',
    },
  ],
};

test('renders /work/results from ticket deliverables and artifacts', async ({ page }, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];
  await installNullHubFixtureRoutes(page, { requests, ...fixtureSetup });

  await page.goto('/work/results?space=ops');

  await expect(page.getByRole('heading', { name: 'Results', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('article', { name: 'Q2 onboarding playbook Ticket deliverable' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Support Portal Run artifact' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Triage report Run artifact' })).toBeVisible();
  await expect(page.getByText('Lab-only deliverable')).toHaveCount(0);

  const deliverableCard = page.getByRole('article', { name: 'Q2 onboarding playbook Ticket deliverable' });
  await expect(deliverableCard.getByText('In review', { exact: true })).toBeVisible();
  const appCard = page.getByRole('article', { name: 'Support Portal Run artifact' });
  await expect(appCard.getByText('Delivered', { exact: true })).toBeVisible();
  await expect(appCard.getByRole('link', { name: 'Open app Support Portal' })).toHaveAttribute(
    'href',
    '/instances/nullclaw/Athena?space=ops',
  );

  await page.getByRole('combobox', { name: 'lifecycle' }).selectOption('delivered');
  await expect(page.getByRole('heading', { name: 'Support Portal' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Q2 onboarding playbook' })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'lifecycle' }).selectOption('');

  await page.getByRole('combobox', { name: 'source' }).selectOption('deliverable');
  await expect(page.getByRole('heading', { name: 'Q2 onboarding playbook' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Support Portal' })).toHaveCount(0);

  const screenshotPath = testInfo.outputPath('work-results.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(requests.some((request) => request === '/api/instances?space=ops')).toBe(true);
  expect(
    requests.filter((request) => request.startsWith('/api/instances/nulltickets/tickets/tickets') && request.includes('space=ops')).length,
  ).toBeGreaterThanOrEqual(2);
  expect(failedResponses).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

test('renders /work/results error state when NullTickets reads fail', async ({ page }) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  await installNullHubFixtureRoutes(page, { ...fixtureSetup, nullticketsStatus: 503 });

  await page.goto('/work/results?space=ops');

  await expect(page.getByRole('heading', { name: 'Results', exact: true }).first()).toBeVisible();
  await expect(page.getByText('Results unavailable')).toBeVisible();
  expect(failedResponses.some((entry) => entry.startsWith('503 '))).toBe(true);
  expect(runtimeErrors.filter((entry) => !entry.includes('Failed to load resource'))).toEqual([]);
});

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

// ncm-7upb: delegate -> live -> detail -> result, the core daily Work journey.
test('delegates a task via the command palette and follows it through Live, run detail, and Results', async ({ page }, testInfo) => {
  const { runtimeErrors, failedResponses } = collectRuntimeFailures(page);
  const requests: string[] = [];
  const nullticketsActions: string[] = [];

  await installNullHubFixtureRoutes(page, {
    requests,
    nullticketsActions,
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
    nullclawHistorySessions: [{ session_id: 'webhook:local-nullboiler-worker' }],
    nullclawHistoryMessages: {
      'webhook:local-nullboiler-worker': [
        {
          role: 'user',
          content: 'Run the onboarding digest loop until the digest is shipped.',
          created_at: '2026-06-12T08:00:00Z',
        },
        {
          role: 'assistant',
          content: 'The onboarding digest has been compiled and shipped.',
          created_at: '2026-06-12T08:02:00Z',
        },
      ],
    },
  });

  // Step 1: delegate a task through the Cmd-K command palette quick-add.
  await page.goto('/work?space=ops');
  await expect(page.getByRole('navigation', { name: 'Work tabs' }).getByRole('link', { name: 'Live' })).toBeVisible();
  await page.keyboard.press('Control+K');
  await expect(page.getByRole('dialog', { name: 'Command Palette' })).toBeVisible();
  await page.getByRole('option', { name: /New task/ }).click();
  await page.getByLabel('Loop ID').fill('support-triage');
  await page.getByLabel('Title').fill('Ship onboarding digest');
  await page.getByLabel('Description').fill('Summarize this week’s onboarding signals for the ops space.');
  await page.getByRole('button', { name: 'Create task' }).click();
  await expect(page.getByRole('status').getByText('Task created.')).toBeVisible();
  const step1Screenshot = testInfo.outputPath('delegate-flow-1-create-task.png');
  await page.screenshot({ path: step1Screenshot, fullPage: true });
  console.log(`screenshot: ${step1Screenshot}`);
  expect(nullticketsActions).toContain('POST /tasks');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Command Palette' })).toHaveCount(0);

  // Step 2: the delegated task surfaces in the Work Live tab as a loop run.
  await page.getByRole('navigation', { name: 'Work tabs' }).getByRole('link', { name: 'Live' }).click();
  await expect(page).toHaveURL(/\/work\/live(?:\?|$)/);
  await expect(page.getByRole('heading', { name: 'Live', exact: true })).toBeVisible();
  const liveCard = page.getByRole('article', { name: 'Ship onboarding digest Loop run' });
  await expect(liveCard).toBeVisible();
  await expect(liveCard.getByText('Ship onboarding digest')).toBeVisible();
  const openRunLink = page.getByRole('link', { name: 'Open Ship onboarding digest' });
  await expect(openRunLink).toHaveAttribute(
    'href',
    '/work/runs/loop-run-created-1?task_id=task-created-1&tickets_instance=tickets&space=ops',
  );
  const step2Screenshot = testInfo.outputPath('delegate-flow-2-live.png');
  await page.screenshot({ path: step2Screenshot, fullPage: true });
  console.log(`screenshot: ${step2Screenshot}`);

  // Step 3: opening the run lands on the run detail page with run evidence.
  await openRunLink.click();
  await expect(page).toHaveURL(/\/work\/runs\/loop-run-created-1\?/);
  await expect(page.getByRole('heading', { name: 'Run Detail' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ship onboarding digest' })).toBeVisible();
  await expect(page.getByText('artifact://loop-run-created-1/result.md · 1 KB')).toBeVisible();
  expect(nullticketsActions).toContain('GET /tasks/task-created-1');
  expect(nullticketsActions).toContain('GET /runs/loop-run-created-1/events?limit=100');
  const step3Screenshot = testInfo.outputPath('delegate-flow-3-run-detail.png');
  await page.screenshot({ path: step3Screenshot, fullPage: true });
  console.log(`screenshot: ${step3Screenshot}`);

  // Step 4: the delivered result for the run shows up in the Results tab.
  await page.getByRole('navigation', { name: 'Work tabs' }).getByRole('link', { name: 'Results' }).click();
  await expect(page).toHaveURL(/\/work\/results(?:\?|$)/);
  await expect(page.getByRole('heading', { name: 'Results', exact: true }).first()).toBeVisible();
  const resultCard = page.getByRole('article', { name: 'Ship onboarding digest result Run artifact' });
  await expect(resultCard).toBeVisible();
  await expect(resultCard.getByText('Delivered', { exact: true })).toBeVisible();
  await expect(resultCard.getByText('Result delivered by the fixture loop.')).toBeVisible();
  const step4Screenshot = testInfo.outputPath('delegate-flow-4-results.png');
  await page.screenshot({ path: step4Screenshot, fullPage: true });
  console.log(`screenshot: ${step4Screenshot}`);

  expect(failedResponses).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

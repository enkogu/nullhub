import { expect, test, type Page } from '@playwright/test';
import { installNullHubFixtureRoutes } from '../fixtures/nullhub';

function collectRuntimeFailures(page: Page) {
  const runtimeErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  page.on('pageerror', (error) => {
    runtimeErrors.push(error.message);
  });

  return { runtimeErrors };
}

test('approve removes the card and decrements the pending count', async ({ page }, testInfo) => {
  const { runtimeErrors } = collectRuntimeFailures(page);
  const requests: string[] = [];
  await installNullHubFixtureRoutes(page, { requests });

  await page.goto('/inbox');

  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();
  await expect(page.getByText('Sign the v2 deploy plan')).toBeVisible();
  await expect(page.getByText('Which tone should the newsletter use?')).toBeVisible();
  await expect(page.getByText('Nightly digest run failed')).toBeVisible();
  await expect(page.getByRole('button', { name: /^All/ })).toContainText('3');
  await expect(page.getByTestId('inbox-pending-badge')).toHaveText('3');

  const decideRequest = page.waitForRequest(
    (request) => request.url().includes('/approvals/1/decide') && request.method() === 'POST',
    { timeout: 15_000 },
  );
  await page.getByRole('button', { name: 'Sign', exact: true }).click();

  // Optimistic removal: the signature card leaves the pending list immediately.
  await expect(page.locator('[data-slot="approval-card"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();

  const request = await decideRequest;
  expect(request.postDataJSON()).toMatchObject({ decision: 'approved' });

  await expect(page.getByRole('button', { name: /^All/ })).toContainText('2');
  await expect(page.getByTestId('inbox-pending-badge')).toHaveText('2');

  const screenshotPath = testInfo.outputPath('inbox-approve.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(requests.some((entry) => entry.startsWith('/api/approvals?space=ops'))).toBe(true);
  expect(requests.filter((entry) => entry === '/api/approvals?space=ops&status=pending&limit=100').length).toBeGreaterThanOrEqual(2);
  expect(runtimeErrors).toEqual([]);
});

test('push_back requires feedback before re-running the target', async ({ page }, testInfo) => {
  const { runtimeErrors } = collectRuntimeFailures(page);
  await installNullHubFixtureRoutes(page);

  await page.goto('/inbox');
  await expect(page.getByText('Sign the v2 deploy plan')).toBeVisible();

  await page.getByRole('button', { name: 'Return', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Return for rework' })).toBeVisible();

  // Submission stays blocked until the feedback reaches 10 characters.
  const submit = page.getByRole('button', { name: 'Return work' });
  await expect(submit).toBeDisabled();
  await page.getByRole('dialog').getByRole('textbox').fill('too short');
  await expect(submit).toBeDisabled();

  const decideRequest = page.waitForRequest(
    (request) => request.url().includes('/approvals/1/decide') && request.method() === 'POST',
    { timeout: 15_000 },
  );
  await page.getByRole('dialog').getByRole('textbox').fill('Needs a rollback plan before signing.');
  await submit.click();

  const request = await decideRequest;
  expect(request.postDataJSON()).toMatchObject({
    decision: 'pushed_back',
    feedback: 'Needs a rollback plan before signing.',
  });

  // The returned item moves into history with its feedback.
  await page.getByRole('switch').click();
  await expect(page.getByText('Needs a rollback plan before signing.')).toBeVisible();

  const screenshotPath = testInfo.outputPath('inbox-push-back.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(runtimeErrors).toEqual([]);
});

test('question reply posts the answer to the waiting run', async ({ page }, testInfo) => {
  const { runtimeErrors } = collectRuntimeFailures(page);
  await installNullHubFixtureRoutes(page);

  await page.goto('/inbox');
  const questionCard = page.locator('[data-slot="question-card"]');
  await expect(questionCard).toBeVisible();
  await expect(questionCard.getByText('Waiting run: run:run-7')).toBeVisible();

  const decideRequest = page.waitForRequest(
    (request) => request.url().includes('/approvals/2/decide') && request.method() === 'POST',
    { timeout: 15_000 },
  );
  await questionCard.getByRole('textbox').fill('Use a friendly, direct tone.');
  await questionCard.getByRole('button', { name: 'Send reply' }).click();

  const request = await decideRequest;
  expect(request.postDataJSON()).toMatchObject({
    decision: 'approved',
    feedback: 'Use a friendly, direct tone.',
  });

  await expect(page.locator('[data-slot="question-card"]')).toHaveCount(0);

  const screenshotPath = testInfo.outputPath('inbox-question-reply.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);

  expect(runtimeErrors).toEqual([]);
});

test('renders the error state instead of a blank screen when approvals fail', async ({ page }) => {
  await installNullHubFixtureRoutes(page, { approvalsStatus: 503 });

  await page.goto('/inbox');

  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();
  await expect(page.getByText('Inbox unavailable')).toBeVisible();
  await expect(page.getByText('Approvals unavailable.')).toBeVisible();
  expect((await page.locator('body').innerText()).trim().length).toBeGreaterThan(0);
});

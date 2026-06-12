import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import FailureCard from './FailureCard.svelte';
import { failureApproval, inboxFixtureNowMs } from './fixtures';

test('fires restart, suspend, and open-run callbacks', async () => {
  const onRestart = vi.fn();
  const onSuspend = vi.fn();
  const onOpenRun = vi.fn();
  const screen = await render(FailureCard, {
    props: { approval: failureApproval, nowMs: inboxFixtureNowMs, onRestart, onSuspend, onOpenRun },
  });

  await expect.element(screen.getByText('Nightly digest run failed')).toBeVisible();
  await screen.getByRole('button', { name: 'Restart' }).click();
  await screen.getByRole('button', { name: 'Suspend' }).click();
  await screen.getByRole('button', { name: 'Open run' }).click();
  expect(onRestart).toHaveBeenCalledTimes(1);
  expect(onSuspend).toHaveBeenCalledTimes(1);
  expect(onOpenRun).toHaveBeenCalledTimes(1);
});

test('conflict shows decided-elsewhere without lifecycle actions', async () => {
  const screen = await render(FailureCard, {
    props: { approval: failureApproval, conflict: true, nowMs: inboxFixtureNowMs },
  });

  await expect.element(screen.getByText(/Decided elsewhere/)).toBeVisible();
  expect(screen.container.textContent).not.toContain('Restart');
});

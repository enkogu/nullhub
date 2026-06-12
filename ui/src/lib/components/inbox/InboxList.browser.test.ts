import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import InboxList from './InboxList.svelte';
import { inboxFixtureApprovals, inboxFixtureNowMs, signatureApproval } from './fixtures';

const nowMs = inboxFixtureNowMs;

test('renders loading, empty, error, and populated states', async () => {
  const loading = await render(InboxList, { props: { approvals: [], listState: 'loading', nowMs } });
  await expect.element(loading.getByText('Loading inbox')).toBeVisible();

  const empty = await render(InboxList, { props: { approvals: [], listState: 'ready', nowMs } });
  await expect.element(empty.getByText('No pending requests')).toBeVisible();

  const error = await render(InboxList, {
    props: { approvals: [], listState: 'error', error: new Error('Approvals failed.'), nowMs },
  });
  await expect.element(error.getByText('Inbox unavailable')).toBeVisible();
  await expect.element(error.getByText('Approvals failed.')).toBeVisible();

  const populated = await render(InboxList, {
    props: { approvals: inboxFixtureApprovals, listState: 'ready', nowMs },
  });
  await expect.element(populated.getByText('Sign the v2 deploy plan')).toBeVisible();
  await expect.element(populated.getByText('Which tone should the newsletter use?')).toBeVisible();
  await expect.element(populated.getByText('Nightly digest run failed')).toBeVisible();
});

test('queue tabs filter pending items and show counts', async () => {
  const screen = await render(InboxList, {
    props: { approvals: inboxFixtureApprovals, listState: 'ready', nowMs },
  });

  await expect.element(screen.getByRole('button', { name: /^All/ })).toBeVisible();
  await screen.getByRole('button', { name: /^deploys/ }).click();
  await expect.element(screen.getByText('Sign the v2 deploy plan')).toBeVisible();
  expect(screen.container.textContent).not.toContain('Which tone should the newsletter use?');

  await screen.getByRole('button', { name: /^intake/ }).click();
  await expect.element(screen.getByText('Which tone should the newsletter use?')).toBeVisible();
  expect(screen.container.textContent).not.toContain('Sign the v2 deploy plan');
});

test('history toggle shows decided items', async () => {
  const screen = await render(InboxList, {
    props: { approvals: inboxFixtureApprovals, listState: 'ready', nowMs },
  });

  expect(screen.container.textContent).not.toContain('Sign the v1 deploy plan');
  await screen.getByRole('switch').click();
  await expect.element(screen.getByText('Sign the v1 deploy plan')).toBeVisible();
  await expect.element(screen.getByText('Needs a rollback plan before signing.')).toBeVisible();
  expect(screen.container.textContent).not.toContain('Sign the v2 deploy plan');
});

test('optimistic decide commits after the undo window', async () => {
  const onDecide = vi.fn().mockResolvedValue(undefined);
  const screen = await render(InboxList, {
    props: {
      approvals: [signatureApproval],
      listState: 'ready',
      nowMs,
      undoWindowMs: 20,
      onDecide,
    },
  });

  await screen.getByRole('button', { name: 'Sign' }).click();
  // The card leaves the pending list immediately (optimistic decide).
  expect(screen.container.querySelector('[data-slot="approval-card"]')).toBeNull();

  await vi.waitFor(() => expect(onDecide).toHaveBeenCalledTimes(1));
  expect(onDecide.mock.calls[0][0]).toMatchObject({ id: 1 });
  expect(onDecide.mock.calls[0][1]).toEqual({ decision: 'approved' });
});

test('undo cancels the optimistic decide before commit', async () => {
  const onDecide = vi.fn().mockResolvedValue(undefined);
  const screen = await render(InboxList, {
    props: {
      approvals: [signatureApproval],
      listState: 'ready',
      nowMs,
      undoWindowMs: 60_000,
      onDecide,
    },
  });

  await screen.getByRole('button', { name: 'Reject' }).click();
  // The card leaves the pending list and the undo toast appears.
  expect(screen.container.querySelector('[data-slot="approval-card"]')).toBeNull();
  await expect.element(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
  await screen.getByRole('button', { name: 'Undo' }).click();

  await expect.element(screen.getByText('Sign the v2 deploy plan')).toBeVisible();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(onDecide).not.toHaveBeenCalled();
});

test('return requires dialog feedback of at least 10 characters then decides pushed_back', async () => {
  const onDecide = vi.fn().mockResolvedValue(undefined);
  const screen = await render(InboxList, {
    props: {
      approvals: [signatureApproval],
      listState: 'ready',
      nowMs,
      undoWindowMs: 20,
      onDecide,
    },
  });

  await screen.getByRole('button', { name: 'Return' }).click();
  await expect.element(screen.getByRole('dialog', { name: 'Return for rework' })).toBeVisible();

  const submit = screen.getByRole('button', { name: 'Return work' });
  await expect.element(submit).toBeDisabled();

  await screen.getByRole('textbox').fill('too short');
  await expect.element(submit).toBeDisabled();

  await screen.getByRole('textbox').fill('Needs a rollback plan first.');
  await submit.click();

  await vi.waitFor(() => expect(onDecide).toHaveBeenCalledTimes(1));
  expect(onDecide.mock.calls[0][1]).toEqual({
    decision: 'pushed_back',
    feedback: 'Needs a rollback plan first.',
  });
});

test('a 409 decide failure shows the decided-elsewhere conflict state', async () => {
  const conflictError = Object.assign(new Error('approval already decided'), { status: 409 });
  const onDecide = vi.fn().mockRejectedValue(conflictError);
  const onRetry = vi.fn();
  const screen = await render(InboxList, {
    props: {
      approvals: [signatureApproval],
      listState: 'ready',
      nowMs,
      undoWindowMs: 10,
      onDecide,
      onRetry,
    },
  });

  await screen.getByRole('button', { name: 'Sign' }).click();
  await vi.waitFor(() => expect(onDecide).toHaveBeenCalledTimes(1));

  await expect.element(screen.getByText(/Decided elsewhere/)).toBeVisible();
  await screen.getByRole('button', { name: 'Refresh' }).click();
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test('question reply decides approved with the reply as feedback', async () => {
  const onDecide = vi.fn().mockResolvedValue(undefined);
  const screen = await render(InboxList, {
    props: {
      approvals: [inboxFixtureApprovals[1]],
      listState: 'ready',
      nowMs,
      undoWindowMs: 10,
      onDecide,
    },
  });

  await screen.getByRole('textbox').fill('Friendly and direct.');
  await screen.getByRole('button', { name: 'Send reply' }).click();

  await vi.waitFor(() => expect(onDecide).toHaveBeenCalledTimes(1));
  expect(onDecide.mock.calls[0][1]).toEqual({ decision: 'approved', feedback: 'Friendly and direct.' });
});

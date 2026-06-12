import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ApprovalCard from './ApprovalCard.svelte';
import { decidedApproval, diffSignatureApproval, inboxFixtureNowMs, signatureApproval } from './fixtures';

test('renders markdown preview and fires sign, return, and reject callbacks', async () => {
  const onSign = vi.fn();
  const onReturn = vi.fn();
  const onReject = vi.fn();
  const screen = await render(ApprovalCard, {
    props: { approval: signatureApproval, nowMs: inboxFixtureNowMs, onSign, onReturn, onReject },
  });

  await expect.element(screen.getByText('Sign the v2 deploy plan')).toBeVisible();
  await expect.element(screen.getByRole('heading', { name: 'Deploy plan', exact: true })).toBeVisible();

  await screen.getByRole('button', { name: 'Sign' }).click();
  await screen.getByRole('button', { name: 'Return' }).click();
  await screen.getByRole('button', { name: 'Reject' }).click();
  expect(onSign).toHaveBeenCalledTimes(1);
  expect(onReturn).toHaveBeenCalledTimes(1);
  expect(onReject).toHaveBeenCalledTimes(1);
});

test('renders a diff preview for unified-diff summaries', async () => {
  const screen = await render(ApprovalCard, {
    props: { approval: diffSignatureApproval, nowMs: inboxFixtureNowMs },
  });

  await expect.element(screen.getByText('config.json')).toBeVisible();
  expect(screen.container.textContent).toContain('"retries": 3');
});

test('busy disables actions and conflict shows decided-elsewhere', async () => {
  const busy = await render(ApprovalCard, {
    props: { approval: signatureApproval, busy: true, nowMs: inboxFixtureNowMs },
  });
  await expect.element(busy.getByRole('button', { name: 'Sign' })).toBeDisabled();

  const onRefresh = vi.fn();
  const conflict = await render(ApprovalCard, {
    props: { approval: signatureApproval, conflict: true, nowMs: inboxFixtureNowMs, onRefresh },
  });
  await expect.element(conflict.getByText(/Decided elsewhere/)).toBeVisible();
  expect(conflict.container.textContent).not.toContain('Reject');
  await conflict.getByRole('button', { name: 'Refresh' }).click();
  expect(onRefresh).toHaveBeenCalledTimes(1);
});

test('decided approvals show their status and feedback without actions', async () => {
  const screen = await render(ApprovalCard, {
    props: { approval: decidedApproval, nowMs: inboxFixtureNowMs },
  });

  await expect.element(screen.getByText('Returned')).toBeVisible();
  await expect.element(screen.getByText(/Needs a rollback plan before signing\./)).toBeVisible();
  expect(screen.container.textContent).not.toContain('Sign the v2');
  expect(screen.container.querySelector('button')).toBeNull();
});

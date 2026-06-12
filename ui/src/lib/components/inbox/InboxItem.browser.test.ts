import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import InboxItem from './InboxItem.svelte';
import { failureApproval, inboxFixtureNowMs, questionApproval, signatureApproval } from './fixtures';

test('dispatches each kind to its card and maps actions to decisions', async () => {
  const onDecide = vi.fn();
  const onReturnRequest = vi.fn();

  const signature = await render(InboxItem, {
    props: { approval: signatureApproval, nowMs: inboxFixtureNowMs, onDecide, onReturnRequest },
  });
  await expect.element(signature.getByText('Signature')).toBeVisible();
  await signature.getByRole('button', { name: 'Sign' }).click();
  expect(onDecide).toHaveBeenLastCalledWith({ decision: 'approved' });
  await signature.getByRole('button', { name: 'Return' }).click();
  expect(onReturnRequest).toHaveBeenCalledTimes(1);

  const question = await render(InboxItem, {
    props: { approval: questionApproval, nowMs: inboxFixtureNowMs, onDecide },
  });
  await expect.element(question.getByText('Question')).toBeVisible();
  await question.getByRole('textbox').fill('Friendly tone.');
  await question.getByRole('button', { name: 'Send reply' }).click();
  expect(onDecide).toHaveBeenLastCalledWith({ decision: 'approved', feedback: 'Friendly tone.' });

  const failure = await render(InboxItem, {
    props: { approval: failureApproval, nowMs: inboxFixtureNowMs, onDecide },
  });
  await expect.element(failure.getByText('Failure')).toBeVisible();
  await failure.getByRole('button', { name: 'Suspend' }).click();
  expect(onDecide).toHaveBeenLastCalledWith({ decision: 'rejected' });
});

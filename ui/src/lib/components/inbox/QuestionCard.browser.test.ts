import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import QuestionCard from './QuestionCard.svelte';
import { inboxFixtureNowMs, questionApproval } from './fixtures';

test('requires a non-empty reply before sending', async () => {
  const onReply = vi.fn();
  const screen = await render(QuestionCard, {
    props: { approval: questionApproval, nowMs: inboxFixtureNowMs, onReply },
  });

  await expect.element(screen.getByText('Which tone should the newsletter use?')).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Send reply' })).toBeDisabled();

  await screen.getByRole('textbox').fill('Friendly and direct.');
  await screen.getByRole('button', { name: 'Send reply' }).click();
  expect(onReply).toHaveBeenCalledWith('Friendly and direct.');
});

test('conflict shows decided-elsewhere without the reply form', async () => {
  const onRefresh = vi.fn();
  const screen = await render(QuestionCard, {
    props: { approval: questionApproval, conflict: true, nowMs: inboxFixtureNowMs, onRefresh },
  });

  await expect.element(screen.getByText(/Decided elsewhere/)).toBeVisible();
  expect(screen.container.querySelector('textarea')).toBeNull();
  await screen.getByRole('button', { name: 'Refresh' }).click();
  expect(onRefresh).toHaveBeenCalledTimes(1);
});

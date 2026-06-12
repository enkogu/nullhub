import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import FeedbackDialog from './FeedbackDialog.svelte';

test('blocks submission until feedback reaches 10 characters', async () => {
  const onSubmit = vi.fn();
  const screen = await render(FeedbackDialog, { props: { open: true, onSubmit } });

  await expect.element(screen.getByRole('dialog', { name: 'Return for rework' })).toBeVisible();
  const submit = screen.getByRole('button', { name: 'Return work' });
  await expect.element(submit).toBeDisabled();

  await screen.getByRole('textbox').fill('short');
  await expect.element(submit).toBeDisabled();

  await screen.getByRole('textbox').fill('Needs a rollback plan first.');
  await submit.click();
  expect(onSubmit).toHaveBeenCalledWith('Needs a rollback plan first.');
});

test('cancel closes without submitting', async () => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const screen = await render(FeedbackDialog, { props: { open: true, onSubmit, onCancel } });

  await screen.getByRole('button', { name: 'Cancel' }).click();
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.container.querySelector('[role="dialog"]')).toBeNull();
});

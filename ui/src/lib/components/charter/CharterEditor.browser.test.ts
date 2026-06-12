import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { fixtureCharter, reservedCharterMarker } from '$lib/api/__fixtures__/charter';
import CharterEditor from './CharterEditor.svelte';

function setInput(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function setSelect(select: HTMLSelectElement, value: string) {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

test('saves edited charter fields with normalized defaults', async () => {
  const onSave = vi.fn();
  const screen = await render(CharterEditor, { props: { charter: fixtureCharter, onSave } });

  await expect.element(screen.getByRole('form', { name: 'Edit charter' })).toBeVisible();
  setInput(screen.container.querySelector<HTMLInputElement>('#charter-editor-mission')!, 'Keep launches reviewed.');
  setSelect(screen.container.querySelector<HTMLSelectElement>('#charter-editor-stage')!, 'active');
  setInput(screen.container.querySelector<HTMLTextAreaElement>('#charter-editor-autonomy-defaults')!, '');
  setInput(screen.container.querySelector<HTMLTextAreaElement>('#charter-editor-autonomy-bounds')!, 'Ask before spend.');
  setInput(screen.container.querySelector<HTMLTextAreaElement>('#charter-editor-metrics')!, 'cycle time');

  await screen.getByRole('button', { name: 'Save charter' }).click();
  await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  expect(onSave.mock.calls[0][0]).toEqual({
    stage: 'active',
    mission: 'Keep launches reviewed.',
    autonomyBounds: 'Ask before spend.',
    autonomyDefaults: 'T1',
    metrics: 'cycle time',
  });
});

test('blocks reserved marker text before submit', async () => {
  const onSave = vi.fn();
  const screen = await render(CharterEditor, { props: { charter: fixtureCharter, onSave } });

  setInput(screen.container.querySelector<HTMLInputElement>('#charter-editor-mission')!, `Bad ${reservedCharterMarker}`);
  await screen.getByRole('button', { name: 'Save charter' }).click();

  await expect.element(screen.getByText('Charter fields cannot contain reserved NULLHUB marker text.')).toBeVisible();
  expect(onSave).not.toHaveBeenCalled();
});

test('renders backend marker collision errors', async () => {
  const error = new Error('charter Markdown fields must not contain reserved NULLHUB charter markers') as Error & {
    status?: number;
  };
  error.status = 400;

  const screen = await render(CharterEditor, {
    props: {
      charter: fixtureCharter,
      error,
    },
  });

  await expect.element(screen.getByText('charter Markdown fields must not contain reserved NULLHUB charter markers')).toBeVisible();
  await expect.element(screen.getByText('HTTP 400')).toBeVisible();
});

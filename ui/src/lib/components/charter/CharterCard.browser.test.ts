import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { fixtureCharter } from '$lib/api/__fixtures__/charter';
import CharterCard from './CharterCard.svelte';

test('renders charter stage, mission, autonomy defaults, metrics, and doc path', async () => {
  const screen = await render(CharterCard, {
    props: {
      charter: fixtureCharter,
      state: 'ready',
      onSave: vi.fn(),
    },
  });

  await expect.element(screen.getByRole('heading', { name: 'Charter' })).toBeVisible();
  await expect.element(screen.getByText('Alpha')).toBeVisible();
  await expect.element(screen.getByText('charter.md')).toBeVisible();
  await expect.element(screen.getByText('Keep operator work visible, reviewed, and moving.')).toBeVisible();
  await expect.element(screen.getByText('T1 until a policy order raises the tier.')).toBeVisible();
  await expect.element(screen.getByText('open approvals')).toBeVisible();
  await expect.element(screen.getByText('cycle time')).toBeVisible();
});

test('opens the editor and calls save through the card', async () => {
  const onSave = vi.fn();
  const screen = await render(CharterCard, {
    props: {
      charter: fixtureCharter,
      state: 'ready',
      spaceName: 'Operations',
      onSave,
    },
  });

  await screen.getByRole('button', { name: 'Edit' }).click();
  await expect.element(screen.getByRole('dialog', { name: 'Edit charter' })).toBeVisible();

  const mission = screen.container.querySelector<HTMLInputElement>('#charter-editor-mission')!;
  mission.value = 'Keep operations clear.';
  mission.dispatchEvent(new Event('input', { bubbles: true }));

  await screen.getByRole('button', { name: 'Save charter' }).click();
  await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  expect(onSave.mock.calls[0][0]).toMatchObject({ mission: 'Keep operations clear.' });
});

test('renders loading state', async () => {
  const screen = await render(CharterCard, { props: { charter: null, state: 'loading' } });
  await expect.element(screen.getByText('Loading charter')).toBeVisible();
});

test('renders an editable empty charter state', async () => {
  const screen = await render(CharterCard, {
    props: {
      charter: {
        spaceId: 'ops',
        stage: 'draft',
        mission: '',
        autonomyBounds: '',
        autonomyDefaults: 'T1',
        metrics: '',
        docPath: 'charter.md',
      },
      state: 'ready',
      onSave: vi.fn(),
    },
  });
  await expect.element(screen.getByText('Charter fields are empty')).toBeVisible();
  expect(screen.container.querySelector<HTMLButtonElement>('button')?.disabled).toBe(false);
});

test('renders selected-space empty state when no concrete charter can load', async () => {
  const screen = await render(CharterCard, { props: { charter: null, state: 'empty' } });
  await expect.element(screen.getByText('Select one Space')).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
});

test('renders error state', async () => {
  const screen = await render(CharterCard, {
    props: { charter: null, state: 'error', error: new Error('Charter failed.') },
  });
  await expect.element(screen.getByText('Charter unavailable')).toBeVisible();
  await expect.element(screen.getByText('Charter failed.')).toBeVisible();
});

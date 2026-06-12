import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ResultsGrid from './ResultsGrid.svelte';
import type { WorkResult } from './results';

const nowMs = 1_780_000_000_000;

const results: WorkResult[] = [
  {
    id: 'deliverable:task-review-1',
    source: 'deliverable',
    type: 'document',
    title: 'Playbook draft',
    summary: 'Draft playbook awaiting reviewer sign-off.',
    lifecycle: 'review',
    producedAtMs: nowMs - 60_000,
  },
  {
    id: 'artifact:artifact-done-1',
    source: 'artifact',
    type: 'link',
    title: 'Landing page',
    summary: 'Approved landing page ready for the delivery handoff.',
    lifecycle: 'delivered',
    producedAtMs: nowMs - 10 * 60_000,
    href: 'https://example.com/landing',
  },
];

function textContent(container: HTMLElement): string {
  return container.textContent ?? '';
}

test('renders populated, empty, loading, error, and requires-space states', async () => {
  const populated = await render(ResultsGrid, { props: { results, gridState: 'ready', nowMs } });
  await expect.element(populated.getByRole('heading', { name: 'Results' })).toBeVisible();
  await expect.element(populated.getByRole('heading', { name: 'Playbook draft' })).toBeVisible();
  await expect.element(populated.getByRole('heading', { name: 'Landing page' })).toBeVisible();

  const empty = await render(ResultsGrid, { props: { results: [], gridState: 'ready', nowMs } });
  await expect.element(empty.getByText('No results yet')).toBeVisible();

  const loading = await render(ResultsGrid, { props: { results: [], gridState: 'loading', nowMs } });
  await expect.element(loading.getByText('Loading results')).toBeVisible();

  const error = await render(ResultsGrid, {
    props: { results: [], gridState: 'error', error: new Error('Results failed.'), nowMs },
  });
  await expect.element(error.getByText('Results unavailable')).toBeVisible();
  await expect.element(error.getByText('Results failed.')).toBeVisible();

  const requiresSpace = await render(ResultsGrid, {
    props: { results: [], gridState: 'ready', requiresSpace: true, nowMs },
  });
  await expect.element(requiresSpace.getByText('Select one space')).toBeVisible();
});

test('filters results by lifecycle, source, and query', async () => {
  const screen = await render(ResultsGrid, { props: { results, gridState: 'ready', nowMs } });
  const input = screen.container.querySelector<HTMLInputElement>('input');
  const selects = Array.from(screen.container.querySelectorAll<HTMLSelectElement>('select'));
  const [lifecycleSelect, sourceSelect] = selects;

  lifecycleSelect.value = 'review';
  lifecycleSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(textContent(screen.container)).not.toContain('Landing page'));
  expect(textContent(screen.container)).toContain('Playbook draft');

  lifecycleSelect.value = '';
  lifecycleSelect.dispatchEvent(new Event('change', { bubbles: true }));
  sourceSelect.value = 'artifact';
  sourceSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(textContent(screen.container)).toContain('Landing page'));
  expect(textContent(screen.container)).not.toContain('Playbook draft');

  sourceSelect.value = '';
  sourceSelect.dispatchEvent(new Event('change', { bubbles: true }));
  input!.value = 'playbook';
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.waitFor(() => expect(textContent(screen.container)).toContain('Playbook draft'));
  expect(textContent(screen.container)).not.toContain('Landing page');
});

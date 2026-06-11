import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import LiveRunsFeed from './LiveRunsFeed.svelte';
import type { LiveRun } from './live';

const nowMs = 1_780_000_000_000;

const runs: LiveRun[] = [
  {
    id: 'loop:loop-1',
    source: 'loop',
    title: 'Support Triage',
    summary: 'Review support requests.',
    owner: 'Athena',
    ownerLabel: 'Agent',
    status: 'running',
    bucket: 'active',
    surfaceLabel: 'Work evidence',
    startedAtMs: nowMs - 5 * 60_000,
    updatedAtMs: nowMs - 60_000,
    durationMs: 4 * 60_000,
    watchState: 'observed',
    stalled: false,
  },
  {
    id: 'workflow:workflow-1',
    source: 'workflow',
    title: 'Onboarding Graph',
    summary: 'Workflow graph execution.',
    owner: 'boiler',
    ownerLabel: 'Worker',
    status: 'completed',
    bucket: 'completed',
    surfaceLabel: 'Graph execution',
    startedAtMs: nowMs - 30 * 60_000,
    updatedAtMs: nowMs - 10 * 60_000,
    durationMs: 20 * 60_000,
    watchState: 'observed',
    stalled: false,
  },
];

function textContent(container: HTMLElement): string {
  return container.textContent ?? '';
}

test('renders populated, empty, loading, error, and requires-space states', async () => {
  const populated = await render(LiveRunsFeed, { props: { runs, feedState: 'ready', nowMs } });
  await expect.element(populated.getByRole('heading', { name: 'Live Runs' })).toBeVisible();
  await expect.element(populated.getByText('Support Triage')).toBeVisible();
  await expect.element(populated.getByText('Onboarding Graph')).toBeVisible();

  const empty = await render(LiveRunsFeed, { props: { runs: [], feedState: 'ready', nowMs } });
  await expect.element(empty.getByText('No live runs')).toBeVisible();

  const loading = await render(LiveRunsFeed, { props: { runs: [], feedState: 'loading', nowMs } });
  await expect.element(loading.getByText('Loading live runs')).toBeVisible();

  const error = await render(LiveRunsFeed, {
    props: { runs: [], feedState: 'error', error: new Error('Live failed.'), nowMs },
  });
  await expect.element(error.getByText('Live runs unavailable')).toBeVisible();
  await expect.element(error.getByText('Live failed.')).toBeVisible();

  const requiresSpace = await render(LiveRunsFeed, { props: { runs: [], feedState: 'ready', requiresSpace: true, nowMs } });
  await expect.element(requiresSpace.getByText('Select one space')).toBeVisible();
});

test('filters live runs by source, state, owner, and query', async () => {
  const screen = await render(LiveRunsFeed, { props: { runs, feedState: 'ready', nowMs } });
  const input = screen.container.querySelector<HTMLInputElement>('input');
  const selects = Array.from(screen.container.querySelectorAll<HTMLSelectElement>('select'));
  const [sourceSelect, bucketSelect, ownerSelect] = selects;

  sourceSelect.value = 'workflow';
  sourceSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(textContent(screen.container)).not.toContain('Support Triage'));
  expect(textContent(screen.container)).toContain('Onboarding Graph');

  sourceSelect.value = '';
  sourceSelect.dispatchEvent(new Event('change', { bubbles: true }));
  bucketSelect.value = 'active';
  bucketSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(textContent(screen.container)).toContain('Support Triage'));
  expect(textContent(screen.container)).not.toContain('Onboarding Graph');

  bucketSelect.value = '';
  bucketSelect.dispatchEvent(new Event('change', { bubbles: true }));
  ownerSelect.value = 'boiler';
  ownerSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(textContent(screen.container)).toContain('Onboarding Graph'));
  expect(textContent(screen.container)).not.toContain('Support Triage');

  ownerSelect.value = '';
  ownerSelect.dispatchEvent(new Event('change', { bubbles: true }));
  input!.value = 'support';
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.waitFor(() => expect(textContent(screen.container)).toContain('Support Triage'));
  expect(textContent(screen.container)).not.toContain('Onboarding Graph');
});

import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { NullHubEvent } from '$lib/api/client';
import ActivityFeed from './ActivityFeed.svelte';

const nowMs = 1_780_000_000_000;

const events: NullHubEvent[] = [
  {
    id: 3,
    spaceId: 'ops',
    type: 'loop.review_requested',
    source: 'nulltickets',
    subjectType: 'loop_run',
    subjectId: 'loop-3',
    title: 'Review requested',
    summary: 'Athena finished a support loop.',
    severity: 'warning',
    evidenceRef: 'artifact://loop-3',
    createdAtMs: nowMs - 5 * 60_000,
    payload: { agent: 'Athena' },
  },
  {
    id: 2,
    spaceId: 'ops',
    type: 'workflow.completed',
    source: 'nullboiler',
    subjectType: 'workflow_run',
    subjectId: 'workflow-2',
    title: 'Workflow completed',
    summary: 'Iris delivered a workflow result.',
    severity: 'success',
    evidenceRef: 'artifact://workflow-2',
    createdAtMs: nowMs - 2 * 60 * 60_000,
    payload: { agent: 'Iris' },
  },
];

function textContent(container: HTMLElement): string {
  return container.textContent ?? '';
}

test('renders populated, empty, loading, and error states', async () => {
  const populated = await render(ActivityFeed, { props: { events, feedState: 'ready', nowMs } });
  await expect.element(populated.getByRole('heading', { name: 'Events' })).toBeVisible();
  await expect.element(populated.getByText('Review requested')).toBeVisible();
  await expect.element(populated.getByText('Workflow completed')).toBeVisible();

  const empty = await render(ActivityFeed, { props: { events: [], feedState: 'ready', nowMs } });
  await expect.element(empty.getByText('No activity events')).toBeVisible();

  const loading = await render(ActivityFeed, { props: { events: [], feedState: 'loading', nowMs } });
  await expect.element(loading.getByText('Loading activity')).toBeVisible();

  const error = await render(ActivityFeed, {
    props: { events: [], feedState: 'error', error: new Error('Events failed.'), nowMs },
  });
  await expect.element(error.getByText('Activity unavailable')).toBeVisible();
  await expect.element(error.getByText('Events failed.')).toBeVisible();
});

test('filters activity by source, level, agent, period, and query', async () => {
  const screen = await render(ActivityFeed, { props: { events, feedState: 'ready', nowMs } });
  const input = screen.container.querySelector<HTMLInputElement>('input');
  const selects = screen.container.querySelectorAll<HTMLSelectElement>('select');
  const [sourceSelect, levelSelect, agentSelect, periodSelect] = Array.from(selects);

  sourceSelect.value = 'nullboiler';
  sourceSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(textContent(screen.container)).not.toContain('Review requested'));
  expect(textContent(screen.container)).toContain('Workflow completed');

  sourceSelect.value = '';
  sourceSelect.dispatchEvent(new Event('change', { bubbles: true }));
  levelSelect.value = 'warning';
  levelSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(textContent(screen.container)).toContain('Review requested'));
  expect(textContent(screen.container)).not.toContain('Workflow completed');

  levelSelect.value = '';
  levelSelect.dispatchEvent(new Event('change', { bubbles: true }));
  agentSelect.value = 'Iris';
  agentSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(textContent(screen.container)).toContain('Workflow completed'));
  expect(textContent(screen.container)).not.toContain('Review requested');

  agentSelect.value = '';
  agentSelect.dispatchEvent(new Event('change', { bubbles: true }));
  periodSelect.value = 'hour';
  periodSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(textContent(screen.container)).toContain('Review requested'));
  expect(textContent(screen.container)).not.toContain('Workflow completed');

  periodSelect.value = '';
  periodSelect.dispatchEvent(new Event('change', { bubbles: true }));
  input!.value = 'workflow';
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.waitFor(() => expect(textContent(screen.container)).toContain('Workflow completed'));
  expect(textContent(screen.container)).not.toContain('Review requested');
});

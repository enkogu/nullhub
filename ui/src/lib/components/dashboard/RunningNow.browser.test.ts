import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RunningNow from './RunningNow.svelte';
import type { LiveRun } from '$lib/components/work/live';

const nowMs = 1_780_000_000_000;

function liveRun(overrides: Partial<LiveRun>): LiveRun {
  return {
    id: 'run-1',
    source: 'loop',
    title: 'Support triage loop',
    summary: 'Iterating on open support requests.',
    owner: 'Athena',
    ownerLabel: 'Agent',
    status: 'Running',
    bucket: 'active',
    surfaceLabel: 'Loop run',
    startedAtMs: nowMs - 10 * 60_000,
    updatedAtMs: nowMs - 60_000,
    durationMs: null,
    href: '/work/loops/runs',
    watchState: 'unavailable',
    stalled: false,
    ...overrides,
  };
}

test('shows active runs with the /work/live deep link and hides finished runs', async () => {
  const runs = [
    liveRun({}),
    liveRun({ id: 'run-2', title: 'Onboarding workflow', source: 'workflow', bucket: 'attention' }),
    liveRun({ id: 'run-3', title: 'Finished run', bucket: 'completed', status: 'Completed' }),
  ];
  const screen = await render(RunningNow, { props: { runs, state: 'ready', nowMs } });

  await expect.element(screen.getByRole('heading', { name: 'Running now' })).toBeVisible();
  await expect.element(screen.getByText('Support triage loop')).toBeVisible();
  await expect.element(screen.getByText('Onboarding workflow')).toBeVisible();
  expect(screen.container.textContent).not.toContain('Finished run');

  const openLive = screen.getByRole('link', { name: 'Open live' });
  await expect.element(openLive).toBeVisible();
  expect((await openLive.element()).getAttribute('href')).toBe('/work/live');
});

test('renders loading, empty, and error states', async () => {
  const loading = await render(RunningNow, { props: { runs: [], state: 'loading', nowMs } });
  await expect.element(loading.getByText('Loading live runs')).toBeVisible();

  const empty = await render(RunningNow, { props: { runs: [], state: 'ready', nowMs } });
  await expect.element(empty.getByText('Nothing is running')).toBeVisible();

  const error = await render(RunningNow, {
    props: { runs: [], state: 'error', error: new Error('Live feed down.'), nowMs },
  });
  await expect.element(error.getByText('Live runs unavailable')).toBeVisible();
  await expect.element(error.getByText('Live feed down.')).toBeVisible();
});

import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RunRow from './RunRow.svelte';
import type { LiveRun } from './live';

test('renders run ownership, source, watch status, duration, and stale reason', async () => {
  const nowMs = 1_780_000_000_000;
  const run: LiveRun = {
    id: 'workflow:run-1',
    source: 'workflow',
    title: 'Onboarding Graph',
    summary: 'Workflow run run-1',
    owner: 'boiler',
    ownerLabel: 'Worker',
    status: 'running',
    bucket: 'stalled',
    surfaceLabel: 'Graph execution',
    startedAtMs: nowMs - 20 * 60_000,
    updatedAtMs: nowMs - 20 * 60_000,
    durationMs: 20 * 60_000,
    href: '/orders/workflows/runs/run-1',
    evidenceRef: 'trace-1',
    watchState: 'unobserved',
    stalled: true,
    stallReason: 'Active run is not visible in the selected NullWatch stream.',
  };

  const screen = await render(RunRow, { props: { run, nowMs } });
  const text = screen.container.querySelector('[data-slot="run-row"]')?.textContent ?? '';

  await expect.element(screen.getByRole('article', { name: 'Onboarding Graph Workflow run' })).toBeVisible();
  expect(text).toContain('Graph execution');
  expect(text).toContain('Worker: boiler');
  expect(text).toContain('Watch not seen');
  expect(text).toContain('Duration 20m 0s');
  expect(text).toContain('trace-1');
  expect(text).toContain('Active run is not visible');
});

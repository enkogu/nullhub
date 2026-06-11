import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { NullHubEvent } from '$lib/api/client';
import EventRow from './EventRow.svelte';

test('renders event level, source, subject, agent, and relative time', async () => {
  const nowMs = 1_780_000_000_000;
  const event: NullHubEvent = {
    id: 7,
    spaceId: 'ops',
    type: 'loop.review_requested',
    source: 'nulltickets',
    subjectType: 'loop_run',
    subjectId: 'loop-7',
    title: 'Review requested',
    summary: 'Athena finished a loop and needs approval.',
    severity: 'warning',
    evidenceRef: 'artifact://loop-7',
    createdAtMs: nowMs - 10 * 60_000,
    payload: { agent: 'Athena' },
  };

  const screen = await render(EventRow, { props: { event, nowMs } });
  const rowText = screen.container.querySelector('[data-slot="event-row"]')?.textContent ?? '';

  await expect.element(screen.getByRole('article', { name: 'Review requested from Nulltickets' })).toBeVisible();
  expect(rowText).toContain('Warning');
  expect(rowText).toContain('Nulltickets');
  expect(rowText).toContain('Loop Run loop-7');
  expect(rowText).toContain('Athena');
  expect(rowText).toContain('10m ago');
});

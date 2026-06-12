import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import DigestCard from './DigestCard.svelte';
import { aggregateDigest, aggregateUsageSpend, type DigestUsagePayload } from './digest';
import type { NullHubEvent } from '$lib/api/client';

const nowMs = 1_780_000_000_000;
const lastSeenMs = nowMs - 8 * 60 * 60_000;

function event(overrides: Partial<NullHubEvent>): NullHubEvent {
  return {
    id: 1,
    spaceId: 'ops',
    type: 'task.completed',
    source: 'nulltickets',
    subjectType: 'task',
    subjectId: 'task-1',
    title: 'Task completed',
    summary: 'A task reached a terminal state.',
    severity: 'success',
    evidenceRef: 'run:task-1',
    createdAtMs: nowMs - 2 * 60 * 60_000,
    payload: { status: 'completed' },
    ...overrides,
  };
}

const digestEvents: NullHubEvent[] = [
  event({ id: 1, subjectId: 'task-1', title: 'Close support triage' }),
  event({ id: 2, subjectId: 'task-1', type: 'task.done', title: 'Duplicate close event' }),
  event({
    id: 3,
    type: 'loop.review_requested',
    source: 'nulltickets',
    subjectType: 'deliverable',
    subjectId: 'result-1',
    title: 'Playbook ready for review',
    payload: { lifecycle: 'review' },
  }),
  event({
    id: 4,
    type: 'order.executed',
    source: 'orders',
    subjectType: 'order',
    subjectId: 'order-1',
    title: 'Morning order executed',
    payload: { status: 'executed' },
  }),
  event({
    id: 5,
    type: 'task.completed',
    subjectId: 'old-task',
    title: 'Old task',
    createdAtMs: lastSeenMs - 60_000,
  }),
];

const usage: DigestUsagePayload = {
  totals: { total_cost_usd: 9 },
  timeseries: [
    { bucket_start: Math.floor((lastSeenMs + 60_000) / 1000), total_cost_usd: 0.0825 },
    { bucket_start: Math.floor((lastSeenMs - 60_000) / 1000), total_cost_usd: 0.03 },
  ],
};

test('aggregates recent events since last seen and deduplicates subjects', () => {
  expect(aggregateDigest(digestEvents, usage, lastSeenMs)).toMatchObject({
    tasksClosed: 1,
    resultsAwaitingReview: 1,
    ordersExecuted: 1,
    spendUsd: 0.0825,
    eventCount: 4,
    sinceMs: lastSeenMs,
  });
});

test('falls back to usage totals when no timeseries spend is reported', () => {
  expect(aggregateUsageSpend({ totals: { spend_usd: 1.25 }, by_instance: [{ total_cost_usd: 2 }] }, lastSeenMs)).toBe(
    1.25,
  );
  expect(aggregateUsageSpend({ by_instance: [{ total_cost_usd: 0.4 }, { cost_usd: 0.6 }] }, lastSeenMs)).toBe(1);
});

test('renders populated digest metrics with the /work/activity deep link', async () => {
  const screen = await render(DigestCard, { props: { events: digestEvents, usage, state: 'ready', lastSeenMs } });

  await expect.element(screen.getByRole('heading', { name: 'While you were away' })).toBeVisible();
  await expect.element(screen.getByText('Tasks closed')).toBeVisible();
  await expect.element(screen.getByText('Results awaiting review')).toBeVisible();
  await expect.element(screen.getByText('Orders executed')).toBeVisible();
  await expect.element(screen.getByText('$0.0825')).toBeVisible();

  const openEvents = screen.getByRole('link', { name: 'Open events' });
  await expect.element(openEvents).toBeVisible();
  expect((await openEvents.element()).getAttribute('href')).toBe('/work/activity');
});

test('renders loading, empty, and error states', async () => {
  const loading = await render(DigestCard, { props: { events: [], usage: null, state: 'loading', lastSeenMs } });
  await expect.element(loading.getByText('Loading recent evidence')).toBeVisible();

  const empty = await render(DigestCard, {
    props: { events: [], usage: { totals: { total_cost_usd: 0 } }, state: 'ready', lastSeenMs },
  });
  await expect.element(empty.getByText('All quiet')).toBeVisible();

  const error = await render(DigestCard, {
    props: { events: [], usage: null, state: 'error', error: new Error('Digest failed.'), lastSeenMs },
  });
  await expect.element(error.getByText('Digest unavailable')).toBeVisible();
  await expect.element(error.getByText('Digest failed.')).toBeVisible();
});

import { describe, expect, test } from 'vitest';
import { aggregateDigest, aggregateUsageSpend, type DigestEvent, type DigestUsagePayload } from './digest';

const nowMs = 1_780_000_000_000;
const lastSeenMs = nowMs - 8 * 60 * 60_000;

function event(overrides: Partial<DigestEvent>): DigestEvent {
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

const usage: DigestUsagePayload = {
  totals: { total_cost_usd: 9 },
  timeseries: [
    { bucket_start: Math.floor((lastSeenMs + 60_000) / 1000), total_cost_usd: 0.0825 },
    { bucket_start: Math.floor((lastSeenMs - 60_000) / 1000), total_cost_usd: 0.03 },
  ],
};

describe('Home digest aggregation', () => {
  test('aggregates recent events since last seen and deduplicates subjects', () => {
    const events = [
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

    expect(aggregateDigest(events, usage, lastSeenMs)).toMatchObject({
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

  test('returns zero for an empty scoped timeseries spend window', () => {
    expect(
      aggregateUsageSpend(
        {
          totals: { total_cost_usd: 5 },
          by_instance: [{ total_cost_usd: 3 }],
          by_model: [{ total_cost_usd: 2 }],
          timeseries: [{ bucket_start: Math.floor((lastSeenMs - 60_000) / 1000), total_cost_usd: 0.75 }],
        },
        lastSeenMs,
      ),
    ).toBe(0);
  });
});

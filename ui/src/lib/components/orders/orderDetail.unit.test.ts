import { describe, expect, test } from 'vitest';
import type { NullHubEvent } from '$lib/api/client';
import { orderEventRunId } from './orderDetail';

function event(payload: unknown, overrides: Partial<NullHubEvent> = {}): NullHubEvent {
  return {
    id: 1,
    spaceId: 'ops',
    type: 'order.executed',
    source: 'cron',
    subjectType: 'order',
    subjectId: 'order-1',
    title: 'Order executed',
    summary: 'A schedule order cron run completed.',
    severity: 'success',
    evidenceRef: '',
    createdAtMs: 1_780_000_000_000,
    payload,
    ...overrides,
  };
}

describe('order detail event helpers', () => {
  test('extracts production cron run refs from order event payloads', () => {
    expect(orderEventRunId(event({ run_ref: 'run-99' }))).toBe('run-99');
    expect(orderEventRunId(event({ runRef: 'run-100' }))).toBe('run-100');
    expect(orderEventRunId(event({ run: { run_ref: 'run-101' } }))).toBe('run-101');
  });

  test('keeps existing run id fallbacks for order events', () => {
    expect(orderEventRunId(event({ run_id: 'run-41' }))).toBe('run-41');
    expect(orderEventRunId(event({}, { subjectType: 'run', subjectId: 'run-subject' }))).toBe('run-subject');
  });
});

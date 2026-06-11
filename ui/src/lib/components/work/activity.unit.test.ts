import { describe, expect, test } from 'vitest';
import type { NullHubEvent } from '$lib/api/client';
import {
  activityAgentOptions,
  activityLevelOptions,
  activitySourceOptions,
  eventAgent,
  filterActivityEvents,
  formatActivityTime,
} from './activity';

const nowMs = 1_780_000_000_000;

function event(partial: Partial<NullHubEvent>): NullHubEvent {
  return {
    id: partial.id ?? 1,
    spaceId: 'ops',
    type: partial.type ?? 'work.started',
    source: partial.source ?? 'dispatcher',
    subjectType: partial.subjectType ?? 'task',
    subjectId: partial.subjectId ?? 'task-1',
    title: partial.title ?? 'Work started',
    summary: partial.summary ?? 'A task started.',
    severity: partial.severity ?? 'info',
    evidenceRef: partial.evidenceRef ?? '',
    createdAtMs: partial.createdAtMs ?? nowMs,
    payload: partial.payload ?? {},
  };
}

describe('activity filters', () => {
  const events = [
    event({
      id: 1,
      source: 'nulltickets',
      severity: 'warning',
      title: 'Review requested',
      createdAtMs: nowMs - 10 * 60_000,
      payload: { agent: 'Athena' },
    }),
    event({
      id: 2,
      source: 'nullboiler',
      severity: 'success',
      title: 'Workflow completed',
      createdAtMs: nowMs - 2 * 60 * 60_000,
      payload: { agent_id: 'Iris' },
    }),
    event({
      id: 3,
      source: 'dispatcher',
      severity: 'info',
      title: 'Daily digest generated',
      createdAtMs: nowMs - 3 * 24 * 60 * 60_000,
      payload: { actor: 'Athena' },
    }),
  ];

  test('filters by source, level, agent, period, and query', () => {
    expect(filterActivityEvents(events, { source: 'nulltickets' }, nowMs).map((item) => item.id)).toEqual([1]);
    expect(filterActivityEvents(events, { level: 'success' }, nowMs).map((item) => item.id)).toEqual([2]);
    expect(filterActivityEvents(events, { agent: 'Athena' }, nowMs).map((item) => item.id)).toEqual([1, 3]);
    expect(filterActivityEvents(events, { period: 'hour' }, nowMs).map((item) => item.id)).toEqual([1]);
    expect(filterActivityEvents(events, { query: 'workflow' }, nowMs).map((item) => item.id)).toEqual([2]);
  });

  test('extracts options and agent names from event payloads', () => {
    expect(eventAgent(events[0])).toBe('Athena');
    expect(eventAgent(events[1])).toBe('Iris');
    expect(activitySourceOptions(events).map((option) => option.value)).toEqual([
      'dispatcher',
      'nullboiler',
      'nulltickets',
    ]);
    expect(activityLevelOptions(events).map((option) => option.value)).toEqual(['info', 'success', 'warning']);
    expect(activityAgentOptions(events).map((option) => option.value)).toEqual(['Athena', 'Iris']);
  });

  test('formats recent activity times', () => {
    expect(formatActivityTime(nowMs - 10_000, nowMs)).toBe('Just now');
    expect(formatActivityTime(nowMs - 5 * 60_000, nowMs)).toBe('5m ago');
    expect(formatActivityTime(nowMs - 3 * 60 * 60_000, nowMs)).toBe('3h ago');
  });
});

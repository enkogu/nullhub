import { describe, expect, test } from 'vitest';
import type { NullHubEvent } from '$lib/api/client';
import type { LoopRunRow, LoopTask } from '$lib/loops/types';
import {
  agentEventsToLiveRuns,
  detectLiveStall,
  filterLiveRuns,
  loopRunsToLiveRuns,
  mergeLiveRuns,
  waitingTasksToLiveRuns,
  workflowRunsToLiveRuns,
} from './live';

const nowMs = 1_780_000_000_000;

function loopRow(partial: {
  task?: Partial<LoopRunRow['task']>;
  run?: Partial<LoopRunRow['run']>;
  pipeline?: Partial<NonNullable<LoopRunRow['pipeline']>>;
} = {}): LoopRunRow {
  return {
    task: {
      id: 'task-1',
      pipeline_id: 'support-triage',
      stage: 'in_progress',
      title: 'Triage support inbox',
      description: 'Review incoming support requests.',
      created_at_ms: nowMs - 30 * 60_000,
      updated_at_ms: nowMs - 12 * 60_000,
      latest_run: null,
      ...partial.task,
    },
    run: {
      id: 'loop-run-1',
      task_id: 'task-1',
      status: 'running',
      agent_id: 'Athena',
      attempt: 2,
      started_at_ms: nowMs - 30 * 60_000,
      ...partial.run,
    },
    pipeline: {
      id: 'support-triage',
      name: 'Support Triage',
      ...partial.pipeline,
    },
  };
}

function event(partial: Partial<NullHubEvent> = {}): NullHubEvent {
  return {
    id: 9,
    spaceId: 'ops',
    type: 'agent.note',
    source: 'dispatcher',
    subjectType: 'task',
    subjectId: 'task-9',
    title: 'Agent note captured',
    summary: 'Athena posted a progress update.',
    severity: 'info',
    evidenceRef: 'event://9',
    createdAtMs: nowMs - 60_000,
    payload: { agent: 'Athena' },
    ...partial,
  };
}

describe('live run adapters', () => {
  test('normalizes loop, workflow, and agent sources into one run shape', () => {
    const watch = { running: true, selectedWatch: 'watch', observedRunIds: new Set(['loop-run-1', 'workflow-run-1']) };
    const loop = loopRunsToLiveRuns([loopRow()], watch, nowMs, { ticketsInstance: 'tickets', spaceId: 'ops' })[0];
    const workflow = workflowRunsToLiveRuns(
      [
        {
          id: 'workflow-run-1',
          workflow_name: 'Onboarding Graph',
          status: 'running',
          started_at_ms: nowMs - 5 * 60_000,
          updated_at_ms: nowMs - 30_000,
          worker_id: 'boiler',
        },
      ],
      watch,
      nowMs,
    )[0];
    const agent = waitingTasksToLiveRuns(
      [
        {
          id: 'task-agent-1',
          pipeline_id: 'support-triage',
          stage: 'queued',
          title: 'Draft response',
          description: 'Waiting for Athena.',
          created_at_ms: nowMs - 2 * 60_000,
          metadata: { owner: 'Athena' },
        },
      ],
      nowMs,
    )[0];

    expect(loop).toMatchObject({
      source: 'loop',
      title: 'Triage support inbox',
      owner: 'Athena',
      surfaceLabel: 'Work evidence',
      watchState: 'observed',
      href: '/work/runs/loop-run-1?task_id=task-1&tickets_instance=tickets&space=ops',
    });
    expect(workflow).toMatchObject({
      source: 'workflow',
      title: 'Onboarding Graph',
      owner: 'boiler',
      surfaceLabel: 'Graph execution',
      watchState: 'observed',
    });
    expect(agent).toMatchObject({
      source: 'agent',
      title: 'Draft response',
      owner: 'Athena',
      surfaceLabel: 'Agent work',
    });
  });

  test('marks stale active rows and dead-letter tasks as stalled attention', () => {
    const stale = detectLiveStall(
      {
        id: 'workflow-run-2',
        bucket: 'active',
        updatedAtMs: nowMs - 20 * 60_000,
        watchState: 'unobserved',
      },
      nowMs,
    );
    expect(stale).toMatchObject({ stalled: true, bucket: 'stalled' });

    const deadLetter = loopRunsToLiveRuns(
      [
        loopRow({
          task: { dead_letter_reason: 'Provider failed.' },
          run: { status: 'failed', error_text: 'Provider failed.' },
        }),
      ],
      { running: false },
      nowMs,
    )[0];
    expect(deadLetter.bucket).toBe('stalled');
    expect(deadLetter.stalled).toBe(true);
  });

  test('keeps observed active rows out of stalled state', () => {
    const observed = detectLiveStall(
      {
        id: 'workflow-run-3',
        bucket: 'active',
        updatedAtMs: nowMs - 20 * 60_000,
        watchState: 'observed',
      },
      nowMs,
    );
    expect(observed).toMatchObject({ stalled: false, bucket: 'active' });
  });

  test('preserves selected boiler instance in workflow run links', () => {
    const workflow = workflowRunsToLiveRuns(
      [
        {
          id: 'workflow-run-2',
          workflow_name: 'Billing Graph',
          status: 'completed',
          started_at_ms: nowMs - 5 * 60_000,
          completed_at: new Date(nowMs).toISOString(),
        },
      ],
      { running: false },
      nowMs,
      { boilerInstance: 'boiler-b' },
    )[0];

    expect(workflow.href).toBe('/automations/runs/workflow-run-2?boiler_instance=boiler-b');
  });

  test('normalizes waiting tasks and agent events and supports filtering', () => {
    const waitingTask: LoopTask = {
      id: 'task-queued',
      pipeline_id: 'pipeline',
      stage: 'queued',
      title: 'Queued outreach',
      description: 'Waiting for an agent.',
      created_at_ms: nowMs - 5 * 60_000,
      metadata: { owner: 'Iris' },
    };
    const runs = mergeLiveRuns([
      waitingTasksToLiveRuns([waitingTask], nowMs),
      agentEventsToLiveRuns([event()], nowMs),
    ]);

    expect(runs.map((run) => run.source)).toEqual(['agent', 'agent']);
    expect(filterLiveRuns(runs, { owner: 'Athena' }).map((run) => run.title)).toEqual(['Agent note captured']);
    expect(filterLiveRuns(runs, { query: 'outreach' }).map((run) => run.title)).toEqual(['Queued outreach']);
  });
});

import { describe, expect, test } from 'vitest';
import type { LoopArtifact, LoopTask } from '$lib/loops/types';
import {
  appResultHref,
  artifactToResult,
  artifactsToResults,
  deliverableToResult,
  filterResults,
  mergeResults,
  resultLifecycleOptions,
  resultSourceOptions,
  taskStageToLifecycle,
  ticketDeliverablesToResults,
} from './results';

const nowMs = 1_780_000_000_000;

function task(partial: Partial<LoopTask> = {}): LoopTask {
  return {
    id: 'task-1',
    pipeline_id: 'support-triage',
    stage: 'in_progress',
    title: 'Triage support inbox',
    description: 'Review incoming support requests.',
    created_at_ms: nowMs - 30 * 60_000,
    updated_at_ms: nowMs - 12 * 60_000,
    latest_run: null,
    ...partial,
  };
}

function artifact(partial: Partial<LoopArtifact> = {}): LoopArtifact {
  return {
    id: 'artifact-1',
    task_id: 'task-1',
    run_id: 'loop-run-1',
    created_at_ms: nowMs - 5 * 60_000,
    kind: 'document',
    uri: 'https://example.com/report',
    ...partial,
  };
}

describe('result lifecycle', () => {
  test('maps task stages onto the single lifecycle vocabulary', () => {
    expect(taskStageToLifecycle('queued')).toBe('draft');
    expect(taskStageToLifecycle('in_progress')).toBe('draft');
    expect(taskStageToLifecycle('review')).toBe('review');
    expect(taskStageToLifecycle('needs_review')).toBe('review');
    expect(taskStageToLifecycle('approved')).toBe('approved');
    expect(taskStageToLifecycle('done')).toBe('delivered');
    expect(taskStageToLifecycle('completed')).toBe('delivered');
    expect(taskStageToLifecycle(undefined)).toBe('draft');
  });
});

describe('result adapters', () => {
  test('adapts ticket deliverables with lifecycle, evidence, and times', () => {
    const result = deliverableToResult(
      task({
        stage: 'review',
        latest_run: { id: 'loop-run-9', task_id: 'task-1', status: 'completed' },
      }),
    );

    expect(result).toMatchObject({
      id: 'deliverable:task-1',
      source: 'deliverable',
      type: 'document',
      title: 'Triage support inbox',
      lifecycle: 'review',
      evidenceRef: 'run:loop-run-9',
    });
    expect(result.producedAtMs).toBe(nowMs - 12 * 60_000);
  });

  test('honors explicit lifecycle metadata over the stage mapping', () => {
    const result = deliverableToResult(task({ stage: 'done', metadata: { lifecycle: 'approved' } }));
    expect(result.lifecycle).toBe('approved');
  });

  test('marks deliverables with app metadata as app results', () => {
    const result = deliverableToResult(
      task({ metadata: { app: { component: 'nullclaw', name: 'support-portal' } } }),
    );
    expect(result.type).toBe('app');
    expect(result.app).toEqual({ component: 'nullclaw', name: 'support-portal' });
  });

  test('adapts artifacts with kind-based types and meta lifecycle', () => {
    const document = artifactToResult(artifact({ meta: { lifecycle: 'delivered', title: 'Q2 report' } }));
    expect(document).toMatchObject({
      id: 'artifact:artifact-1',
      source: 'artifact',
      type: 'document',
      title: 'Q2 report',
      lifecycle: 'delivered',
      href: 'https://example.com/report',
      evidenceRef: 'run:loop-run-1',
    });

    const file = artifactToResult(artifact({ id: 'artifact-2', kind: 'blob', uri: 'artifact://blob-2' }));
    expect(file.type).toBe('file');
    expect(file.href).toBeUndefined();
    expect(file.lifecycle).toBe('draft');

    const app = artifactToResult(
      artifact({ id: 'artifact-3', kind: 'app', uri: '', meta: { app: 'nullclaw/support-portal' } }),
    );
    expect(app.type).toBe('app');
    expect(app.app).toEqual({ component: 'nullclaw', name: 'support-portal' });
  });
});

describe('app result links', () => {
  test('builds space-scoped instance links for app results', () => {
    const result = artifactToResult(
      artifact({ kind: 'app', meta: { app: { component: 'nullclaw', name: 'support portal' } } }),
    );
    expect(appResultHref(result, 'ops')).toBe('/instances/nullclaw/support%20portal?space=ops');
    expect(appResultHref(result)).toBe('/instances/nullclaw/support%20portal');
  });

  test('returns no link for non-app results', () => {
    expect(appResultHref(deliverableToResult(task()))).toBeUndefined();
  });
});

describe('merge and filter', () => {
  test('dedupes by id and sorts newest first', () => {
    const deliverables = ticketDeliverablesToResults([
      task({ id: 'task-old', title: 'Old deliverable', updated_at_ms: nowMs - 60 * 60_000 }),
      task({ id: 'task-new', title: 'New deliverable', updated_at_ms: nowMs - 60_000 }),
    ]);
    const artifacts = artifactsToResults([artifact({ id: 'artifact-mid', created_at_ms: nowMs - 10 * 60_000 })]);
    const merged = mergeResults([deliverables, artifacts, deliverables]);

    expect(merged.map((result) => result.id)).toEqual([
      'deliverable:task-new',
      'artifact:artifact-mid',
      'deliverable:task-old',
    ]);
  });

  test('filters by lifecycle, source, and query', () => {
    const results = mergeResults([
      ticketDeliverablesToResults([task({ id: 'task-review', stage: 'review', title: 'Playbook draft' })]),
      artifactsToResults([artifact({ id: 'artifact-done', meta: { lifecycle: 'delivered', title: 'Landing page' } })]),
    ]);

    expect(filterResults(results, { lifecycle: 'review' }).map((result) => result.title)).toEqual(['Playbook draft']);
    expect(filterResults(results, { source: 'artifact' }).map((result) => result.title)).toEqual(['Landing page']);
    expect(filterResults(results, { query: 'landing' }).map((result) => result.title)).toEqual(['Landing page']);
    expect(filterResults(results)).toHaveLength(2);
  });

  test('builds filter options from the present lifecycles and sources', () => {
    const results = mergeResults([
      ticketDeliverablesToResults([task({ id: 'task-review', stage: 'review' })]),
      artifactsToResults([artifact({ id: 'artifact-done', meta: { lifecycle: 'delivered' } })]),
    ]);

    expect(resultLifecycleOptions(results)).toEqual([
      { value: 'review', label: 'In review' },
      { value: 'delivered', label: 'Delivered' },
    ]);
    expect(resultSourceOptions(results)).toEqual([
      { value: 'deliverable', label: 'Ticket deliverable' },
      { value: 'artifact', label: 'Run artifact' },
    ]);
  });
});

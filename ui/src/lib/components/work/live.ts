import type { NullHubEvent } from '$lib/api/client';
import { detailHref } from '$lib/components/loops/loopRunDetail';
import { nullboilerUiRoutes } from '$lib/nullboiler/routes';
import {
  attemptNumber,
  formatStatus,
  rowBucket,
  rowFailureReason,
  rowTime,
  shortId,
  taskTime,
  workerId,
} from '$lib/loops/data';
import type { LoopRunRow, LoopTask, RunBucket } from '$lib/loops/types';

export type LiveRunSource = 'loop' | 'workflow' | 'agent';
export type LiveRunBucket = RunBucket | 'stalled';
export type LiveWatchState = 'observed' | 'unobserved' | 'unavailable';

export type LiveRun = {
  id: string;
  source: LiveRunSource;
  title: string;
  summary: string;
  owner: string;
  ownerLabel: string;
  status: string;
  bucket: LiveRunBucket;
  surfaceLabel: string;
  startedAtMs: number | null;
  updatedAtMs: number | null;
  durationMs: number | null;
  attempt?: number;
  href?: string;
  evidenceRef?: string;
  watchState: LiveWatchState;
  stalled: boolean;
  stallReason?: string;
  raw?: unknown;
};

export type LiveWatchContext = {
  running: boolean;
  selectedWatch?: string;
  observedRunIds?: Set<string>;
};

export type LiveFilterOption = {
  label: string;
  value: string;
};

export type LiveRunFilters = {
  query?: string;
  source?: string;
  bucket?: string;
  owner?: string;
};

export const liveRefreshIntervalMs = 5_000;
export const liveStallThresholdMs = 10 * 60 * 1000;

const activeStatuses = new Set(['running', 'pending', 'queued', 'leased', 'in_progress', 'started', 'starting']);
const completedStatuses = new Set(['completed', 'succeeded', 'success', 'done', 'pass']);
const attentionStatuses = new Set([
  'failed',
  'interrupted',
  'blocked',
  'cancelled',
  'canceled',
  'error',
  'stale',
  'dead',
  'fail',
]);

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const text = stringValue(value);
    if (text) return text;
  }
  return '';
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const numeric = numberValue(value);
    if (numeric !== null) return numeric;
  }
  return null;
}

export function liveLabel(value: string, fallback = 'Unknown'): string {
  const text = value.trim().replace(/[-_.]+/g, ' ');
  if (!text) return fallback;
  return text.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function liveBucket(status: string): LiveRunBucket {
  const normalized = status.trim().toLowerCase();
  if (attentionStatuses.has(normalized)) return 'attention';
  if (activeStatuses.has(normalized)) return 'active';
  if (completedStatuses.has(normalized)) return 'completed';
  return 'other';
}

function isActiveBucket(bucket: LiveRunBucket): boolean {
  return bucket === 'active';
}

function watchStateFor(runId: string, watch: LiveWatchContext): LiveWatchState {
  if (!watch.running) return 'unavailable';
  return watch.observedRunIds?.has(runId) ? 'observed' : 'unobserved';
}

export function detectLiveStall(
  input: {
    id: string;
    bucket: LiveRunBucket;
    updatedAtMs?: number | null;
    startedAtMs?: number | null;
    watchState?: LiveWatchState;
  },
  nowMs = Date.now(),
): { stalled: boolean; bucket: LiveRunBucket; reason?: string } {
  if (input.bucket === 'attention' || input.bucket === 'stalled') {
    return { stalled: true, bucket: 'stalled', reason: 'Run already needs attention.' };
  }
  if (!isActiveBucket(input.bucket)) return { stalled: false, bucket: input.bucket };

  const lastSeen = input.updatedAtMs || input.startedAtMs || 0;
  if (!lastSeen || nowMs - lastSeen < liveStallThresholdMs) {
    return { stalled: false, bucket: input.bucket };
  }
  if (input.watchState === 'observed') return { stalled: false, bucket: input.bucket };
  if (input.watchState === 'unavailable') {
    return { stalled: false, bucket: input.bucket };
  }
  return { stalled: true, bucket: 'stalled', reason: 'Active run is not visible in the selected NullWatch stream.' };
}

function finalizeLiveRun(run: Omit<LiveRun, 'stalled' | 'stallReason'>, nowMs: number): LiveRun {
  const stall = detectLiveStall(run, nowMs);
  return {
    ...run,
    bucket: stall.bucket,
    stalled: stall.stalled,
    stallReason: stall.reason,
  };
}

export function loopRunsToLiveRuns(
  rows: LoopRunRow[],
  watch: LiveWatchContext = { running: false },
  nowMs = Date.now(),
  options: { ticketsInstance?: string; spaceId?: string | null } = {},
): LiveRun[] {
  return rows.map((row) => {
    const status = formatStatus(row.run.status);
    const bucket = rowBucket(row);
    const updatedAtMs = row.run.ended_at_ms || row.run.started_at_ms || taskTime(row.task) || null;
    const startedAtMs = row.run.started_at_ms || taskTime(row.task) || null;
    const runId = String(row.run.id || row.task.id);
    const title = row.task.title || row.pipeline?.name || shortId(row.task.pipeline_id);
    const watchState = watchStateFor(runId, watch);
    return finalizeLiveRun(
      {
        id: `loop:${runId}`,
        source: 'loop',
        title,
        summary: row.task.dead_letter_reason || row.run.error_text || row.task.description || `${row.pipeline?.name || 'Loop'} task`,
        owner: workerId(row),
        ownerLabel: 'Agent',
        status,
        bucket,
        surfaceLabel: 'Work evidence',
        startedAtMs,
        updatedAtMs,
        durationMs: startedAtMs ? Math.max(0, (row.run.ended_at_ms || nowMs) - startedAtMs) : null,
        attempt: attemptNumber(row),
        href: detailHref(row, options.ticketsInstance, options.spaceId),
        evidenceRef: row.run.error_text || row.task.dead_letter_reason ? rowFailureReason(row) : undefined,
        watchState,
        raw: row,
      },
      nowMs,
    );
  });
}

export function workflowRunsToLiveRuns(
  runs: Record<string, unknown>[],
  watch: LiveWatchContext = { running: false },
  nowMs = Date.now(),
  options: { boilerInstance?: string } = {},
): LiveRun[] {
  return runs.map((run) => {
    const workflow = run.workflow && typeof run.workflow === 'object' ? (run.workflow as Record<string, unknown>) : {};
    const id = firstString(run.id, run.run_id) || 'workflow-run';
    const status = firstString(run.status, run.state, run.overall_verdict) || 'unknown';
    const startedAtMs = firstNumber(run.started_at_ms, run.started_at, run.created_at_ms, run.created_at);
    const updatedAtMs = firstNumber(run.updated_at_ms, run.updated_at, run.ended_at_ms, run.completed_at, run.completed_at_ms) || startedAtMs;
    const completedAtMs = firstNumber(run.ended_at_ms, run.completed_at, run.completed_at_ms);
    const workflowName = firstString(run.workflow_name, run.workflow_id, workflow.name, workflow.id);
    const owner = firstString(run.worker_id, run.agent_id, run.owner, run.created_by) || 'NullBoiler';
    const watchState = watchStateFor(id, watch);
    return finalizeLiveRun(
      {
        id: `workflow:${id}`,
        source: 'workflow',
        title: workflowName || shortId(id),
        summary: firstString(run.interrupt_message, run.error_text, run.message) || `Workflow run ${shortId(id)}`,
        owner,
        ownerLabel: 'Worker',
        status: formatStatus(status),
        bucket: liveBucket(status),
        surfaceLabel: 'Graph execution',
        startedAtMs,
        updatedAtMs,
        durationMs: startedAtMs ? Math.max(0, (completedAtMs || nowMs) - startedAtMs) : null,
        href: id ? nullboilerUiRoutes.run(id, { boilerInstance: options.boilerInstance || '' }) : undefined,
        evidenceRef: firstString(run.checkpoint_id, run.trace_id, run.evidence_ref) || undefined,
        watchState,
        raw: run,
      },
      nowMs,
    );
  });
}

export function agentEventsToLiveRuns(events: NullHubEvent[], nowMs = Date.now()): LiveRun[] {
  const agentEvents = events.filter((event) => event.source !== 'nulltickets' && event.source !== 'nullboiler');
  return agentEvents.slice(0, 8).map((event) => {
    const payload = event.payload && typeof event.payload === 'object' ? (event.payload as Record<string, unknown>) : {};
    const owner = firstString(payload.agent, payload.agent_id, payload.actor, payload.actor_id, payload.worker) || 'Agent';
    const status = firstString(payload.status, event.severity) || 'info';
    const subject = [liveLabel(event.subjectType || '', ''), event.subjectId].filter(Boolean).join(' ');
    return finalizeLiveRun(
      {
        id: `agent-event:${event.id}`,
        source: 'agent',
        title: event.title || subject || liveLabel(event.type, 'Agent update'),
        summary: event.summary || event.type,
        owner,
        ownerLabel: 'Agent',
        status: formatStatus(status),
        bucket: event.severity === 'error' || event.severity === 'warning' ? 'attention' : liveBucket(status),
        surfaceLabel: 'Agent work',
        startedAtMs: event.createdAtMs || null,
        updatedAtMs: event.createdAtMs || null,
        durationMs: null,
        href: '/work/activity',
        evidenceRef: event.evidenceRef || undefined,
        watchState: 'unavailable',
        raw: event,
      },
      nowMs,
    );
  });
}

export function waitingTasksToLiveRuns(tasks: LoopTask[], nowMs = Date.now()): LiveRun[] {
  return tasks.map((task) => {
    const metadata = task.metadata || {};
    const updatedAtMs = taskTime(task) || null;
    return finalizeLiveRun(
      {
        id: `agent-task:${task.id}`,
        source: 'agent',
        title: task.title || shortId(task.id),
        summary: task.description || 'Queued ticket waiting for an agent.',
        owner: firstString(metadata.agent, metadata.agent_id, metadata.owner) || 'Unassigned',
        ownerLabel: 'Assignee',
        status: formatStatus(task.stage || 'queued'),
        bucket: task.dead_letter_reason ? 'attention' : 'active',
        surfaceLabel: 'Agent work',
        startedAtMs: task.created_at_ms || null,
        updatedAtMs,
        durationMs: null,
        href: '/work/tasks',
        evidenceRef: task.dead_letter_reason || undefined,
        watchState: 'unavailable',
        raw: task,
      },
      nowMs,
    );
  });
}

export function mergeLiveRuns(groups: LiveRun[][]): LiveRun[] {
  const seen = new Set<string>();
  const merged: LiveRun[] = [];
  for (const group of groups) {
    for (const run of group) {
      if (seen.has(run.id)) continue;
      seen.add(run.id);
      merged.push(run);
    }
  }
  return merged.sort((a, b) => {
    const aTime = a.updatedAtMs || a.startedAtMs || 0;
    const bTime = b.updatedAtMs || b.startedAtMs || 0;
    return bTime - aTime || a.title.localeCompare(b.title);
  });
}

export function liveSearchText(run: LiveRun): string {
  return [
    run.title,
    run.summary,
    run.owner,
    run.ownerLabel,
    run.status,
    run.source,
    run.surfaceLabel,
    run.evidenceRef,
    run.stallReason,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function filterLiveRuns(runs: LiveRun[], filters: LiveRunFilters = {}): LiveRun[] {
  const query = filters.query?.trim().toLowerCase() ?? '';
  const source = filters.source?.trim() ?? '';
  const bucket = filters.bucket?.trim() ?? '';
  const owner = filters.owner?.trim() ?? '';
  return runs.filter((run) => {
    if (query && !liveSearchText(run).includes(query)) return false;
    if (source && run.source !== source) return false;
    if (bucket && run.bucket !== bucket) return false;
    if (owner && run.owner !== owner) return false;
    return true;
  });
}

function uniqueOptions(values: string[]): LiveFilterOption[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .sort((a, b) => liveLabel(a).localeCompare(liveLabel(b)))
    .map((value) => ({ value, label: liveLabel(value) }));
}

export function liveSourceOptions(runs: LiveRun[]): LiveFilterOption[] {
  return uniqueOptions(runs.map((run) => run.source));
}

export function liveBucketOptions(runs: LiveRun[]): LiveFilterOption[] {
  return uniqueOptions(runs.map((run) => run.bucket));
}

export function liveOwnerOptions(runs: LiveRun[]): LiveFilterOption[] {
  return uniqueOptions(runs.map((run) => run.owner));
}

export function formatLiveTime(value: number | null | undefined, nowMs = Date.now()): string {
  if (!value) return 'Time unavailable';
  const elapsedMs = Math.max(0, nowMs - value);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (elapsedMs < minute) return 'Just now';
  if (elapsedMs < hour) return `${Math.floor(elapsedMs / minute)}m ago`;
  if (elapsedMs < day) return `${Math.floor(elapsedMs / hour)}h ago`;
  if (elapsedMs < 7 * day) return `${Math.floor(elapsedMs / day)}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  );
}

export function formatLiveDuration(value: number | null | undefined): string {
  if (!value) return '-';
  const seconds = Math.max(0, Math.floor(value / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

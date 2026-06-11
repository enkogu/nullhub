import { api } from "$lib/api/client";
import { loopMeta } from "./templates";
import type { LoopPipeline, LoopRunRow, LoopSummary, LoopTask, RunBucket } from "./types";

export const ticketsComponent = "nulltickets";

export const activeRunStatuses = new Set(["running", "pending", "queued", "leased", "in_progress", "started"]);
export const attentionRunStatuses = new Set(["failed", "interrupted", "blocked", "cancelled", "error", "stale"]);
export const completedRunStatuses = new Set(["completed", "succeeded", "success", "done"]);

const terminalStages = new Set(["done", "completed", "failed", "blocked", "dead", "cancelled"]);
const maxTaskScan = 200;
const maxDetailedTasks = 28;

export function runBucket(status?: string | null): RunBucket {
  const normalized = String(status || "").toLowerCase();
  if (activeRunStatuses.has(normalized)) return "active";
  if (attentionRunStatuses.has(normalized)) return "attention";
  if (completedRunStatuses.has(normalized)) return "completed";
  return "other";
}

export function rowBucket(row: LoopRunRow): RunBucket {
  if (row.task.dead_letter_reason) return "attention";
  return runBucket(row.run.status);
}

export function taskNeedsAttention(task: LoopTask): boolean {
  const stage = String(task.stage || "").toLowerCase();
  return Boolean(task.dead_letter_reason) || ["failed", "blocked", "dead", "stale", "error"].includes(stage);
}

export function isTerminalStage(stage?: string): boolean {
  return terminalStages.has(String(stage || "").toLowerCase());
}

export function taskTime(task: LoopTask): number {
  return Number(task.updated_at_ms || task.created_at_ms || 0);
}

export function rowTime(row: LoopRunRow): number {
  return Number(row.run.ended_at_ms || row.run.started_at_ms || taskTime(row.task));
}

export type LoopsState = {
  pipelines: LoopPipeline[];
  tasks: LoopTask[];
  rows: LoopRunRow[];
  queue: LoopTask[];
  loops: LoopSummary[];
  detailError: string;
};

export function emptyLoopsState(): LoopsState {
  return { pipelines: [], tasks: [], rows: [], queue: [], loops: [], detailError: "" };
}

function pipelinesFrom(result: unknown): LoopPipeline[] {
  const value = result as { pipelines?: unknown; items?: unknown } | null;
  if (Array.isArray(result)) return result as LoopPipeline[];
  if (Array.isArray(value?.pipelines)) return value.pipelines as LoopPipeline[];
  if (Array.isArray(value?.items)) return value.items as LoopPipeline[];
  return [];
}

/**
 * Cache of task details keyed by `${id}:${updated_at_ms}`. Terminal tasks are
 * cached because their latest run can no longer change; non-terminal tasks are
 * always refetched since claims and runs do not bump task timestamps.
 */
export type TaskDetailCache = Map<string, LoopTask>;

function detailCacheKey(task: LoopTask): string {
  return `${task.id}:${task.updated_at_ms || 0}`;
}

function prioritizedTaskCandidates(source: LoopTask[]): LoopTask[] {
  const newest = [...source].sort((a, b) => taskTime(b) - taskTime(a));
  const attention = newest.filter(taskNeedsAttention).slice(0, 8);
  const seen = new Set<string>();
  const selected: LoopTask[] = [];
  for (const task of [...attention, ...newest]) {
    if (!task.id || seen.has(task.id)) continue;
    seen.add(task.id);
    selected.push(task);
    if (selected.length >= maxDetailedTasks) break;
  }
  return selected;
}

async function fetchTaskDetail(instance: string, task: LoopTask, cache: TaskDetailCache): Promise<LoopTask> {
  const key = detailCacheKey(task);
  const cached = cache.get(key);
  if (cached && isTerminalStage(cached.stage)) return cached;
  try {
    const detail = await api.nullTicketsGetTask(ticketsComponent, instance, task.id);
    cache.set(key, detail);
    return detail;
  } catch {
    return cached || task;
  }
}

function isWaitingTask(task: LoopTask, taskIdsWithRuns: Set<string>): boolean {
  return !isTerminalStage(task.stage) && !taskNeedsAttention(task) && !taskIdsWithRuns.has(task.id);
}

function summarizeLoops(pipelines: LoopPipeline[], listTasks: LoopTask[], rows: LoopRunRow[]): LoopSummary[] {
  const rowsByPipeline = new Map<string, LoopRunRow[]>();
  for (const row of rows) {
    const group = rowsByPipeline.get(row.task.pipeline_id) || [];
    group.push(row);
    rowsByPipeline.set(row.task.pipeline_id, group);
  }
  const taskIdsWithRuns = new Set(rows.map((row) => row.task.id));

  return pipelines
    .map((pipeline) => {
      const pipelineTasks = listTasks.filter((task) => task.pipeline_id === pipeline.id);
      const pipelineRows = rowsByPipeline.get(pipeline.id) || [];
      const lastRow = [...pipelineRows].sort((a, b) => rowTime(b) - rowTime(a))[0] || null;
      return {
        pipeline,
        meta: loopMeta(pipeline),
        waiting: pipelineTasks.filter((task) => isWaitingTask(task, taskIdsWithRuns)).length,
        active: pipelineRows.filter((row) => rowBucket(row) === "active").length,
        attention: pipelineTasks.filter(taskNeedsAttention).length,
        done: pipelineTasks.filter((task) => ["done", "completed"].includes(String(task.stage || "").toLowerCase())).length,
        lastRow,
      };
    })
    .sort((a, b) => {
      const aTime = a.lastRow ? rowTime(a.lastRow) : Number(a.pipeline.created_at_ms || 0);
      const bTime = b.lastRow ? rowTime(b.lastRow) : Number(b.pipeline.created_at_ms || 0);
      return bTime - aTime;
    });
}

export async function loadLoopsState(instance: string, cache: TaskDetailCache): Promise<LoopsState> {
  const state = emptyLoopsState();

  const pipelinesResult = await api.nullTicketsPipelines(ticketsComponent, instance);
  state.pipelines = pipelinesFrom(pipelinesResult);

  let listTasks: LoopTask[] = [];
  try {
    const tasksResult = await api.nullTicketsTasks(ticketsComponent, instance, { limit: maxTaskScan });
    listTasks = Array.isArray(tasksResult?.items) ? tasksResult.items : [];
  } catch (e) {
    state.detailError = (e as Error).message;
  }

  const detailed = await Promise.all(
    prioritizedTaskCandidates(listTasks).map((task) => fetchTaskDetail(instance, task, cache)),
  );
  state.tasks = detailed;

  state.rows = detailed
    .filter((task) => task.latest_run?.id)
    .map((task) => ({
      task,
      run: task.latest_run!,
      pipeline: state.pipelines.find((pipeline) => pipeline.id === task.pipeline_id),
    }))
    .sort((a, b) => rowTime(b) - rowTime(a));

  const taskIdsWithRuns = new Set(state.rows.map((row) => row.task.id));
  state.queue = listTasks
    .filter((task) => isWaitingTask(task, taskIdsWithRuns))
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || taskTime(b) - taskTime(a));

  state.loops = summarizeLoops(state.pipelines, listTasks, state.rows);
  return state;
}

export function formatStatus(value?: string | null): string {
  return String(value || "unknown").replaceAll("_", " ");
}

export function badgeVariant(value: string): "success" | "warning" | "destructive" | "muted" | "outline" {
  const normalized = String(value || "").toLowerCase();
  if (["ok", "running", "completed", "succeeded", "success", "done"].includes(normalized)) return "success";
  if (["pending", "queued", "leased", "in_progress", "started", "idle", "waiting"].includes(normalized)) return "warning";
  if (["failed", "error", "blocked", "interrupted", "cancelled", "stale", "dead"].includes(normalized)) return "destructive";
  return "muted";
}

export function formatMs(ts?: number | null): string {
  if (!ts) return "-";
  const date = new Date(ts);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatDuration(row: LoopRunRow): string {
  const start = Number(row.run.started_at_ms || 0);
  const end = Number(row.run.ended_at_ms || Date.now());
  if (!start || !Number.isFinite(start) || !Number.isFinite(end)) return "-";
  const secs = Math.max(0, Math.floor((end - start) / 1000));
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

export function attemptNumber(row: LoopRunRow): number {
  const attempt = Number(row.run.attempt || 1);
  return Number.isFinite(attempt) && attempt > 0 ? attempt : 1;
}

export function shortId(value?: string | null): string {
  return value ? value.slice(0, 8) : "-";
}

export function loopDisplayName(row: LoopRunRow): string {
  return row.pipeline?.name || shortId(row.task.pipeline_id);
}

export function workerId(row: LoopRunRow): string {
  return row.run.agent_id || "-";
}

export function rowFailureReason(row: LoopRunRow): string {
  return row.run.error_text || row.task.dead_letter_reason || formatStatus(row.run.status);
}

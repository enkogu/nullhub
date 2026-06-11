import {
  badgeVariant,
  formatMs,
  formatStatus,
  rowBucket,
  rowFailureReason,
  rowTime,
  taskTime,
} from "$lib/loops/data";
import type { LoopArtifact, LoopPipeline, LoopRunEvent, LoopRunRow, LoopTask } from "$lib/loops/types";

export type BadgeVariant = "success" | "warning" | "destructive" | "muted" | "outline";

export type LoopRunDetailEntry = {
  task: LoopTask;
  run?: LoopRunRow["run"];
  pipeline?: LoopPipeline;
};

export type LoopRunDetailData = {
  events: LoopRunEvent[];
  artifacts: LoopArtifact[];
};

export type LoopAgentResult = {
  instanceName: string;
  sessionId: string;
  content: string;
  createdAt?: string;
};

export function entryBucket(entry: LoopRunDetailEntry): "active" | "waiting" | "attention" | "completed" {
  if (!entry.run) return "waiting";
  const bucket = rowBucket(entry as LoopRunRow);
  return bucket === "other" ? "completed" : bucket;
}

export function entryTime(entry: LoopRunDetailEntry): number {
  return entry.run ? rowTime(entry as LoopRunRow) : taskTime(entry.task);
}

export function entryStatus(entry: LoopRunDetailEntry): string {
  if (!entry.run) return "waiting";
  if (entry.task.dead_letter_reason) return "dead letter";
  return formatStatus(entry.run.status);
}

export function entryBadge(entry: LoopRunDetailEntry): BadgeVariant {
  if (!entry.run) return "warning";
  if (entry.task.dead_letter_reason) return "destructive";
  return badgeVariant(entry.run.status);
}

export function loopName(entry: LoopRunDetailEntry): string {
  return entry.pipeline?.name || entry.task.pipeline_id.slice(0, 8);
}

export function formatBytes(bytes?: number | null): string {
  const value = Number(bytes || 0);
  if (!value || !Number.isFinite(value)) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function eventLabel(event: LoopRunEvent): string {
  if (event.kind === "transition") {
    return `stage ${event.data?.from || "?"} -> ${event.data?.to || "?"}`;
  }
  if (event.kind === "dispatch_started") return "agent dispatched";
  if (event.kind === "dispatch_completed") {
    const bytes = formatBytes(event.data?.output_bytes);
    return bytes ? `agent finished · ${bytes} output` : "agent finished";
  }
  if (event.kind === "claimed" || event.kind === "lease_claimed") return "claimed by worker";
  return formatStatus(event.kind);
}

export function eventDetail(event: LoopRunEvent): string {
  const worker = event.data?.worker_id;
  const note = event.data?.error || event.data?.reason || event.data?.note;
  return [worker, note].filter(Boolean).join(" · ");
}

export function detailWorkerInstance(events: LoopRunEvent[], entry: LoopRunDetailEntry, fallback: string): string {
  for (const event of events) {
    const worker = event.data?.worker_id;
    if (typeof worker === "string" && worker.startsWith("nullclaw-")) {
      return worker.slice("nullclaw-".length);
    }
  }
  const agent = entry.run?.agent_id || "";
  if (agent.startsWith("nullclaw-")) return agent.slice("nullclaw-".length);
  return fallback;
}

export function detailFailureReason(entry: LoopRunDetailEntry): string {
  return entry.run ? rowFailureReason(entry as LoopRunRow) : "";
}

export { formatMs };

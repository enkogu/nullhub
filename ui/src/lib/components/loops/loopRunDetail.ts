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

export type LoopHistoryApi = {
  getHistory: (
    component: string,
    instance: string,
    params?: { sessionId?: string; limit?: number; offset?: number },
  ) => Promise<any>;
};

export type LoopRunCheckOutput = {
  content: string;
  language: string;
  source: string;
};

export type LoopRunDecision = {
  id: string;
  title: string;
  verdict: string;
  reason: string;
  actor: string;
  tsMs?: number | null;
};

export type LoopRunCostSummary = {
  available: boolean;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requests: number;
  costUsd: number | null;
  model: string;
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

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function objectValue(value: unknown): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, any>;
    } catch {
      return {};
    }
  }
  return {};
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const text = stringValue(value);
    if (text) return text;
  }
  return "";
}

function identifierPattern(value: string): RegExp {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_.:-])${escaped}([^A-Za-z0-9_.:-]|$)`);
}

function containsIdentifier(content: unknown, value: string): boolean {
  const text = stringValue(content);
  return Boolean(value && text && identifierPattern(value).test(text));
}

function identifierPrefix(value: string): string {
  const delimiterIndex = Math.max(value.lastIndexOf("-"), value.lastIndexOf("_"), value.lastIndexOf(":"), value.lastIndexOf("."));
  return delimiterIndex > 0 ? value.slice(0, delimiterIndex + 1) : "";
}

function mentionsDifferentPrefixedIdentifier(content: unknown, value: string): boolean {
  const prefix = identifierPrefix(value);
  if (!prefix) return false;
  const tokens = stringValue(content).match(/[A-Za-z0-9_.:-]+/g) || [];
  return tokens.some((token) => token.startsWith(prefix) && token !== value);
}

function assistantAfterIdentifier(messages: any[], identifier: string, options: { rejectDifferentRunId?: string } = {}): any | null {
  if (!identifier) return null;
  for (let index = 0; index < messages.length; index += 1) {
    const current = messages[index];
    if (current.role !== "user" || !containsIdentifier(current.content, identifier)) continue;
    if (options.rejectDifferentRunId && mentionsDifferentPrefixedIdentifier(current.content, options.rejectDifferentRunId)) continue;
    const assistant = messages.slice(index + 1).find((candidate: any) => candidate.role === "assistant");
    if (assistant?.content) return assistant;
  }
  return null;
}

function dataObjects(detail: LoopRunDetailData, entry?: LoopRunDetailEntry | null): { id: string; tsMs?: number | null; data: Record<string, any> }[] {
  const items: { id: string; tsMs?: number | null; data: Record<string, any> }[] = [];
  if (entry?.run) {
    items.push({
      id: `run:${entry.run.id}`,
      data: {
        ...(entry.run as Record<string, any>),
        usage: objectValue((entry.run as Record<string, any>).usage || (entry.run as Record<string, any>).usage_json),
      },
    });
  }
  for (const event of detail.events) {
    items.push({ id: `event:${event.id}`, tsMs: event.ts_ms, data: { ...(event.data || {}), kind: event.kind } });
  }
  for (const artifact of detail.artifacts) {
    items.push({
      id: `artifact:${artifact.id}`,
      tsMs: artifact.created_at_ms,
      data: { ...(artifact.meta || {}), kind: artifact.kind, uri: artifact.uri },
    });
  }
  return items;
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

function workerInstanceCandidate(value: unknown, availableInstances: string[]): string {
  const text = stringValue(value);
  if (!text) return "";
  if (text.startsWith("nullclaw-")) return text.slice("nullclaw-".length);
  return availableInstances.includes(text) ? text : "";
}

export function detailWorkerInstance(
  events: LoopRunEvent[],
  entry: LoopRunDetailEntry,
  fallback: string,
  availableInstances: string[] = [],
): string {
  for (const event of events) {
    const worker = workerInstanceCandidate(event.data?.worker_id, availableInstances);
    if (worker) return worker;
  }
  const agent = workerInstanceCandidate(entry.run?.agent_id, availableInstances);
  if (agent) return agent;
  return fallback;
}

export async function loadLoopAgentResult(
  historyApi: LoopHistoryApi,
  entry: LoopRunDetailEntry,
  events: LoopRunEvent[],
  fallbackInstance: string,
  availableInstances: string[] = [],
): Promise<LoopAgentResult | null> {
  if (!entry.run?.id) return null;
  const instanceName = detailWorkerInstance(events, entry, fallbackInstance, availableInstances);
  const runId = entry.run.id;
  const sessionList = await historyApi.getHistory("nullclaw", instanceName, { limit: 12 });
  const sessions = Array.isArray(sessionList?.sessions) ? sessionList.sessions : [];
  const sessionIds = sessions
    .map((session: any) => session.session_id)
    .filter((sessionId: unknown): sessionId is string => Boolean(sessionId))
    .sort((a: string, b: string) => Number(b.startsWith("webhook:")) - Number(a.startsWith("webhook:")));
  const fallbackSessionId = "webhook:local-nullboiler-worker";
  const primarySessionIds = sessionIds.slice(0, 4);
  const candidateSessionIds = primarySessionIds.includes(fallbackSessionId)
    ? primarySessionIds
    : [...primarySessionIds, fallbackSessionId];
  const messagesBySession = new Map<string, any[]>();

  async function messagesFor(sessionId: string): Promise<any[]> {
    if (messagesBySession.has(sessionId)) return messagesBySession.get(sessionId) || [];
    const history = await historyApi.getHistory("nullclaw", instanceName, { sessionId, limit: 100 });
    const messages = Array.isArray(history?.messages) ? history.messages : [];
    messagesBySession.set(sessionId, messages);
    return messages;
  }

  for (const [identifier, options] of [
    [runId, {}],
    [entry.task.id, { rejectDifferentRunId: runId }],
  ] as const) {
    for (const sessionId of candidateSessionIds) {
      const assistant = assistantAfterIdentifier(await messagesFor(sessionId), identifier, options);
      if (!assistant) continue;
      return {
        instanceName,
        sessionId,
        content: assistant.content,
        createdAt: assistant.created_at,
      };
    }
  }
  return null;
}

export function detailFailureReason(entry: LoopRunDetailEntry): string {
  return entry.run ? rowFailureReason(entry as LoopRunRow) : "";
}

export function detailHref(entry: LoopRunDetailEntry, ticketsInstance?: string, spaceId?: string | null): string {
  if (!entry.run?.id) return "/work/loops/runs";
  const params = new URLSearchParams({ task_id: entry.task.id });
  if (ticketsInstance) params.set("tickets_instance", ticketsInstance);
  if (spaceId) params.set("space", spaceId);
  return `/work/runs/${encodeURIComponent(entry.run.id)}?${params.toString()}`;
}

export function extractCheckOutput(
  detail: LoopRunDetailData,
  entry?: LoopRunDetailEntry | null,
  agentResult?: LoopAgentResult | null,
): LoopRunCheckOutput | null {
  for (const item of dataObjects(detail, entry).reverse()) {
    const content = firstString(
      item.data.check_output,
      item.data.checkOutput,
      item.data.output_text,
      item.data.outputText,
      item.data.output,
      item.data.result,
      item.data.response,
      item.data.content,
      item.data.text,
      item.data.markdown,
    );
    if (!content) continue;
    const kind = firstString(item.data.kind, item.data.type);
    if (kind && !/(check|output|result|dispatch|agent|completion)/i.test(kind)) continue;
    return {
      content,
      language: firstString(item.data.language, item.data.format) || "text",
      source: firstString(item.data.source, kind, item.id),
    };
  }
  if (agentResult?.content?.trim()) {
    return { content: agentResult.content.trim(), language: "markdown", source: `Agent result · ${agentResult.instanceName}` };
  }
  return null;
}

export function extractJudgeDecisions(detail: LoopRunDetailData): LoopRunDecision[] {
  const decisions: LoopRunDecision[] = [];
  for (const item of dataObjects(detail)) {
    const kind = firstString(item.data.kind, item.data.type);
    const verdict = firstString(item.data.verdict, item.data.decision, item.data.status, item.data.approved);
    const explicitDecision = /(judge|decision|approval|review|verdict)/i.test(kind) || Boolean(item.data.decision || item.data.verdict);
    if (!explicitDecision) continue;
    decisions.push({
      id: item.id,
      title: firstString(item.data.title, item.data.name, kind) || "Judge decision",
      verdict: verdict || "recorded",
      reason: firstString(item.data.reason, item.data.rationale, item.data.message, item.data.note, item.data.summary),
      actor: firstString(item.data.judge, item.data.actor, item.data.worker_id, item.data.agent, item.data.reviewer) || "Judge",
      tsMs: item.tsMs,
    });
  }
  return decisions;
}

export function summarizeCost(detail: LoopRunDetailData, entry?: LoopRunDetailEntry | null): LoopRunCostSummary {
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let requests = 0;
  let costUsd = 0;
  let hasCost = false;
  let model = "";
  const items = dataObjects(detail, entry);
  const hasExplicitRequests = items.some((item) => {
    const usageObject = objectValue(item.data.usage);
    const usageJsonObject = objectValue(item.data.usage_json);
    return item.data.requests != null || usageObject.requests != null || usageJsonObject.requests != null;
  });

  for (const item of items) {
    const usageObject = objectValue(item.data.usage);
    const usageJsonObject = objectValue(item.data.usage_json);
    const usage: Record<string, any> = {
      ...usageObject,
      ...usageJsonObject,
      prompt_tokens: item.data.prompt_tokens ?? usageObject.prompt_tokens ?? usageJsonObject.prompt_tokens,
      completion_tokens: item.data.completion_tokens ?? usageObject.completion_tokens ?? usageJsonObject.completion_tokens,
      total_tokens: item.data.total_tokens ?? usageObject.total_tokens ?? usageJsonObject.total_tokens,
      cost_usd:
        item.data.cost_usd ??
        item.data.total_cost_usd ??
        usageObject.cost_usd ??
        usageObject.total_cost_usd ??
        usageJsonObject.cost_usd ??
        usageJsonObject.total_cost_usd,
      requests: item.data.requests ?? usageObject.requests ?? usageJsonObject.requests,
      model: item.data.model ?? usageObject.model ?? usageJsonObject.model,
    };
    const prompt = numberValue(usage.prompt_tokens || usage.input_tokens);
    const completion = numberValue(usage.completion_tokens || usage.output_tokens);
    const total = numberValue(usage.total_tokens) || prompt + completion;
    const itemCost = numberValue(usage.cost_usd || usage.total_cost_usd);
    const itemRequests = numberValue(usage.requests) || (!hasExplicitRequests && (total > 0 || itemCost > 0) ? 1 : 0);
    promptTokens += prompt;
    completionTokens += completion;
    totalTokens += total;
    requests += itemRequests;
    if (itemCost > 0) {
      costUsd += itemCost;
      hasCost = true;
    }
    model ||= firstString(usage.model, usage.provider_model);
  }

  return {
    available: promptTokens > 0 || completionTokens > 0 || totalTokens > 0 || requests > 0 || hasCost,
    promptTokens,
    completionTokens,
    totalTokens,
    requests,
    costUsd: hasCost ? costUsd : null,
    model,
  };
}

export function formatTokens(tokens: number | undefined | null): string {
  return tokens ? tokens.toLocaleString() : "0";
}

export function formatCost(cost: number | undefined | null): string {
  if (cost == null) return "Unknown";
  if (cost === 0) return "$0.000";
  return `$${cost.toFixed(cost < 0.01 ? 4 : 3)}`;
}

export { formatMs };

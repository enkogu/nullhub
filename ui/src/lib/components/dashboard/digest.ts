export type DigestUsageTotals = {
  total_cost_usd?: number;
  cost_usd?: number;
  spend_usd?: number;
  total_spend_usd?: number;
  amount_usd?: number;
};

export type DigestUsageBucket = DigestUsageTotals & {
  bucket_start?: number;
  bucketStart?: number;
};

export type DigestUsagePayload = {
  totals?: DigestUsageTotals;
  by_instance?: DigestUsageTotals[];
  by_model?: DigestUsageTotals[];
  timeseries?: DigestUsageBucket[];
};

export type DigestSummary = {
  tasksClosed: number;
  resultsAwaitingReview: number;
  ordersExecuted: number;
  spendUsd: number | null;
  eventCount: number;
  sinceMs: number;
  latestEventAtMs: number | null;
};

export type DigestEvent = {
  id: number;
  spaceId?: string;
  type: string;
  source?: string;
  subjectType: string;
  subjectId: string;
  title?: string;
  summary?: string;
  severity?: string;
  evidenceRef: string;
  createdAtMs: number;
  payload: unknown;
};

const closedTerms = new Set(['closed', 'completed', 'complete', 'finished', 'done', 'succeeded', 'success', 'delivered']);
const reviewTerms = new Set(['review', 'in_review', 'needs_review', 'awaiting_review', 'review_requested', 'qa']);
const executedTerms = new Set(['executed', 'completed', 'complete', 'finished', 'done', 'succeeded', 'success']);

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizedParts(...values: unknown[]): Set<string> {
  const parts = values
    .map(stringValue)
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return new Set(parts);
}

function hasAny(parts: Set<string>, terms: Set<string>): boolean {
  for (const part of parts) {
    if (terms.has(part)) return true;
  }
  return false;
}

function includesTerm(value: unknown, terms: Set<string>): boolean {
  const text = stringValue(value).toLowerCase();
  if (!text) return false;
  for (const term of terms) {
    if (text.includes(term)) return true;
  }
  return false;
}

function payloadText(payload: Record<string, unknown>, keys: string[]): string {
  return keys.map((key) => stringValue(payload[key])).filter(Boolean).join(' ');
}

function eventKey(event: DigestEvent, fallbackPrefix: string): string {
  return event.subjectId || event.evidenceRef || `${fallbackPrefix}:${event.id}`;
}

function isTaskClosed(event: DigestEvent): boolean {
  const payload = recordValue(event.payload);
  const subject = stringValue(event.subjectType).toLowerCase();
  const parts = normalizedParts(event.type, payloadText(payload, ['status', 'state', 'stage', 'lifecycle']));
  return subject.includes('task') && hasAny(parts, closedTerms);
}

function isResultAwaitingReview(event: DigestEvent): boolean {
  const payload = recordValue(event.payload);
  const subject = stringValue(event.subjectType).toLowerCase();
  const reviewText = payloadText(payload, ['status', 'state', 'stage', 'lifecycle', 'result_status', 'resultStatus']);
  if ((subject.includes('result') || subject.includes('deliverable') || subject.includes('artifact')) && includesTerm(reviewText, reviewTerms)) {
    return true;
  }
  return includesTerm(event.type, reviewTerms) && (subject.includes('result') || subject.includes('deliverable') || subject.includes('artifact') || subject.includes('run'));
}

function isOrderExecuted(event: DigestEvent): boolean {
  const payload = recordValue(event.payload);
  const subject = stringValue(event.subjectType).toLowerCase();
  const parts = normalizedParts(event.type, payloadText(payload, ['status', 'state', 'stage']));
  return subject.includes('order') && hasAny(parts, executedTerms);
}

function costValue(value: DigestUsageTotals | undefined): number | null {
  if (!value) return null;
  for (const candidate of [
    value.total_cost_usd,
    value.cost_usd,
    value.spend_usd,
    value.total_spend_usd,
    value.amount_usd,
  ]) {
    const parsed = numberValue(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

function aggregateCost(rows: DigestUsageTotals[] | undefined): number | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  let total = 0;
  let found = false;
  for (const row of rows) {
    const value = costValue(row);
    if (value === null) continue;
    total += value;
    found = true;
  }
  return found ? total : null;
}

function bucketStartMs(bucket: DigestUsageBucket): number {
  const raw = numberValue(bucket.bucket_start ?? bucket.bucketStart);
  if (!raw) return 0;
  return raw < 10_000_000_000 ? raw * 1000 : raw;
}

export function aggregateUsageSpend(usage: DigestUsagePayload | null | undefined, sinceMs = 0): number | null {
  const buckets = Array.isArray(usage?.timeseries) ? usage.timeseries : [];
  if (buckets.length > 0) {
    const scopedBuckets = sinceMs > 0 ? buckets.filter((bucket) => bucketStartMs(bucket) >= sinceMs) : buckets;
    const scopedCost = aggregateCost(scopedBuckets);
    if (scopedCost !== null) return scopedCost;
    if (sinceMs > 0) return 0;
  }
  return costValue(usage?.totals) ?? aggregateCost(usage?.by_instance) ?? aggregateCost(usage?.by_model);
}

export function aggregateDigest(
  events: DigestEvent[],
  usage: DigestUsagePayload | null | undefined,
  lastSeenMs: number,
): DigestSummary {
  const recentEvents = events.filter((event) => event.createdAtMs >= lastSeenMs);
  const tasksClosed = new Set<string>();
  const resultsAwaitingReview = new Set<string>();
  const ordersExecuted = new Set<string>();
  let latestEventAtMs: number | null = null;

  for (const event of recentEvents) {
    latestEventAtMs = Math.max(latestEventAtMs ?? 0, event.createdAtMs || 0);
    if (isTaskClosed(event)) tasksClosed.add(eventKey(event, 'task'));
    if (isResultAwaitingReview(event)) resultsAwaitingReview.add(eventKey(event, 'result'));
    if (isOrderExecuted(event)) ordersExecuted.add(eventKey(event, 'order'));
  }

  return {
    tasksClosed: tasksClosed.size,
    resultsAwaitingReview: resultsAwaitingReview.size,
    ordersExecuted: ordersExecuted.size,
    spendUsd: aggregateUsageSpend(usage, lastSeenMs),
    eventCount: recentEvents.length,
    sinceMs: lastSeenMs,
    latestEventAtMs,
  };
}

export function digestHasActivity(summary: DigestSummary): boolean {
  return (
    summary.tasksClosed > 0 ||
    summary.resultsAwaitingReview > 0 ||
    summary.ordersExecuted > 0 ||
    (summary.spendUsd !== null && summary.spendUsd > 0)
  );
}

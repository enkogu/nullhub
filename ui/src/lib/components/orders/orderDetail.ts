import type { NullHubEvent, Order } from '$lib/api/client';
import type { BadgeVariant } from '$lib/components/ui/badge/index.js';
import { formatOrderTime, orderKindLabel, orderStatusLabel, scheduleLabel, signalLabel, tierLabel } from './orders';

export type OrderDetailState = 'loading' | 'ready' | 'error';
export type OrderDetailAction = 'suspend' | 'resume' | 'archive';

export type OrderFact = {
  label: string;
  value: string;
};

export type OrderActionCopy = {
  action: OrderDetailAction;
  label: string;
  confirmLabel: string;
  title: string;
  description: string;
  destructive?: boolean;
};

const supportedDetailKinds = new Set(['schedule', 'policy', 'trigger', 'mandate', 'loop', 'workflow']);

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  const isQuoted =
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")));
  if (isQuoted) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function extractOrderFrontmatter(markdown: string): OrderFact[] {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(markdown);
  if (!match) return [];
  return match[1]
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const separator = line.indexOf(':');
      if (separator <= 0) return null;
      const label = normalizeKey(line.slice(0, separator));
      const value = stripQuotes(line.slice(separator + 1));
      return label && value ? { label, value } : null;
    })
    .filter((fact): fact is OrderFact => Boolean(fact));
}

export function orderSystemFacts(order: Order, nowMs = Date.now()): OrderFact[] {
  return [
    { label: 'Status', value: orderStatusLabel(order.status) },
    { label: 'Type', value: orderKindLabel(order.kind) },
    { label: 'Schedule', value: scheduleLabel(order) },
    { label: 'Signal', value: signalLabel(order) },
    { label: 'Tier', value: tierLabel(order) },
    { label: 'Document', value: clean(order.docPath) || 'No document path' },
    { label: 'Created', value: formatOrderTime(order.createdAtMs, nowMs) },
    { label: 'Updated', value: formatOrderTime(order.updatedAtMs, nowMs) },
  ];
}

export function orderDetailIsSupported(order: Order): boolean {
  return supportedDetailKinds.has(clean(order.kind).toLowerCase());
}

export function orderHistoryEvents(events: NullHubEvent[]): NullHubEvent[] {
  return events
    .filter((event) => clean(event.type).startsWith('order.'))
    .slice()
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

function payloadRecord(event: NullHubEvent): Record<string, unknown> {
  return event.payload && typeof event.payload === 'object' ? (event.payload as Record<string, unknown>) : {};
}

function nestedId(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  return clean(record.id ?? record.run_id ?? record.runId ?? record.run_ref ?? record.runRef);
}

export function orderEventRunId(event: NullHubEvent): string {
  const payload = payloadRecord(event);
  const candidates = [
    payload.run_id,
    payload.runId,
    payload.run_ref,
    payload.runRef,
    payload.workflow_run_id,
    payload.workflowRunId,
    payload.loop_run_id,
    payload.loopRunId,
    nestedId(payload.run),
    event.subjectType === 'run' || event.subjectType === 'workflow_run' || event.subjectType === 'loop_run'
      ? event.subjectId
      : '',
  ];
  for (const candidate of candidates) {
    const value = clean(candidate);
    if (value) return value;
  }
  return '';
}

export function orderRunHref(runId: string, spaceId?: string | null): string {
  const path = `/work/runs/${encodeURIComponent(runId)}`;
  if (!spaceId) return path;
  const query = new URLSearchParams({ space: spaceId });
  return `${path}?${query.toString()}`;
}

export function orderEventLabel(event: NullHubEvent): string {
  return clean(event.title) || clean(event.type).replace(/^order\./u, '').replace(/[._-]+/gu, ' ');
}

export function orderEventVariant(event: NullHubEvent): BadgeVariant {
  const severity = clean(event.severity).toLowerCase();
  if (severity === 'success') return 'success';
  if (severity === 'warning') return 'warning';
  if (severity === 'error') return 'destructive';
  return 'secondary';
}

export function availableOrderActions(order: Order | null | undefined): OrderDetailAction[] {
  if (!order || !orderDetailIsSupported(order)) return [];
  const status = clean(order.status).toLowerCase();
  const actions: OrderDetailAction[] = [];
  if (status === 'active') actions.push('suspend');
  if (status === 'suspended') actions.push('resume');
  if (status !== 'archived') actions.push('archive');
  return actions;
}

export function orderActionCopy(action: OrderDetailAction, order: Order): OrderActionCopy {
  const title = clean(order.title) || order.id;
  if (action === 'suspend') {
    return {
      action,
      label: 'Suspend',
      confirmLabel: 'Suspend order',
      title: 'Suspend order',
      description: `Pause "${title}" until it is resumed.`,
    };
  }
  if (action === 'resume') {
    return {
      action,
      label: 'Resume',
      confirmLabel: 'Resume order',
      title: 'Resume order',
      description: `Resume "${title}" and allow it to execute again.`,
    };
  }
  return {
    action,
    label: 'Archive',
    confirmLabel: 'Archive order',
    title: 'Archive order',
    description: `Archive "${title}" and remove it from active execution surfaces.`,
    destructive: true,
  };
}

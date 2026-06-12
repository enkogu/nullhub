import type { Order } from '$lib/api/client';
import type { StatusDotStatus } from '$lib/components/StatusDot.svelte';
import type { BadgeVariant } from '$lib/components/ui/badge/index.js';

export type OrderRegistryState = 'loading' | 'ready' | 'error';

export type OrderRegistryItem = {
  id: string;
  title: string;
  summary: string;
  kind: string;
  kindLabel: string;
  status: string;
  statusLabel: string;
  statusDot: StatusDotStatus;
  statusVariant: BadgeVariant;
  typeVariant: BadgeVariant;
  scheduleLabel: string;
  signalLabel: string;
  tierLabel: string;
  execCount: number;
  execLabel: string;
  updatedAtMs: number;
  updatedLabel: string;
};

export type OrderRegistryFilters = {
  query?: string;
  kind?: string;
  status?: string;
};

const manualSchedule = 'Manual';
const defaultTier = 'Standard';

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ');
}

function lower(value: unknown): string {
  return clean(value).toLowerCase();
}

function optionalString(order: Order, key: 'signal' | 'tier'): string {
  return clean((order as Order & Record<string, unknown>)[key]);
}

function optionalNumber(order: Order, key: 'execCount'): number {
  const value = (order as Record<string, unknown>)[key];
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.trunc(parsed));
  }
  return 0;
}

export function orderKindLabel(kind: string): string {
  const normalized = lower(kind || 'mandate');
  if (normalized === 'loop') return 'Loop';
  if (normalized === 'workflow') return 'Workflow';
  if (normalized === 'schedule') return 'Schedule';
  if (normalized === 'policy') return 'Policy';
  if (normalized === 'mandate') return 'Mandate';
  return titleCase(normalized || 'Mandate');
}

export function orderStatusLabel(status: string): string {
  const normalized = lower(status || 'draft');
  if (normalized === 'active') return 'Active';
  if (normalized === 'suspended') return 'Suspended';
  if (normalized === 'archived') return 'Archived';
  if (normalized === 'draft') return 'Draft';
  return titleCase(normalized || 'Draft');
}

export function orderStatusDot(status: string): StatusDotStatus {
  const normalized = lower(status);
  if (normalized === 'active') return 'running';
  if (normalized === 'suspended') return 'watch';
  if (normalized === 'archived') return 'muted';
  if (normalized === 'failed' || normalized === 'blocked') return 'failed';
  return 'queued';
}

export function orderStatusVariant(status: string): BadgeVariant {
  const normalized = lower(status);
  if (normalized === 'active') return 'success';
  if (normalized === 'suspended') return 'warning';
  if (normalized === 'archived') return 'muted';
  if (normalized === 'failed' || normalized === 'blocked') return 'destructive';
  return 'secondary';
}

export function orderTypeVariant(kind: string): BadgeVariant {
  const normalized = lower(kind);
  if (normalized === 'workflow') return 'secondary';
  if (normalized === 'loop') return 'outline';
  if (normalized === 'schedule') return 'warning';
  if (normalized === 'policy') return 'muted';
  return 'default';
}

export function scheduleLabel(order: Order): string {
  return clean(order.schedule) || manualSchedule;
}

export function signalLabel(order: Order): string {
  const signal = optionalString(order, 'signal');
  if (signal) return signal;
  if (clean(order.schedule)) return 'Scheduled signal';
  const kind = lower(order.kind);
  if (kind === 'loop') return 'Loop trigger';
  if (kind === 'workflow') return 'Workflow trigger';
  return 'Manual signal';
}

export function tierLabel(order: Order): string {
  return optionalString(order, 'tier') || defaultTier;
}

export function execLabel(count: number): string {
  return count === 1 ? '1 exec' : `${count} execs`;
}

export function formatOrderTime(value: number, nowMs = Date.now()): string {
  if (!value) return 'No update';
  const delta = Math.max(0, nowMs - value);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < minute) return 'Just now';
  if (delta < hour) return `${Math.floor(delta / minute)}m ago`;
  if (delta < day) return `${Math.floor(delta / hour)}h ago`;
  if (delta < 14 * day) return `${Math.floor(delta / day)}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function orderToRegistryItem(order: Order, nowMs = Date.now()): OrderRegistryItem {
  const kind = lower(order.kind || 'mandate') || 'mandate';
  const status = lower(order.status || 'draft') || 'draft';
  const execCount = optionalNumber(order, 'execCount');
  return {
    id: order.id,
    title: clean(order.title) || order.id,
    summary: clean(order.summary) || clean(order.content) || 'No summary captured.',
    kind,
    kindLabel: orderKindLabel(kind),
    status,
    statusLabel: orderStatusLabel(status),
    statusDot: orderStatusDot(status),
    statusVariant: orderStatusVariant(status),
    typeVariant: orderTypeVariant(kind),
    scheduleLabel: scheduleLabel(order),
    signalLabel: signalLabel(order),
    tierLabel: tierLabel(order),
    execCount,
    execLabel: execLabel(execCount),
    updatedAtMs: order.updatedAtMs,
    updatedLabel: formatOrderTime(order.updatedAtMs, nowMs),
  };
}

export function filterOrderRegistryItems(
  items: OrderRegistryItem[],
  filters: OrderRegistryFilters,
): OrderRegistryItem[] {
  const query = lower(filters.query);
  const kind = lower(filters.kind);
  const status = lower(filters.status);
  return items.filter((item) => {
    if (kind && item.kind !== kind) return false;
    if (status && item.status !== status) return false;
    if (!query) return true;
    const haystack = [
      item.title,
      item.summary,
      item.kindLabel,
      item.statusLabel,
      item.scheduleLabel,
      item.signalLabel,
      item.tierLabel,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
}

export const orderTypeOptions = [
  { label: 'Mandate', value: 'mandate' },
  { label: 'Schedule', value: 'schedule' },
  { label: 'Loop', value: 'loop' },
  { label: 'Workflow', value: 'workflow' },
  { label: 'Policy', value: 'policy' },
];

export const orderStatusOptions = [
  { label: 'Draft', value: 'draft' },
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Archived', value: 'archived' },
];

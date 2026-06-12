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

export type OrderEditorType = 'schedule' | 'policy' | 'trigger' | 'mandate';
export type OrderEditorSource = 'human' | 'ai_decision';
export type OrderAutonomyTier = 'T0' | 'T1' | 'T2' | 'T3';
export type CronPresetId = 'weekday-0900' | 'daily-0900' | 'weekly-monday-1000' | 'hourly' | 'raw';

export type OrderEditorDraft = {
  type: OrderEditorType;
  source: OrderEditorSource;
  title: string;
  summary: string;
  schedule: string;
  cronPresetId: CronPresetId;
  policyAgentScope: string;
  autonomyTier: OrderAutonomyTier;
  body: string;
};

export type OrderEditorValidation = Partial<Record<'type' | 'title' | 'schedule' | 'policyAgentScope' | 'body', string>>;

export const orderEditorTypeCards: Array<{
  type: OrderEditorType;
  label: string;
  description: string;
  disabled?: boolean;
  disabledLabel?: string;
}> = [
  {
    type: 'schedule',
    label: 'Schedule',
    description: 'Run a repeatable instruction on a cron cadence.',
  },
  {
    type: 'policy',
    label: 'Policy',
    description: 'Attach operating bounds to selected agents.',
  },
  {
    type: 'trigger',
    label: 'Trigger',
    description: 'React to event-log signals.',
    disabled: true,
    disabledLabel: 'P5',
  },
  {
    type: 'mandate',
    label: 'Mandate',
    description: 'Turn completion signals into standing orders.',
    disabled: true,
    disabledLabel: 'P5',
  },
];

export const cronPresets: Array<{ id: CronPresetId; label: string; expression: string; preview: string }> = [
  {
    id: 'weekday-0900',
    label: 'Weekdays at 09:00',
    expression: '0 9 * * 1-5',
    preview: 'Every weekday at 09:00',
  },
  {
    id: 'daily-0900',
    label: 'Daily at 09:00',
    expression: '0 9 * * *',
    preview: 'Every day at 09:00',
  },
  {
    id: 'weekly-monday-1000',
    label: 'Mondays at 10:00',
    expression: '0 10 * * 1',
    preview: 'Every Monday at 10:00',
  },
  {
    id: 'hourly',
    label: 'Hourly',
    expression: '0 * * * *',
    preview: 'Every hour',
  },
  {
    id: 'raw',
    label: 'Raw cron',
    expression: '',
    preview: 'Custom cron expression',
  },
];

export const autonomyTiers: Array<{
  tier: OrderAutonomyTier;
  label: string;
  description: string;
  warning: string;
}> = [
  {
    tier: 'T0',
    label: 'T0 Observe',
    description: 'Draft only; no agent action.',
    warning: 'Safest tier. The order can document intent but cannot start work.',
  },
  {
    tier: 'T1',
    label: 'T1 Propose',
    description: 'Agents may prepare a plan for approval.',
    warning: 'Requires a human decision before any material action.',
  },
  {
    tier: 'T2',
    label: 'T2 Act with approval',
    description: 'Low-risk steps may run; risky steps wait in Inbox.',
    warning: 'Review the bounds carefully because some work can start before approval.',
  },
  {
    tier: 'T3',
    label: 'T3 Autonomous',
    description: 'Agents may execute within the written bounds.',
    warning: 'Highest autonomy. Use only when the WHEN, WHAT, and BOUNDS sections are precise.',
  },
];

const defaultBody = `## WHEN
- Describe the condition or cadence that should start this order.

## WHAT
- Describe the work the agent should perform.

## BOUNDS
- Describe approvals, limits, tools, and stop conditions.
`;

const frontmatterKeys = ['kind', 'source', 'title', 'summary', 'schedule', 'agent_scope', 'autonomy_tier'] as const;

function normalizeEditorType(value: unknown): OrderEditorType {
  const normalized = lower(value);
  if (normalized === 'policy') return 'policy';
  if (normalized === 'trigger') return 'trigger';
  if (normalized === 'mandate') return 'mandate';
  return 'schedule';
}

function normalizeEditorSource(value: unknown): OrderEditorSource {
  return lower(value) === 'ai_decision' ? 'ai_decision' : 'human';
}

function normalizeAutonomyTier(value: unknown): OrderAutonomyTier {
  const normalized = clean(value).toUpperCase();
  if (normalized === 'T0' || normalized === 'T2' || normalized === 'T3') return normalized;
  return 'T1';
}

export function orderBodySkeleton(): string {
  return defaultBody;
}

export function cronPresetIdForExpression(expression: string): CronPresetId {
  const normalized = clean(expression).replace(/\s+/g, ' ');
  return cronPresets.find((preset) => preset.id !== 'raw' && preset.expression === normalized)?.id ?? 'raw';
}

export function normalizeOrderEditorDraft(input: Partial<OrderEditorDraft> = {}): OrderEditorDraft {
  const schedule = input.schedule === undefined ? '0 9 * * 1-5' : clean(input.schedule);
  return {
    type: normalizeEditorType(input.type),
    source: normalizeEditorSource(input.source),
    title: clean(input.title),
    summary: clean(input.summary),
    schedule,
    cronPresetId: input.cronPresetId ?? cronPresetIdForExpression(schedule),
    policyAgentScope: input.policyAgentScope === undefined ? 'All agents in this Space' : clean(input.policyAgentScope),
    autonomyTier: normalizeAutonomyTier(input.autonomyTier),
    body: input.body === undefined ? orderBodySkeleton() : input.body,
  };
}

export function isValidCronExpression(expression: string): boolean {
  const fields = clean(expression).split(/\s+/).filter(Boolean);
  if (fields.length !== 5) return false;
  return fields.every((field) => /^[\d*/,\-]+$/.test(field));
}

function twoDigit(value: number): string {
  return String(value).padStart(2, '0');
}

function numericCronField(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function cronHumanPreview(expression: string): string {
  const normalized = clean(expression).replace(/\s+/g, ' ');
  const preset = cronPresets.find((item) => item.id !== 'raw' && item.expression === normalized);
  if (preset) return preset.preview;
  if (!isValidCronExpression(normalized)) return 'Enter a five-field cron expression.';

  const [minute, hour, dayOfMonth, month, dayOfWeek] = normalized.split(' ');
  const minuteValue = numericCronField(minute);
  const hourValue = numericCronField(hour);
  if (minuteValue !== null && hourValue !== null && minuteValue >= 0 && minuteValue < 60 && hourValue >= 0 && hourValue < 24) {
    const time = `${twoDigit(hourValue)}:${twoDigit(minuteValue)}`;
    if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') return `Every day at ${time}`;
    if (dayOfMonth === '*' && month === '*' && dayOfWeek === '1-5') return `Every weekday at ${time}`;
    if (dayOfMonth === '*' && month === '*' && dayOfWeek === '1') return `Every Monday at ${time}`;
  }
  if (minute === '0' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') return 'Every hour';
  return `Custom cron: ${normalized}`;
}

function hasRequiredBodySections(body: string): boolean {
  const normalized = body.toUpperCase();
  return ['WHEN', 'WHAT', 'BOUNDS'].every((heading) => new RegExp(`(^|\\n)\\s*#{1,3}\\s+${heading}\\b`).test(normalized));
}

export function validateOrderEditorDraft(input: Partial<OrderEditorDraft>): OrderEditorValidation {
  const draft = normalizeOrderEditorDraft(input);
  const errors: OrderEditorValidation = {};
  const card = orderEditorTypeCards.find((item) => item.type === draft.type);
  if (card?.disabled) errors.type = `${card.label} editors arrive in P5.`;
  if (!draft.title) errors.title = 'Title is required.';
  if (draft.type === 'schedule' && !isValidCronExpression(draft.schedule)) {
    errors.schedule = 'Enter a valid five-field cron expression.';
  }
  if (draft.type === 'policy' && !draft.policyAgentScope) {
    errors.policyAgentScope = 'Agent scope is required for a policy order.';
  }
  if (!hasRequiredBodySections(draft.body)) {
    errors.body = 'Body must include WHEN, WHAT, and BOUNDS sections.';
  }
  return errors;
}

export function isOrderEditorDraftValid(input: Partial<OrderEditorDraft>): boolean {
  return Object.keys(validateOrderEditorDraft(input)).length === 0;
}

function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

function parseYamlScalar(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === 'string' ? parsed : String(parsed ?? '');
  } catch {
    return trimmed.replace(/^['"]|['"]$/g, '');
  }
}

export function orderDraftToDocument(input: Partial<OrderEditorDraft>): string {
  const draft = normalizeOrderEditorDraft(input);
  const frontmatter: Record<(typeof frontmatterKeys)[number], string> = {
    kind: draft.type,
    source: draft.source,
    title: draft.title,
    summary: draft.summary,
    schedule: draft.type === 'schedule' ? draft.schedule : '',
    agent_scope: draft.type === 'policy' ? draft.policyAgentScope : '',
    autonomy_tier: draft.autonomyTier,
  };
  const lines = frontmatterKeys.map((key) => `${key}: ${yamlScalar(frontmatter[key])}`);
  return `---\n${lines.join('\n')}\n---\n${draft.body}`;
}

export function orderDocumentToDraft(document: string): OrderEditorDraft {
  if (!document.startsWith('---\n')) return normalizeOrderEditorDraft({ body: document });
  const end = document.indexOf('\n---\n', 4);
  if (end < 0) return normalizeOrderEditorDraft({ body: document });

  const rawFrontmatter = document.slice(4, end);
  const body = document.slice(end + '\n---\n'.length);
  const values: Record<string, string> = {};
  for (const line of rawFrontmatter.split('\n')) {
    const match = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    values[match[1]] = parseYamlScalar(match[2]);
  }
  return normalizeOrderEditorDraft({
    type: values.kind as OrderEditorType,
    source: values.source as OrderEditorSource,
    title: values.title,
    summary: values.summary,
    schedule: values.schedule,
    policyAgentScope: values.agent_scope,
    autonomyTier: values.autonomy_tier as OrderAutonomyTier,
    body,
  });
}

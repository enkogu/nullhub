import type { Order, OrderCreateInput } from '$lib/api/client';
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
  if (normalized === 'trigger') return 'Trigger';
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
  if (normalized === 'trigger') return 'secondary';
  if (normalized === 'policy') return 'muted';
  return 'default';
}

export function scheduleLabel(order: Order): string {
  const schedule = clean(order.schedule);
  if (schedule.startsWith('event:')) return schedule.slice('event:'.length).trim() || schedule;
  return schedule || manualSchedule;
}

export function signalLabel(order: Order): string {
  const signal = optionalString(order, 'signal');
  if (signal) return signal;
  const schedule = clean(order.schedule);
  if (schedule.startsWith('event:')) return schedule.slice('event:'.length).trim() || 'Event signal';
  if (schedule) return 'Scheduled signal';
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
  { label: 'Trigger', value: 'trigger' },
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
export type OrderActionType = 'create_ticket' | 'start_loop' | 'start_workflow' | 'run_agent';

export type OrderEditorDraft = {
  type: OrderEditorType;
  source: OrderEditorSource;
  title: string;
  summary: string;
  schedule: string;
  cronPresetId: CronPresetId;
  policyAgentScope: string;
  autonomyTier: OrderAutonomyTier;
  triggerEventType: string;
  triggerSource: string;
  triggerSubjectType: string;
  triggerSubjectId: string;
  actionType: OrderActionType;
  actionTarget: string;
  actionInstructions: string;
  mandateGoal: string;
  mandateConditionEventType: string;
  mandateUnmetEventType: string;
  mandateConditionSource: string;
  mandateConditionSubjectType: string;
  mandateConditionSubjectId: string;
  mandateCheckCadenceMs: number;
  body: string;
};

export type OrderEditorValidation = Partial<
  Record<
    | 'type'
    | 'title'
    | 'schedule'
    | 'policyAgentScope'
    | 'triggerEventType'
    | 'actionType'
    | 'mandateGoal'
    | 'mandateConditionEventType'
    | 'mandateCheckCadenceMs'
    | 'body',
    string
  >
>;

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
    description: 'React to event-log signals with a dispatcher action.',
  },
  {
    type: 'mandate',
    label: 'Mandate',
    description: 'Keep a goal true by checking condition events.',
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

export const orderActionOptions: Array<{ value: OrderActionType; label: string; targetLabel: string }> = [
  { value: 'run_agent', label: 'Run agent', targetLabel: 'Agent or instance' },
  { value: 'create_ticket', label: 'Create ticket', targetLabel: 'Ticket queue' },
  { value: 'start_loop', label: 'Start Loop', targetLabel: 'Loop id' },
  { value: 'start_workflow', label: 'Start Workflow', targetLabel: 'Workflow id' },
];

const defaultBody = `## WHEN
- Describe the condition or cadence that should start this order.

## WHAT
- Describe the work the agent should perform.

## BOUNDS
- Describe approvals, limits, tools, and stop conditions.
`;

const frontmatterKeys = ['kind', 'source', 'title', 'summary', 'schedule', 'agent_scope', 'autonomy_tier'] as const;
const defaultMandateCheckCadenceMs = 60_000;

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

function normalizeActionType(value: unknown): OrderActionType {
  const normalized = lower(value);
  if (normalized === 'create_ticket' || normalized === 'start_loop' || normalized === 'start_workflow') {
    return normalized;
  }
  return 'run_agent';
}

function positiveInteger(value: unknown, fallback: number): number {
  if (value === null || value === undefined || clean(value) === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number(clean(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

export function orderActionTargetLabel(actionType: OrderActionType): string {
  return orderActionOptions.find((option) => option.value === actionType)?.targetLabel ?? 'Target';
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
    triggerEventType: clean(input.triggerEventType),
    triggerSource: clean(input.triggerSource),
    triggerSubjectType: clean(input.triggerSubjectType),
    triggerSubjectId: clean(input.triggerSubjectId),
    actionType: normalizeActionType(input.actionType),
    actionTarget: clean(input.actionTarget),
    actionInstructions: clean(input.actionInstructions),
    mandateGoal: clean(input.mandateGoal),
    mandateConditionEventType: clean(input.mandateConditionEventType),
    mandateUnmetEventType: clean(input.mandateUnmetEventType),
    mandateConditionSource: clean(input.mandateConditionSource),
    mandateConditionSubjectType: clean(input.mandateConditionSubjectType),
    mandateConditionSubjectId: clean(input.mandateConditionSubjectId),
    mandateCheckCadenceMs: positiveInteger(input.mandateCheckCadenceMs, defaultMandateCheckCadenceMs),
    body: input.body === undefined ? orderBodySkeleton() : input.body,
  };
}

export function isValidCronExpression(expression: string): boolean {
  const fields = clean(expression).split(/\s+/).filter(Boolean);
  if (fields.length !== 5) return false;
  return fields.every((field, index) => isValidCronField(field, cronFieldBounds[index]));
}

type CronFieldBounds = { min: number; max: number };

const cronFieldBounds: CronFieldBounds[] = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12 },
  { min: 0, max: 7 },
];

function isValidCronField(field: string, bounds: CronFieldBounds): boolean {
  return field.split(',').every((part) => part.length > 0 && isValidCronFieldPart(part, bounds));
}

function isValidCronFieldPart(part: string, bounds: CronFieldBounds): boolean {
  const stepParts = part.split('/');
  if (stepParts.length > 2) return false;

  const span = stepParts[0];
  const step = stepParts[1];
  if (step !== undefined && !isCronNumberInRange(step, { min: 1, max: bounds.max - bounds.min + 1 })) {
    return false;
  }

  if (span === '*') return true;

  const rangeParts = span.split('-');
  if (rangeParts.length === 1) return isCronNumberInRange(rangeParts[0], bounds);
  if (rangeParts.length !== 2) return false;

  const start = parseCronNumber(rangeParts[0]);
  const end = parseCronNumber(rangeParts[1]);
  return start !== null && end !== null && start <= end && isCronNumberInRange(start, bounds) && isCronNumberInRange(end, bounds);
}

function parseCronNumber(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isCronNumberInRange(value: string | number, bounds: CronFieldBounds): boolean {
  const parsed = typeof value === 'number' ? value : parseCronNumber(value);
  return parsed !== null && parsed >= bounds.min && parsed <= bounds.max;
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
  if (draft.type === 'trigger' && !draft.triggerEventType) {
    errors.triggerEventType = 'Event type is required for a trigger order.';
  }
  if ((draft.type === 'trigger' || draft.type === 'mandate') && !draft.actionType) {
    errors.actionType = 'Action is required for dispatcher orders.';
  }
  if (draft.type === 'mandate' && !draft.mandateGoal) {
    errors.mandateGoal = 'Goal is required for a mandate order.';
  }
  if (draft.type === 'mandate' && !draft.mandateConditionEventType) {
    errors.mandateConditionEventType = 'Condition event type is required for a mandate order.';
  }
  if (draft.type === 'mandate' && draft.mandateCheckCadenceMs < 1) {
    errors.mandateCheckCadenceMs = 'Cadence must be at least 1 ms.';
  }
  if ((draft.type === 'schedule' || draft.type === 'policy') && !hasRequiredBodySections(draft.body)) {
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
  if (draft.type === 'trigger') {
    return `${JSON.stringify(triggerSpecFromDraft(draft), null, 2)}\n`;
  }
  if (draft.type === 'mandate') {
    return `${JSON.stringify(mandateSpecFromDraft(draft), null, 2)}\n`;
  }

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

function optionalJsonString(value: string): string | undefined {
  const cleaned = clean(value);
  return cleaned || undefined;
}

function actionSpecFromDraft(draft: OrderEditorDraft): Record<string, string> {
  return {
    type: draft.actionType,
    ...(optionalJsonString(draft.actionTarget) ? { target: draft.actionTarget } : {}),
    ...(optionalJsonString(draft.actionInstructions) ? { instructions: draft.actionInstructions } : {}),
  };
}

export function triggerSpecFromDraft(input: Partial<OrderEditorDraft>): Record<string, unknown> {
  const draft = normalizeOrderEditorDraft(input);
  return {
    trigger: {
      event_type: draft.triggerEventType,
      ...(optionalJsonString(draft.triggerSource) ? { source: draft.triggerSource } : {}),
      ...(optionalJsonString(draft.triggerSubjectType) ? { subject_type: draft.triggerSubjectType } : {}),
      ...(optionalJsonString(draft.triggerSubjectId) ? { subject_id: draft.triggerSubjectId } : {}),
    },
    tier: draft.autonomyTier,
    action: actionSpecFromDraft(draft),
  };
}

export function mandateSpecFromDraft(input: Partial<OrderEditorDraft>): Record<string, unknown> {
  const draft = normalizeOrderEditorDraft(input);
  return {
    goal: draft.mandateGoal,
    condition: {
      event_type: draft.mandateConditionEventType,
      ...(optionalJsonString(draft.mandateUnmetEventType) ? { unmet_event_type: draft.mandateUnmetEventType } : {}),
      ...(optionalJsonString(draft.mandateConditionSource) ? { source: draft.mandateConditionSource } : {}),
      ...(optionalJsonString(draft.mandateConditionSubjectType) ? { subject_type: draft.mandateConditionSubjectType } : {}),
      ...(optionalJsonString(draft.mandateConditionSubjectId) ? { subject_id: draft.mandateConditionSubjectId } : {}),
    },
    check_cadence_ms: draft.mandateCheckCadenceMs,
    tier: draft.autonomyTier,
    action: actionSpecFromDraft(draft),
  };
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringRecordValue(record: Record<string, unknown> | null | undefined, key: string): string {
  const value = record?.[key];
  if (value === null || value === undefined || typeof value === 'object') return '';
  return clean(value);
}

function firstStringRecordValue(record: Record<string, unknown> | null | undefined, keys: string[]): string {
  for (const key of keys) {
    const value = stringRecordValue(record, key);
    if (value) return value;
  }
  return '';
}

function numberRecordValue(record: Record<string, unknown> | null | undefined, key: string): number | undefined {
  const value = record?.[key];
  if (value === null || value === undefined || clean(value) === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(clean(value));
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

function actionDraftFromSpec(root: Record<string, unknown>): Partial<OrderEditorDraft> {
  const action = recordValue(root.action);
  const actionName = action
    ? firstStringRecordValue(action, ['type', 'kind'])
    : clean(root.action) || firstStringRecordValue(root, ['executor', 'action_type']);
  return {
    actionType: normalizeActionType(actionName),
    actionTarget: firstStringRecordValue(action, [
      'target',
      'target_ref',
      'instance',
      'workflow_id',
      'loop_id',
      'agent',
      'ticket_queue',
    ]) || firstStringRecordValue(root, ['target', 'target_ref', 'instance', 'workflow_id', 'loop_id', 'agent', 'ticket_queue']),
    actionInstructions:
      firstStringRecordValue(action, ['instructions', 'prompt', 'message']) ||
      firstStringRecordValue(root, ['instructions', 'prompt', 'message']),
  };
}

function goalDraftFromSpec(root: Record<string, unknown>): string {
  const goal = firstStringRecordValue(root, ['goal', 'goal_id', 'goal_ref']);
  if (goal) return goal;
  return firstStringRecordValue(recordValue(root.goal), ['id', 'ref', 'title', 'name']);
}

function triggerDraftFromSpec(root: Record<string, unknown>): Partial<OrderEditorDraft> {
  const trigger = recordValue(root.trigger);
  const eventType = trigger
    ? firstStringRecordValue(trigger, ['event_type', 'type'])
    : clean(root.trigger) || firstStringRecordValue(root, ['event_type', 'type']);
  return {
    type: 'trigger',
    triggerEventType: eventType,
    triggerSource: firstStringRecordValue(trigger, ['source']) || stringRecordValue(root, 'source'),
    triggerSubjectType: firstStringRecordValue(trigger, ['subject_type']) || stringRecordValue(root, 'subject_type'),
    triggerSubjectId: firstStringRecordValue(trigger, ['subject_id']) || stringRecordValue(root, 'subject_id'),
    autonomyTier: normalizeAutonomyTier(stringRecordValue(root, 'tier')),
    ...actionDraftFromSpec(root),
  };
}

function mandateDraftFromSpec(root: Record<string, unknown>): Partial<OrderEditorDraft> {
  const condition = recordValue(root.condition) ?? recordValue(root.completion) ?? root;
  const action = recordValue(root.action);
  return {
    type: 'mandate',
    mandateGoal: goalDraftFromSpec(root),
    mandateConditionEventType:
      firstStringRecordValue(condition, ['event_type', 'met_event_type']) ||
      firstStringRecordValue(root, ['condition_event_type', 'met_event_type']),
    mandateUnmetEventType:
      firstStringRecordValue(condition, ['unmet_event_type', 'false_event_type']) || stringRecordValue(root, 'unmet_event_type'),
    mandateConditionSource: firstStringRecordValue(condition, ['source']) || stringRecordValue(root, 'source'),
    mandateConditionSubjectType: firstStringRecordValue(condition, ['subject_type']) || stringRecordValue(root, 'subject_type'),
    mandateConditionSubjectId: firstStringRecordValue(condition, ['subject_id']) || stringRecordValue(root, 'subject_id'),
    mandateCheckCadenceMs: positiveInteger(
      numberRecordValue(root, 'check_cadence_ms') ??
        numberRecordValue(root, 'cadence_ms') ??
        numberRecordValue(root, 'check_interval_ms') ??
        numberRecordValue(condition, 'check_cadence_ms'),
      defaultMandateCheckCadenceMs,
    ),
    autonomyTier: normalizeAutonomyTier(stringRecordValue(root, 'tier') || stringRecordValue(action, 'tier')),
    ...actionDraftFromSpec(root),
  };
}

function jsonDocumentToDraft(document: string): Partial<OrderEditorDraft> | null {
  const trimmed = document.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const root = recordValue(JSON.parse(trimmed));
    if (!root) return null;
    if (recordValue(root.condition) || recordValue(root.completion) || stringRecordValue(root, 'goal')) {
      return mandateDraftFromSpec(root);
    }
    if (recordValue(root.trigger) || stringRecordValue(root, 'trigger') || stringRecordValue(root, 'event_type')) {
      return triggerDraftFromSpec(root);
    }
  } catch {
    return null;
  }
  return null;
}

export function orderDocumentToDraft(document: string): OrderEditorDraft {
  const jsonDraft = jsonDocumentToDraft(document);
  if (jsonDraft) return normalizeOrderEditorDraft(jsonDraft);

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

export type OrderEditorOrderInput = Pick<OrderCreateInput, 'title' | 'summary' | 'kind' | 'goal' | 'schedule' | 'content'>;

export function orderDraftToOrderInput(input: Partial<OrderEditorDraft>): OrderEditorOrderInput {
  const draft = normalizeOrderEditorDraft(input);
  return {
    title: draft.title,
    summary: draft.summary,
    kind: draft.type,
    goal: draft.type === 'mandate' ? draft.mandateGoal : '',
    schedule:
      draft.type === 'schedule'
        ? draft.schedule
        : draft.type === 'trigger' && draft.triggerEventType
          ? `event:${draft.triggerEventType}`
          : '',
    content: orderDraftToDocument(draft),
  };
}

export function orderToEditorDraft(order: Order): OrderEditorDraft {
  const contentDraft = orderDocumentToDraft(order.content || '');
  const type = normalizeEditorType(order.kind || contentDraft.type);
  const schedule = clean(order.schedule) || contentDraft.schedule;
  const triggerEventType =
    type === 'trigger' && schedule.startsWith('event:') ? clean(schedule.slice('event:'.length)) : contentDraft.triggerEventType;
  return normalizeOrderEditorDraft({
    ...contentDraft,
    type,
    title: clean(order.title) || contentDraft.title,
    summary: clean(order.summary) || contentDraft.summary,
    schedule,
    triggerEventType,
    mandateGoal: clean(order.goal) || contentDraft.mandateGoal,
  });
}

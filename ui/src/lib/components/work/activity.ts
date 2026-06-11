import type { NullHubEvent } from '$lib/api/client';

export type ActivityPeriod = 'all' | 'hour' | 'day' | 'week';

export type ActivityFilters = {
  query?: string;
  source?: string;
  level?: string;
  agent?: string;
  period?: ActivityPeriod;
};

export type ActivityFilterOption = {
  label: string;
  value: string;
};

export const activityPeriodOptions: ActivityFilterOption[] = [
  { label: 'Last hour', value: 'hour' },
  { label: 'Last day', value: 'day' },
  { label: 'Last week', value: 'week' },
];

const periodMs: Record<Exclude<ActivityPeriod, 'all'>, number> = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
};

function recordPayload(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

export function activityLabel(value: string, fallback = 'Unknown'): string {
  const text = value.trim().replace(/[-_.]+/g, ' ');
  if (!text) return fallback;
  return text.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function eventAgent(event: NullHubEvent): string {
  const payload = recordPayload(event.payload);
  const agent =
    stringValue(payload.agent) ||
    stringValue(payload.agent_id) ||
    stringValue(payload.agentId) ||
    stringValue(payload.worker) ||
    stringValue(payload.actor) ||
    stringValue(payload.actor_id) ||
    stringValue(payload.actorId);
  return agent;
}

export function eventLevel(event: NullHubEvent): string {
  return (event.severity || 'info').trim().toLowerCase();
}

export function eventSearchText(event: NullHubEvent): string {
  const payload = recordPayload(event.payload);
  return [
    event.type,
    event.source,
    event.subjectType,
    event.subjectId,
    event.title,
    event.summary,
    event.severity,
    event.evidenceRef,
    eventAgent(event),
    stringValue(payload.message),
    stringValue(payload.detail),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function matchesPeriod(event: NullHubEvent, period: ActivityPeriod, nowMs: number): boolean {
  if (period === 'all') return true;
  if (!event.createdAtMs) return false;
  return event.createdAtMs >= nowMs - periodMs[period];
}

export function filterActivityEvents(
  events: NullHubEvent[],
  filters: ActivityFilters = {},
  nowMs = Date.now(),
): NullHubEvent[] {
  const query = filters.query?.trim().toLowerCase() ?? '';
  const source = filters.source?.trim() ?? '';
  const level = filters.level?.trim().toLowerCase() ?? '';
  const agent = filters.agent?.trim() ?? '';
  const period = filters.period ?? 'all';

  return events.filter((event) => {
    if (query && !eventSearchText(event).includes(query)) return false;
    if (source && event.source !== source) return false;
    if (level && eventLevel(event) !== level) return false;
    if (agent && eventAgent(event) !== agent) return false;
    return matchesPeriod(event, period, nowMs);
  });
}

function uniqueOptions(values: string[]): ActivityFilterOption[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .sort((a, b) => activityLabel(a).localeCompare(activityLabel(b)))
    .map((value) => ({ value, label: activityLabel(value) }));
}

export function activitySourceOptions(events: NullHubEvent[]): ActivityFilterOption[] {
  return uniqueOptions(events.map((event) => event.source));
}

export function activityLevelOptions(events: NullHubEvent[]): ActivityFilterOption[] {
  return uniqueOptions(events.map(eventLevel));
}

export function activityAgentOptions(events: NullHubEvent[]): ActivityFilterOption[] {
  return uniqueOptions(events.map(eventAgent));
}

export function formatActivityTime(createdAtMs: number, nowMs = Date.now()): string {
  if (!createdAtMs) return 'Time unavailable';
  const elapsedMs = Math.max(0, nowMs - createdAtMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (elapsedMs < minute) return 'Just now';
  if (elapsedMs < hour) return `${Math.floor(elapsedMs / minute)}m ago`;
  if (elapsedMs < day) return `${Math.floor(elapsedMs / hour)}h ago`;
  if (elapsedMs < 7 * day) return `${Math.floor(elapsedMs / day)}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
    new Date(createdAtMs),
  );
}

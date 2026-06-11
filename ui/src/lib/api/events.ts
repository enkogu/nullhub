import { selectedSpaceFromEnvironment, type SpaceSelection } from '$lib/api/spaces';

type RequestFn = <T>(path: string, options?: RequestInit) => Promise<T>;
type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;
type WithQueryFn = (path: string, params: QueryParams) => string;

export type EventSeverity = 'debug' | 'info' | 'success' | 'warning' | 'error' | string;

export type NullHubEvent = {
  id: number;
  spaceId: string;
  type: string;
  source: string;
  subjectType: string;
  subjectId: string;
  title: string;
  summary: string;
  severity: EventSeverity;
  evidenceRef: string;
  createdAtMs: number;
  payload: unknown;
};

export type EventListParams = {
  spaceId?: SpaceSelection;
  type?: string;
  source?: string;
  subjectType?: string;
  subjectId?: string;
  severity?: EventSeverity;
  limit?: number;
  cursor?: string | number | null;
};

export type EventListPage = {
  events: NullHubEvent[];
  hasMore: boolean;
  nextCursor: string | null;
};

export type EventCreateInput = {
  spaceId?: SpaceSelection;
  type: string;
  source?: string;
  subjectType?: string;
  subjectId?: string;
  title?: string;
  summary?: string;
  severity?: EventSeverity;
  evidenceRef?: string;
  createdAtMs?: number;
  payload?: unknown;
};

function requireSpaceId(spaceId: SpaceSelection | undefined): string {
  const resolved = spaceId === undefined ? selectedSpaceFromEnvironment() : spaceId;
  if (!resolved) throw new Error('Events API requires a selected Space.');
  return resolved;
}

function numberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function normalizeEvent(raw: any): NullHubEvent {
  return {
    id: numberValue(raw?.id),
    spaceId: stringValue(raw?.space_id ?? raw?.spaceId),
    type: stringValue(raw?.type ?? raw?.event_type ?? raw?.eventType),
    source: stringValue(raw?.source),
    subjectType: stringValue(raw?.subject_type ?? raw?.subjectType),
    subjectId: stringValue(raw?.subject_id ?? raw?.subjectId),
    title: stringValue(raw?.title),
    summary: stringValue(raw?.summary),
    severity: stringValue(raw?.severity || 'info'),
    evidenceRef: stringValue(raw?.evidence_ref ?? raw?.evidenceRef),
    createdAtMs: numberValue(raw?.created_at_ms ?? raw?.createdAtMs),
    payload: raw?.payload ?? {},
  };
}

function normalizeEventPage(raw: any): EventListPage {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.events) ? raw.events : [];
  const cursor = raw?.next_cursor ?? raw?.nextCursor ?? null;
  return {
    events: list.map(normalizeEvent),
    hasMore: Boolean(raw?.has_more ?? raw?.hasMore),
    nextCursor: cursor == null ? null : String(cursor),
  };
}

function createEventBody(input: EventCreateInput) {
  return {
    type: input.type,
    source: input.source,
    subject_type: input.subjectType,
    subject_id: input.subjectId,
    title: input.title,
    summary: input.summary,
    severity: input.severity,
    evidence_ref: input.evidenceRef,
    created_at_ms: input.createdAtMs,
    payload: input.payload,
  };
}

export function createEventsApi(request: RequestFn, withQuery: WithQueryFn) {
  function eventsPath(params: EventListParams | { spaceId?: SpaceSelection } = {}) {
    return withQuery('/events', {
      space: requireSpaceId(params.spaceId),
      type: 'type' in params ? params.type : undefined,
      source: 'source' in params ? params.source : undefined,
      subject_type: 'subjectType' in params ? params.subjectType : undefined,
      subject_id: 'subjectId' in params ? params.subjectId : undefined,
      severity: 'severity' in params ? params.severity : undefined,
      limit: 'limit' in params ? params.limit : undefined,
      cursor: 'cursor' in params ? params.cursor : undefined,
    });
  }

  return {
    listEvents: async (params: EventListParams = {}): Promise<EventListPage> =>
      normalizeEventPage(await request<any>(eventsPath(params))),
    createEvent: async (input: EventCreateInput): Promise<NullHubEvent> =>
      normalizeEvent(
        await request<any>(eventsPath({ spaceId: input.spaceId }), {
          method: 'POST',
          body: JSON.stringify(createEventBody(input)),
        }),
      ),
  };
}

export type EventsApi = ReturnType<typeof createEventsApi>;

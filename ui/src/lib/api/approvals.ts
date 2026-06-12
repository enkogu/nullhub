import { selectedSpaceFromEnvironment, type SpaceSelection } from '$lib/api/spaces';

type RequestFn = <T>(path: string, options?: RequestInit) => Promise<T>;
type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;
type WithQueryFn = (path: string, params: QueryParams) => string;

export type ApprovalKind = 'signature' | 'question' | 'failure' | string;
export type ApprovalStatus = 'pending' | 'approved' | 'pushed_back' | 'rejected' | string;
export type ApprovalDecision = 'approved' | 'pushed_back' | 'rejected';

export type Approval = {
  id: number;
  spaceId: string;
  kind: ApprovalKind;
  queue: string;
  targetRef: string;
  title: string;
  summary: string;
  status: ApprovalStatus;
  feedback: string;
  createdAtMs: number;
  decidedAtMs: number;
};

export type ApprovalListParams = {
  spaceId?: SpaceSelection;
  status?: ApprovalStatus;
  kind?: ApprovalKind;
  queue?: string;
  limit?: number;
  cursor?: string | number | null;
};

export type ApprovalListPage = {
  approvals: Approval[];
  hasMore: boolean;
  nextCursor: string | null;
};

export type ApprovalCreateInput = {
  spaceId?: SpaceSelection;
  kind: ApprovalKind;
  queue?: string;
  targetRef?: string;
  title: string;
  summary?: string;
  createdAtMs?: number;
};

export type ApprovalDecideInput = {
  spaceId?: SpaceSelection;
  decision: ApprovalDecision;
  feedback?: string;
};

function requireSpaceId(spaceId: SpaceSelection | undefined): string {
  const resolved = spaceId === undefined ? selectedSpaceFromEnvironment() : spaceId;
  if (!resolved) throw new Error('Approvals API requires a selected Space.');
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

export function normalizeApproval(raw: any): Approval {
  return {
    id: numberValue(raw?.id),
    spaceId: stringValue(raw?.space_id ?? raw?.spaceId),
    kind: stringValue(raw?.kind),
    queue: stringValue(raw?.queue),
    targetRef: stringValue(raw?.target_ref ?? raw?.targetRef),
    title: stringValue(raw?.title),
    summary: stringValue(raw?.summary),
    status: stringValue(raw?.status || 'pending'),
    feedback: stringValue(raw?.feedback),
    createdAtMs: numberValue(raw?.created_at_ms ?? raw?.createdAtMs),
    decidedAtMs: numberValue(raw?.decided_at_ms ?? raw?.decidedAtMs),
  };
}

function normalizeApprovalPage(raw: any): ApprovalListPage {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.approvals) ? raw.approvals : [];
  const cursor = raw?.next_cursor ?? raw?.nextCursor ?? null;
  return {
    approvals: list.map(normalizeApproval),
    hasMore: Boolean(raw?.has_more ?? raw?.hasMore),
    nextCursor: cursor == null ? null : String(cursor),
  };
}

export function createApprovalsApi(request: RequestFn, withQuery: WithQueryFn) {
  function approvalsPath(params: ApprovalListParams | { spaceId?: SpaceSelection } = {}) {
    return withQuery('/approvals', {
      space: requireSpaceId(params.spaceId),
      status: 'status' in params ? params.status : undefined,
      kind: 'kind' in params ? params.kind : undefined,
      queue: 'queue' in params ? params.queue : undefined,
      limit: 'limit' in params ? params.limit : undefined,
      cursor: 'cursor' in params ? params.cursor : undefined,
    });
  }

  return {
    listApprovals: async (params: ApprovalListParams = {}): Promise<ApprovalListPage> =>
      normalizeApprovalPage(await request<any>(approvalsPath(params))),
    createApproval: async (input: ApprovalCreateInput): Promise<Approval> =>
      normalizeApproval(
        await request<any>(approvalsPath({ spaceId: input.spaceId }), {
          method: 'POST',
          body: JSON.stringify({
            kind: input.kind,
            queue: input.queue,
            target_ref: input.targetRef,
            title: input.title,
            summary: input.summary,
            created_at_ms: input.createdAtMs,
          }),
        }),
      ),
    decideApproval: async (id: number, input: ApprovalDecideInput): Promise<Approval> =>
      normalizeApproval(
        await request<any>(
          withQuery(`/approvals/${id}/decide`, { space: requireSpaceId(input.spaceId) }),
          {
            method: 'POST',
            body: JSON.stringify({ decision: input.decision, feedback: input.feedback }),
          },
        ),
      ),
  };
}

export type ApprovalsApi = ReturnType<typeof createApprovalsApi>;

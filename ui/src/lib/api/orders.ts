import { selectedSpaceFromEnvironment, type SpaceSelection } from '$lib/api/spaces';
import { encodePathSegment } from '$lib/nullstack/path';

type RequestFn = <T>(path: string, options?: RequestInit) => Promise<T>;
type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;
type WithQueryFn = (path: string, params: QueryParams) => string;

export type OrderStatus = 'draft' | 'active' | 'suspended' | 'archived' | string;
export type OrderKind = 'mandate' | 'schedule' | 'trigger' | 'policy' | 'loop' | 'workflow' | string;
export type OrderStatusAction = 'draft' | 'enact' | 'suspend' | 'resume' | 'archive';

export type Order = {
  id: string;
  spaceId: string;
  title: string;
  summary: string;
  kind: OrderKind;
  goal: string;
  status: OrderStatus;
  schedule: string;
  signal?: string;
  tier?: string;
  execCount?: number;
  docPath: string;
  content: string;
  createdAtMs: number;
  updatedAtMs: number;
};

export type OrderListParams = {
  spaceId?: SpaceSelection;
};

export type OrderListPage = {
  orders: Order[];
};

export type OrderCreateInput = {
  spaceId?: SpaceSelection;
  id?: string;
  title: string;
  summary?: string;
  kind?: OrderKind;
  goal?: string;
  schedule?: string;
  content?: string;
  createdAtMs?: number;
  updatedAtMs?: number;
};

export type OrderUpdateInput = {
  spaceId?: SpaceSelection;
  title?: string;
  summary?: string;
  kind?: OrderKind;
  goal?: string;
  status?: OrderStatus;
  schedule?: string;
  content?: string;
  updatedAtMs?: number;
};

export type OrderScheduleInput = {
  spaceId?: SpaceSelection;
  schedule: string;
};

export type OrderScopedOptions = {
  spaceId?: SpaceSelection;
};

export type OrderDeleteResult = {
  status: string;
  id: string;
};

function requireSpaceId(spaceId: SpaceSelection | undefined): string {
  const resolved = spaceId === undefined ? selectedSpaceFromEnvironment() : spaceId;
  if (!resolved) throw new Error('Orders API requires a selected Space.');
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

function optionalNumberValue(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = numberValue(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function normalizeOrder(raw: any): Order {
  const signal = stringValue(raw?.signal ?? raw?.trigger ?? raw?.source_signal);
  const tier = stringValue(raw?.tier ?? raw?.policy_tier ?? raw?.plan_tier);
  const execCount = optionalNumberValue(
    raw?.exec_count ?? raw?.execution_count ?? raw?.run_count ?? raw?.runs_count ?? raw?.execCount,
  );
  return {
    id: stringValue(raw?.id),
    spaceId: stringValue(raw?.space_id ?? raw?.spaceId),
    title: stringValue(raw?.title),
    summary: stringValue(raw?.summary),
    kind: stringValue(raw?.kind || 'mandate'),
    goal: stringValue(raw?.goal ?? raw?.goal_id ?? raw?.goal_ref),
    status: stringValue(raw?.status || 'draft'),
    schedule: stringValue(raw?.schedule),
    ...(signal ? { signal } : {}),
    ...(tier ? { tier } : {}),
    ...(execCount !== undefined ? { execCount } : {}),
    docPath: stringValue(raw?.doc_path ?? raw?.docPath),
    content: stringValue(raw?.content ?? raw?.body),
    createdAtMs: numberValue(raw?.created_at_ms ?? raw?.createdAtMs),
    updatedAtMs: numberValue(raw?.updated_at_ms ?? raw?.updatedAtMs),
  };
}

function normalizeOrderList(raw: any): OrderListPage {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.orders) ? raw.orders : [];
  return { orders: list.map(normalizeOrder) };
}

function normalizeDeleteResult(raw: any): OrderDeleteResult {
  return {
    status: stringValue(raw?.status),
    id: stringValue(raw?.id),
  };
}

function createOrderBody(input: OrderCreateInput) {
  return {
    id: input.id,
    title: input.title,
    summary: input.summary,
    kind: input.kind,
    goal: input.goal,
    schedule: input.schedule,
    content: input.content,
    created_at_ms: input.createdAtMs,
    updated_at_ms: input.updatedAtMs,
  };
}

function updateOrderBody(input: OrderUpdateInput) {
  return {
    title: input.title,
    summary: input.summary,
    kind: input.kind,
    goal: input.goal,
    status: input.status,
    schedule: input.schedule,
    content: input.content,
    updated_at_ms: input.updatedAtMs,
  };
}

export function createOrdersApi(request: RequestFn, withQuery: WithQueryFn) {
  function ordersPath(params: OrderListParams | { spaceId?: SpaceSelection } = {}) {
    return withQuery('/orders', { space: requireSpaceId(params.spaceId) });
  }

  function orderPath(id: string, options?: OrderScopedOptions) {
    return withQuery(`/orders/${encodePathSegment(id)}`, {
      space: requireSpaceId(options?.spaceId),
    });
  }

  function orderActionPath(id: string, action: OrderStatusAction | 'schedule', options?: OrderScopedOptions) {
    return withQuery(`/orders/${encodePathSegment(id)}/${action}`, {
      space: requireSpaceId(options?.spaceId),
    });
  }

  function transitionOrder(id: string, action: OrderStatusAction, options?: OrderScopedOptions): Promise<Order> {
    return request<any>(orderActionPath(id, action, options), { method: 'POST' }).then(normalizeOrder);
  }

  return {
    listOrders: async (params: OrderListParams = {}): Promise<OrderListPage> =>
      normalizeOrderList(await request<any>(ordersPath(params))),
    getOrder: async (id: string, options?: OrderScopedOptions): Promise<Order> =>
      normalizeOrder(await request<any>(orderPath(id, options))),
    createOrder: async (input: OrderCreateInput): Promise<Order> =>
      normalizeOrder(
        await request<any>(ordersPath({ spaceId: input.spaceId }), {
          method: 'POST',
          body: JSON.stringify(createOrderBody(input)),
        }),
      ),
    updateOrder: async (id: string, input: OrderUpdateInput): Promise<Order> =>
      normalizeOrder(
        await request<any>(orderPath(id, input), {
          method: 'PATCH',
          body: JSON.stringify(updateOrderBody(input)),
        }),
      ),
    scheduleOrder: async (id: string, input: OrderScheduleInput): Promise<Order> =>
      normalizeOrder(
        await request<any>(orderActionPath(id, 'schedule', input), {
          method: 'POST',
          body: JSON.stringify({ schedule: input.schedule }),
        }),
      ),
    deleteOrder: async (id: string, options?: OrderScopedOptions): Promise<OrderDeleteResult> =>
      normalizeDeleteResult(
        await request<any>(orderPath(id, options), {
          method: 'DELETE',
        }),
      ),
    draftOrder: (id: string, options?: OrderScopedOptions): Promise<Order> => transitionOrder(id, 'draft', options),
    enactOrder: (id: string, options?: OrderScopedOptions): Promise<Order> => transitionOrder(id, 'enact', options),
    suspendOrder: (id: string, options?: OrderScopedOptions): Promise<Order> => transitionOrder(id, 'suspend', options),
    resumeOrder: (id: string, options?: OrderScopedOptions): Promise<Order> => transitionOrder(id, 'resume', options),
    archiveOrder: (id: string, options?: OrderScopedOptions): Promise<Order> => transitionOrder(id, 'archive', options),
  };
}

export type OrdersApi = ReturnType<typeof createOrdersApi>;

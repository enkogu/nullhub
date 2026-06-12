import type { Order, OrderStatusAction } from '$lib/api/orders';
import { jsonFixture, type ApiFixtureRequest, type ApiFixtureResponse, type ApiFixtureRoute } from './backend';

export const fixtureOrders: Order[] = [
  {
    id: 'order-2',
    spaceId: 'ops',
    title: 'Weekly pipeline review',
    summary: 'Review open loops and blocked work.',
    kind: 'workflow',
    status: 'active',
    schedule: '0 10 * * 1',
    docPath: 'orders/order-2.md',
    content: '# Weekly pipeline review\n',
    createdAtMs: 2000,
    updatedAtMs: 2500,
  },
  {
    id: 'order-1',
    spaceId: 'ops',
    title: 'Morning report',
    summary: 'Prepare the daily operations brief.',
    kind: 'schedule',
    status: 'draft',
    schedule: '0 9 * * *',
    docPath: 'orders/order-1.md',
    content: '# Morning report\n',
    createdAtMs: 1000,
    updatedAtMs: 1000,
  },
];

export type OrdersFixtureState = {
  orders: Order[];
  nowMs: number;
};

export function createOrdersFixtureState(initialOrders: Order[] = fixtureOrders): OrdersFixtureState {
  return {
    orders: initialOrders.map((order) => ({ ...order })),
    nowMs: 3000,
  };
}

function requireSpace(request: ApiFixtureRequest): string | null {
  return request.url.searchParams.get('space');
}

function bodyObject(request: ApiFixtureRequest): Record<string, unknown> {
  return request.bodyJson && typeof request.bodyJson === 'object'
    ? (request.bodyJson as Record<string, unknown>)
    : {};
}

function wireOrder(order: Order) {
  return {
    id: order.id,
    space_id: order.spaceId,
    title: order.title,
    summary: order.summary,
    kind: order.kind,
    status: order.status,
    schedule: order.schedule,
    ...(order.signal ? { signal: order.signal } : {}),
    ...(order.tier ? { tier: order.tier } : {}),
    ...(order.execCount !== undefined ? { exec_count: order.execCount } : {}),
    doc_path: order.docPath,
    content: order.content,
    created_at_ms: order.createdAtMs,
    updated_at_ms: order.updatedAtMs,
  };
}

function orderIndex(state: OrdersFixtureState, id: string, spaceId: string | null): number {
  return state.orders.findIndex((order) => order.id === id && order.spaceId === spaceId);
}

function nextOrderId(state: OrdersFixtureState): string {
  let max = 0;
  for (const order of state.orders) {
    const match = /^order-(\d+)$/.exec(order.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `order-${max + 1}`;
}

function nextTime(state: OrdersFixtureState): number {
  state.nowMs += 100;
  return state.nowMs;
}

function actionStatus(action: string): Order['status'] | null {
  if (action === 'draft') return 'draft';
  if (action === 'enact' || action === 'activate') return 'active';
  if (action === 'suspend' || action === 'pause') return 'suspended';
  if (action === 'resume') return 'active';
  if (action === 'archive') return 'archived';
  return null;
}

function itemPathParts(request: ApiFixtureRequest): { id: string; action: string } | null {
  const match = /^\/api\/orders\/([^/?]+)(?:\/([^/?]+))?$/.exec(request.url.pathname);
  if (!match) return null;
  return {
    id: decodeURIComponent(match[1]),
    action: match[2] ? decodeURIComponent(match[2]) : '',
  };
}

function notFound(): ApiFixtureResponse {
  return jsonFixture({ error: 'order not found' }, { status: 404 });
}

export function createOrdersFixtureRoutes(
  state: OrdersFixtureState = createOrdersFixtureState(),
): ApiFixtureRoute[] {
  return [
    {
      method: 'GET',
      path: '/api/orders',
      handler: (request) => {
        const space = requireSpace(request);
        return jsonFixture({ orders: state.orders.filter((order) => order.spaceId === space).map(wireOrder) });
      },
    },
    {
      method: 'POST',
      path: '/api/orders',
      handler: (request) => {
        const space = requireSpace(request);
        if (!space) return jsonFixture({ error: 'space query is required' }, { status: 400 });

        const body = bodyObject(request);
        const title = String(body.title ?? '').trim();
        if (!title) return jsonFixture({ error: 'title is required' }, { status: 422 });

        const createdAtMs =
          typeof body.created_at_ms === 'number' ? body.created_at_ms : nextTime(state);
        const id = String(body.id || nextOrderId(state));
        const order: Order = {
          id,
          spaceId: space,
          title,
          summary: String(body.summary ?? ''),
          kind: String(body.kind ?? 'mandate'),
          status: 'draft',
          schedule: String(body.schedule ?? ''),
          docPath: `orders/${id}.md`,
          content: String(body.content ?? body.body ?? ''),
          createdAtMs,
          updatedAtMs: typeof body.updated_at_ms === 'number' ? body.updated_at_ms : createdAtMs,
        };
        state.orders.push(order);
        return jsonFixture(wireOrder(order), { status: 201 });
      },
    },
    {
      method: 'GET',
      path: (request) => {
        const parts = itemPathParts(request);
        return request.method === 'GET' && Boolean(parts && !parts.action);
      },
      handler: (request) => {
        const parts = itemPathParts(request);
        const index = parts ? orderIndex(state, parts.id, requireSpace(request)) : -1;
        return index < 0 ? notFound() : jsonFixture(wireOrder(state.orders[index]));
      },
    },
    {
      method: 'PATCH',
      path: (request) => {
        const parts = itemPathParts(request);
        return request.method === 'PATCH' && Boolean(parts && !parts.action);
      },
      handler: (request) => {
        const parts = itemPathParts(request);
        const index = parts ? orderIndex(state, parts.id, requireSpace(request)) : -1;
        if (index < 0) return notFound();

        const body = bodyObject(request);
        state.orders[index] = {
          ...state.orders[index],
          title: body.title === undefined ? state.orders[index].title : String(body.title),
          summary: body.summary === undefined ? state.orders[index].summary : String(body.summary),
          kind: body.kind === undefined ? state.orders[index].kind : String(body.kind),
          status: body.status === undefined ? state.orders[index].status : String(body.status),
          schedule: body.schedule === undefined ? state.orders[index].schedule : String(body.schedule),
          content:
            body.content === undefined && body.body === undefined
              ? state.orders[index].content
              : String(body.content ?? body.body ?? ''),
          updatedAtMs: typeof body.updated_at_ms === 'number' ? body.updated_at_ms : nextTime(state),
        };
        return jsonFixture(wireOrder(state.orders[index]));
      },
    },
    {
      method: 'POST',
      path: (request) => itemPathParts(request)?.action === 'schedule',
      handler: (request) => {
        const parts = itemPathParts(request);
        const index = parts ? orderIndex(state, parts.id, requireSpace(request)) : -1;
        if (index < 0) return notFound();

        const body = bodyObject(request);
        state.orders[index] = {
          ...state.orders[index],
          schedule: String(body.schedule ?? ''),
          updatedAtMs: nextTime(state),
        };
        return jsonFixture(wireOrder(state.orders[index]));
      },
    },
    {
      method: 'POST',
      path: (request) => {
        const action = itemPathParts(request)?.action;
        return Boolean(action && action !== 'schedule' && actionStatus(action));
      },
      handler: (request) => {
        const parts = itemPathParts(request);
        const index = parts ? orderIndex(state, parts.id, requireSpace(request)) : -1;
        if (index < 0) return notFound();

        const status = actionStatus(parts?.action as OrderStatusAction);
        if (!status) return notFound();

        state.orders[index] = {
          ...state.orders[index],
          status,
          updatedAtMs: nextTime(state),
        };
        return jsonFixture(wireOrder(state.orders[index]));
      },
    },
    {
      method: 'DELETE',
      path: (request) => {
        const parts = itemPathParts(request);
        return request.method === 'DELETE' && Boolean(parts && !parts.action);
      },
      handler: (request) => {
        const parts = itemPathParts(request);
        const index = parts ? orderIndex(state, parts.id, requireSpace(request)) : -1;
        if (index < 0) return notFound();
        const [deleted] = state.orders.splice(index, 1);
        return jsonFixture({ status: 'deleted', id: deleted.id });
      },
    },
  ];
}

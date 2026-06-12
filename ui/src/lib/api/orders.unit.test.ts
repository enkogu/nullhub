import { afterEach, describe, expect, test, vi } from 'vitest';
import { api, ordersApi } from './client';
import { ALL_SPACES_STORAGE_VALUE, SELECTED_SPACE_STORAGE_KEY } from './spaces';
import { createOrdersFixtureRoutes, createOrdersFixtureState } from './__fixtures__/orders';
import { installApiFixture, type InstalledApiFixture } from './__fixtures__/backend';

let fixture: InstalledApiFixture | null = null;
const originalLocalStorage = globalThis.localStorage;

function installSelectedSpace(spaceId: string | null) {
  const value = spaceId === null ? ALL_SPACES_STORAGE_VALUE : spaceId;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => (key === SELECTED_SPACE_STORAGE_KEY ? value : null)),
    },
  });
}

afterEach(() => {
  fixture?.restore();
  fixture = null;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: originalLocalStorage,
  });
});

describe('orders API client', () => {
  test('lists and reads orders through space-scoped fake backend responses', async () => {
    installSelectedSpace('ops');
    fixture = installApiFixture(createOrdersFixtureRoutes());

    const page = await ordersApi.listOrders();
    const order = await ordersApi.getOrder('order-1', { spaceId: 'ops' });

    expect(page.orders).toHaveLength(2);
    expect(page.orders[0]).toEqual({
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
    });
    expect(order).toMatchObject({
      id: 'order-1',
      spaceId: 'ops',
      title: 'Morning report',
      status: 'draft',
      docPath: 'orders/order-1.md',
    });
    expect(fixture.requests.map((request) => request.path)).toEqual([
      '/api/orders?space=ops',
      '/api/orders/order-1?space=ops',
    ]);
  });

  test('creates, updates, schedules, and deletes orders with backend wire fields', async () => {
    const state = createOrdersFixtureState([]);
    fixture = installApiFixture(createOrdersFixtureRoutes(state));

    const created = await api.createOrder({
      spaceId: 'ops-crud',
      id: 'order-99',
      title: 'Customer onboarding',
      summary: 'Keep onboarding work moving.',
      kind: 'workflow',
      schedule: '',
      content: '# Customer onboarding\n',
      createdAtMs: 9000,
    });
    const updated = await ordersApi.updateOrder('order-99', {
      spaceId: 'ops-crud',
      title: 'Customer onboarding v2',
      status: 'active',
      content: '# Customer onboarding v2\n',
      updatedAtMs: 9100,
    });
    const scheduled = await ordersApi.scheduleOrder('order-99', {
      spaceId: 'ops-crud',
      schedule: '0 8 * * 1-5',
    });
    const deleted = await api.deleteOrder('order-99', { spaceId: 'ops-crud' });

    expect(created).toMatchObject({
      id: 'order-99',
      spaceId: 'ops-crud',
      title: 'Customer onboarding',
      content: '# Customer onboarding\n',
      createdAtMs: 9000,
    });
    expect(updated).toMatchObject({
      id: 'order-99',
      title: 'Customer onboarding v2',
      status: 'active',
      content: '# Customer onboarding v2\n',
      updatedAtMs: 9100,
    });
    expect(scheduled).toMatchObject({ id: 'order-99', schedule: '0 8 * * 1-5' });
    expect(deleted).toEqual({ status: 'deleted', id: 'order-99' });
    expect(fixture.requests.map(({ method, path, bodyJson }) => ({ method, path, body: bodyJson }))).toEqual([
      {
        method: 'POST',
        path: '/api/orders?space=ops-crud',
        body: {
          id: 'order-99',
          title: 'Customer onboarding',
          summary: 'Keep onboarding work moving.',
          kind: 'workflow',
          schedule: '',
          content: '# Customer onboarding\n',
          created_at_ms: 9000,
        },
      },
      {
        method: 'PATCH',
        path: '/api/orders/order-99?space=ops-crud',
        body: {
          title: 'Customer onboarding v2',
          status: 'active',
          content: '# Customer onboarding v2\n',
          updated_at_ms: 9100,
        },
      },
      {
        method: 'POST',
        path: '/api/orders/order-99/schedule?space=ops-crud',
        body: { schedule: '0 8 * * 1-5' },
      },
      {
        method: 'DELETE',
        path: '/api/orders/order-99?space=ops-crud',
        body: undefined,
      },
    ]);
  });

  test('runs draft, enact, suspend, resume, and archive status actions', async () => {
    const state = createOrdersFixtureState([
      {
        id: 'order-7',
        spaceId: 'ops-status',
        title: 'Status order',
        summary: '',
        kind: 'mandate',
        status: 'active',
        schedule: '',
        docPath: 'orders/order-7.md',
        content: '# Status order\n',
        createdAtMs: 7000,
        updatedAtMs: 7000,
      },
    ]);
    fixture = installApiFixture(createOrdersFixtureRoutes(state));

    await expect(api.draftOrder('order-7', { spaceId: 'ops-status' })).resolves.toMatchObject({ status: 'draft' });
    await expect(api.enactOrder('order-7', { spaceId: 'ops-status' })).resolves.toMatchObject({ status: 'active' });
    await expect(api.suspendOrder('order-7', { spaceId: 'ops-status' })).resolves.toMatchObject({
      status: 'suspended',
    });
    await expect(api.resumeOrder('order-7', { spaceId: 'ops-status' })).resolves.toMatchObject({ status: 'active' });
    await expect(api.archiveOrder('order-7', { spaceId: 'ops-status' })).resolves.toMatchObject({
      status: 'archived',
    });
    expect(fixture.requests.map((request) => request.path)).toEqual([
      '/api/orders/order-7/draft?space=ops-status',
      '/api/orders/order-7/enact?space=ops-status',
      '/api/orders/order-7/suspend?space=ops-status',
      '/api/orders/order-7/resume?space=ops-status',
      '/api/orders/order-7/archive?space=ops-status',
    ]);
  });

  test('rejects order reads without a concrete selected space before fetching', async () => {
    installSelectedSpace(null);
    fixture = installApiFixture(createOrdersFixtureRoutes());

    await expect(ordersApi.listOrders()).rejects.toThrow('Orders API requires a selected Space.');
    expect(fixture.requests).toEqual([]);
  });
});

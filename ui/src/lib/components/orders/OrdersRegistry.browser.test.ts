import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Order } from '$lib/api/client';
import OrdersRegistry from './OrdersRegistry.svelte';

const nowMs = 1_780_000_000_000;

const orders: Order[] = [
  {
    id: 'order-2',
    spaceId: 'ops',
    title: 'Weekly pipeline review',
    summary: 'Review open loops and blocked workflow mandates.',
    kind: 'workflow',
    status: 'active',
    schedule: '0 10 * * 1',
    signal: 'Monday review signal',
    tier: 'Managed',
    execCount: 12,
    docPath: 'orders/order-2.md',
    content: '# Weekly pipeline review\n',
    createdAtMs: nowMs - 14 * 24 * 60 * 60_000,
    updatedAtMs: nowMs - 2 * 60 * 60_000,
  },
  {
    id: 'order-1',
    spaceId: 'ops',
    title: 'Morning report',
    summary: 'Prepare the daily operations brief.',
    kind: 'schedule',
    status: 'draft',
    schedule: '0 9 * * *',
    signal: 'Daily briefing signal',
    tier: 'Core',
    execCount: 3,
    docPath: 'orders/order-1.md',
    content: '# Morning report\n',
    createdAtMs: nowMs - 7 * 24 * 60 * 60_000,
    updatedAtMs: nowMs - 30 * 60_000,
  },
];

function textContent(container: HTMLElement): string {
  return container.textContent ?? '';
}

test('renders populated, empty, loading, and error states with the Charter stub', async () => {
  const populated = await render(OrdersRegistry, { props: { orders, state: 'ready', nowMs } });
  await expect.element(populated.getByRole('article', { name: /Weekly pipeline review Workflow order/ })).toBeVisible();
  await expect.element(populated.getByText('Tier Managed')).toBeVisible();
  await expect.element(populated.getByText('12 execs')).toBeVisible();
  await expect.element(populated.getByText('Monday review signal')).toBeVisible();
  await expect.element(populated.getByRole('heading', { name: 'Charter' })).toBeVisible();
  await expect.element(populated.getByText('Stub')).toBeVisible();

  const empty = await render(OrdersRegistry, { props: { orders: [], state: 'ready', nowMs } });
  await expect.element(empty.getByText('No orders')).toBeVisible();
  expect(empty.container.querySelector('[data-slot="orders-charter-slot"]')).not.toBeNull();

  const loading = await render(OrdersRegistry, { props: { orders: [], state: 'loading', nowMs } });
  await expect.element(loading.getByText('Loading orders')).toBeVisible();

  const error = await render(OrdersRegistry, {
    props: { orders: [], state: 'error', error: new Error('Orders failed.'), nowMs },
  });
  await expect.element(error.getByText('Orders unavailable')).toBeVisible();
  await expect.element(error.getByText('Orders failed.')).toBeVisible();
});

test('filters orders by type, status, and query', async () => {
  const screen = await render(OrdersRegistry, { props: { orders, state: 'ready', nowMs } });
  const input = screen.container.querySelector<HTMLInputElement>('input[aria-label="Search orders"]');
  const selects = Array.from(screen.container.querySelectorAll<HTMLSelectElement>('select'));
  const typeSelect = selects[0]!;
  const statusSelect = selects[1]!;

  typeSelect.value = 'workflow';
  typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(textContent(screen.container)).toContain('Weekly pipeline review'));
  expect(textContent(screen.container)).not.toContain('Morning report');

  typeSelect.value = '';
  typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  statusSelect.value = 'draft';
  statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(textContent(screen.container)).toContain('Morning report'));
  expect(textContent(screen.container)).not.toContain('Weekly pipeline review');

  statusSelect.value = '';
  statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
  input!.value = 'weekly';
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.waitFor(() => expect(textContent(screen.container)).toContain('Weekly pipeline review'));
  expect(textContent(screen.container)).not.toContain('Morning report');
});

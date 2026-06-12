import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { NullHubEvent, Order } from '$lib/api/client';
import OrderDocView from './OrderDocView.svelte';

const nowMs = 1_780_000_000_000;

const policyOrder: Order = {
  id: 'order-41',
  spaceId: 'ops',
  title: 'Policy order detail',
  summary: 'Keep managed policy instructions current.',
  kind: 'policy',
  status: 'active',
  schedule: 'Manual',
  signal: 'Policy update',
  tier: 'Managed',
  execCount: 4,
  docPath: 'orders/order-41.md',
  content:
    '---\nowner: "Ops"\nreview_cycle: weekly\n---\n# Policy order detail\n\n- Keep ORDERS.md updated\n\n[Evidence](https://example.com/evidence)',
  createdAtMs: nowMs - 4 * 24 * 60 * 60_000,
  updatedAtMs: nowMs - 30 * 60_000,
};

const historyEvents: NullHubEvent[] = [
  {
    id: 9,
    spaceId: 'ops',
    type: 'order.executed',
    source: 'orders',
    subjectType: 'order',
    subjectId: 'order-41',
    title: 'Order executed',
    summary: 'The policy order produced a managed workspace document.',
    severity: 'success',
    evidenceRef: '',
    createdAtMs: nowMs - 5 * 60_000,
    payload: { run_id: 'run-41' },
  },
  {
    id: 8,
    spaceId: 'ops',
    type: 'work.started',
    source: 'dispatcher',
    subjectType: 'run',
    subjectId: 'run-40',
    title: 'Run started',
    summary: 'This non-order event is filtered out.',
    severity: 'info',
    evidenceRef: '',
    createdAtMs: nowMs - 10 * 60_000,
    payload: {},
  },
];

test('renders populated order document, frontmatter facts, markdown, and order history', async () => {
  const screen = await render(OrderDocView, {
    props: {
      order: policyOrder,
      events: historyEvents,
      state: 'ready',
      nowMs,
      spaceId: 'ops',
      editHref: '/orders/order-41/edit?space=ops',
    },
  });

  await expect.element(screen.getByRole('heading', { name: 'Policy order detail', level: 2 })).toBeVisible();
  await expect.element(screen.getByText('Ops')).toBeVisible();
  await expect.element(screen.getByText('weekly')).toBeVisible();
  await expect.element(screen.getByText('orders/order-41.md')).toBeVisible();
  await expect.element(screen.getByText('Keep ORDERS.md updated')).toBeVisible();
  expect(screen.container.textContent).not.toContain('review_cycle: weekly');

  await expect.element(screen.getByRole('heading', { name: 'Execution history' })).toBeVisible();
  await expect.element(screen.getByText('order.executed')).toBeVisible();
  await expect.element(screen.getByText('The policy order produced a managed workspace document.')).toBeVisible();
  await expect.element(screen.getByRole('link', { name: 'Open run run-41' })).toHaveAttribute(
    'href',
    '/work/runs/run-41?space=ops',
  );
  expect(screen.container.textContent).not.toContain('This non-order event is filtered out.');
});

test('confirms suspend action before invoking the callback', async () => {
  const onSuspend = vi.fn();
  const screen = await render(OrderDocView, {
    props: {
      order: policyOrder,
      events: historyEvents,
      state: 'ready',
      nowMs,
      onSuspend,
    },
  });

  await screen.getByRole('button', { name: 'Suspend' }).click();
  await expect.element(screen.getByRole('dialog', { name: 'Suspend order' })).toBeVisible();
  expect(onSuspend).not.toHaveBeenCalled();

  await screen.getByRole('button', { name: 'Suspend order' }).click();
  expect(onSuspend).toHaveBeenCalledTimes(1);
});

test('renders loading, empty, error, and deferred states', async () => {
  const loading = await render(OrderDocView, { props: { state: 'loading' } });
  await expect.element(loading.getByText('Loading order')).toBeVisible();

  const empty = await render(OrderDocView, { props: { order: null, state: 'ready' } });
  await expect.element(empty.getByText('Order not found')).toBeVisible();

  const error = await render(OrderDocView, {
    props: { order: null, state: 'error', error: new Error('Order API failed.') },
  });
  await expect.element(error.getByText('Order unavailable')).toBeVisible();
  await expect.element(error.getByText('Order API failed.')).toBeVisible();

  const mandate = await render(OrderDocView, {
    props: {
      order: { ...policyOrder, kind: 'mandate', title: 'Legacy mandate' },
      state: 'ready',
      nowMs,
      editHref: '/orders/order-41/edit',
    },
  });
  await expect.element(mandate.getByText('Detail view deferred')).toBeVisible();
  await expect.element(mandate.getByRole('link', { name: 'Edit' })).toHaveAttribute('aria-disabled', 'true');
  expect(mandate.container.querySelector('[data-slot="markdown-viewer"]')).toBeNull();
});

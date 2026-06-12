<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import type { NullHubEvent, Order } from '$lib/api/client';
  import OrderDocView from './OrderDocView.svelte';

  const { Story } = defineMeta({
    title: 'Orders/OrderDocView',
    component: OrderDocView,
  });

  const nowMs = 1_780_000_000_000;

  const order: Order = {
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
      '---\nowner: Ops\nreview_cycle: weekly\n---\n# Policy order detail\n\n- Keep ORDERS.md updated\n- Attach execution evidence before archive.',
    createdAtMs: nowMs - 4 * 24 * 60 * 60_000,
    updatedAtMs: nowMs - 30 * 60_000,
  };

  const events: NullHubEvent[] = [
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
      type: 'order.updated',
      source: 'orders',
      subjectType: 'order',
      subjectId: 'order-41',
      title: 'Order updated',
      summary: 'The managed document content changed.',
      severity: 'info',
      evidenceRef: '',
      createdAtMs: nowMs - 2 * 60 * 60_000,
      payload: {},
    },
  ];
</script>

{#snippet detailTemplate(args)}
  <div class="max-w-6xl">
    <OrderDocView {...args} />
  </div>
{/snippet}

<Story
  name="Populated"
  args={{
    order,
    events,
    state: 'ready',
    nowMs,
    spaceId: 'ops',
    editHref: '/orders/order-41/edit?space=ops',
  }}
  template={detailTemplate}
/>
<Story name="Loading" args={{ order: null, events: [], state: 'loading', nowMs }} template={detailTemplate} />
<Story name="Empty" args={{ order: null, events: [], state: 'ready', nowMs }} template={detailTemplate} />
<Story
  name="Error"
  args={{ order: null, events: [], state: 'error', error: 'Order unavailable.', nowMs }}
  template={detailTemplate}
/>
<Story
  name="Deferred"
  args={{ order: { ...order, kind: 'mandate', title: 'Legacy mandate' }, events, state: 'ready', nowMs }}
  template={detailTemplate}
/>

<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import OrderRow from './OrderRow.svelte';
  import { orderToRegistryItem } from './orders';
  import type { Order } from '$lib/api/client';

  const { Story } = defineMeta({
    title: 'Orders/OrderRow',
    component: OrderRow,
  });

  const nowMs = 1_780_000_000_000;
  const order: Order = {
    id: 'order-42',
    spaceId: 'ops',
    title: 'Weekly pipeline review',
    summary: 'Review open loops and blocked workflow mandates.',
    kind: 'workflow',
    status: 'active',
    schedule: '0 10 * * 1',
    signal: 'Monday review signal',
    tier: 'Managed',
    execCount: 12,
    docPath: 'orders/order-42.md',
    content: '# Weekly pipeline review\n',
    createdAtMs: nowMs - 14 * 24 * 60 * 60_000,
    updatedAtMs: nowMs - 2 * 60 * 60_000,
  };
</script>

{#snippet rowTemplate(args)}
  <div class="max-w-4xl">
    <OrderRow {...args} />
  </div>
{/snippet}

<Story name="Default" args={{ item: orderToRegistryItem(order, nowMs) }} template={rowTemplate} />

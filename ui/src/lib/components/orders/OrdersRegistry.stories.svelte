<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import OrdersRegistry from './OrdersRegistry.svelte';
  import type { Order } from '$lib/api/client';

  const { Story } = defineMeta({
    title: 'Orders/OrdersRegistry',
    component: OrdersRegistry,
  });

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
</script>

{#snippet registryTemplate(args)}
  <div class="max-w-6xl">
    <OrdersRegistry {...args} />
  </div>
{/snippet}

<Story name="Populated" args={{ orders, state: 'ready', nowMs }} template={registryTemplate} />
<Story name="Loading" args={{ orders: [], state: 'loading', nowMs }} template={registryTemplate} />
<Story name="Empty" args={{ orders: [], state: 'ready', nowMs }} template={registryTemplate} />
<Story
  name="Error"
  args={{ orders: [], state: 'error', error: 'Orders unavailable.', nowMs }}
  template={registryTemplate}
/>

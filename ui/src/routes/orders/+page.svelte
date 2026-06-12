<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { ordersApi, type Order } from '$lib/api/client';
  import LoopsWorkspace from '$lib/components/loops/LoopsWorkspace.svelte';
  import NullBoilerPanel from '$lib/components/NullBoilerPanel.svelte';
  import OrdersRegistry from '$lib/components/orders/OrdersRegistry.svelte';
  import type { OrderRegistryState } from '$lib/components/orders/orders';
  import { Button } from '$lib/components/ui/button/index.js';
  import { PageHeader } from '$lib/components/ui/page-header/index.js';
  import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs/index.js';
  import { spacesStore } from '$lib/stores/spaces.svelte';

  type OrdersTab = 'registry' | 'loops' | 'workflows';

  const tabValues: OrdersTab[] = ['registry', 'loops', 'workflows'];

  let activeTab = $state<OrdersTab>('registry');
  let orders = $state<Order[]>([]);
  let registryState = $state<OrderRegistryState>('loading');
  let registryError = $state<unknown>(null);
  let loadedSpaceId = $state('');
  let nowMs = $state(Date.now());
  let requestSeq = 0;

  function requestedTab(): OrdersTab {
    const value = $page.url.searchParams.get('tab') as OrdersTab | null;
    return value && tabValues.includes(value) ? value : 'registry';
  }

  function hrefWithSearch(href: string): string {
    const search = $page.url.search;
    if (!search) return href;
    if (href.includes('?')) return `${href}&${search.slice(1)}`;
    return `${href}${search}`;
  }

  async function loadOrders(spaceId = spacesStore.selectedSpaceId) {
    if (!spaceId) {
      orders = [];
      loadedSpaceId = '';
      registryState = spacesStore.status === 'ready' ? 'error' : 'loading';
      registryError =
        spacesStore.status === 'ready' ? new Error('Select a Space to load the Orders registry.') : null;
      return;
    }

    const seq = ++requestSeq;
    loadedSpaceId = spaceId;
    registryState = 'loading';
    registryError = null;
    try {
      const ordersPage = await ordersApi.listOrders({ spaceId });
      if (seq !== requestSeq) return;
      orders = ordersPage.orders;
      nowMs = Date.now();
      registryState = 'ready';
    } catch (error) {
      if (seq !== requestSeq) return;
      registryError = error;
      registryState = 'error';
    }
  }

  $effect(() => {
    activeTab = requestedTab();
  });

  $effect(() => {
    const spaceId = spacesStore.selectedSpaceId;
    if (!spaceId) {
      orders = [];
      loadedSpaceId = '';
      registryState = spacesStore.status === 'ready' ? 'error' : 'loading';
      registryError =
        spacesStore.status === 'ready' ? new Error('Select a Space to load the Orders registry.') : null;
      return;
    }
    if (loadedSpaceId === spaceId) return;
    void loadOrders(spaceId);
  });

  onMount(() => {
    nowMs = Date.now();
  });
</script>

<section class="flex min-w-0 flex-col gap-5" aria-label="Orders">
  <PageHeader
    title="Orders"
    subtitle="Durable mandates for schedules, policies, Loops, and Workflows."
    align="start"
  >
    {#snippet actions()}
      <Button href={hrefWithSearch('/orders/loops')} variant="outline" size="sm">Open Loops</Button>
      <Button href={hrefWithSearch('/orders/workflows')} variant="outline" size="sm">Open Workflows</Button>
    {/snippet}
  </PageHeader>

  <Tabs bind:value={activeTab} class="gap-5">
    <TabsList>
      <TabsTrigger value="registry">Registry</TabsTrigger>
      <TabsTrigger value="loops">Loops</TabsTrigger>
      <TabsTrigger value="workflows">Workflows</TabsTrigger>
    </TabsList>

    <TabsContent value="registry">
      <OrdersRegistry
        orders={orders}
        state={registryState}
        error={registryError}
        {nowMs}
        onRetry={() => void loadOrders()}
      />
    </TabsContent>

    <TabsContent value="loops">
      <div data-slot="orders-remount-panel" class="min-w-0">
        <LoopsWorkspace initialTab="overview" />
      </div>
    </TabsContent>

    <TabsContent value="workflows">
      <div data-slot="orders-remount-panel" class="min-w-0">
        <NullBoilerPanel
          component="nullboiler"
          name="boiler"
          active={activeTab === 'workflows'}
          running={true}
        />
      </div>
    </TabsContent>
  </Tabs>
</section>

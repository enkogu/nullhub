<script lang="ts">
  import { page } from '$app/stores';
  import { eventsApi, ordersApi, type NullHubEvent, type Order } from '$lib/api/client';
  import OrderDocView from '$lib/components/orders/OrderDocView.svelte';
  import type { OrderDetailAction, OrderDetailState } from '$lib/components/orders/orderDetail';
  import { Button } from '$lib/components/ui/button/index.js';
  import { PageHeader } from '$lib/components/ui/page-header/index.js';
  import { spacesStore } from '$lib/stores/spaces.svelte';

  let order = $state<Order | null>(null);
  let events = $state<NullHubEvent[]>([]);
  let detailState = $state<OrderDetailState>('loading');
  let detailError = $state<unknown>(null);
  let actionError = $state<unknown>(null);
  let loadedKey = $state('');
  let nowMs = $state(Date.now());
  let requestSeq = 0;

  let orderId = $derived($page.params.id ?? '');
  let selectedSpaceId = $derived(spacesStore.selectedSpaceId);
  let title = $derived(order?.title || orderId || 'Order detail');
  let subtitle = $derived(order?.summary || 'Managed order document, facts, and execution history.');
  let backHref = $derived(hrefWithSearch('/orders'));

  function hrefWithSearch(href: string): string {
    const search = $page.url.search;
    if (!search) return href;
    if (href.includes('?')) return `${href}&${search.slice(1)}`;
    return `${href}${search}`;
  }

  async function loadEvents(spaceId: string, id: string): Promise<NullHubEvent[]> {
    const page = await eventsApi.listEvents({
      spaceId,
      subjectType: 'order',
      subjectId: id,
      limit: 100,
    });
    return page.events;
  }

  async function loadOrder(spaceId = selectedSpaceId, id = orderId) {
    if (!id) {
      order = null;
      events = [];
      loadedKey = '';
      detailState = 'ready';
      detailError = null;
      return;
    }
    if (!spaceId) {
      order = null;
      events = [];
      loadedKey = '';
      detailState = spacesStore.status === 'ready' ? 'error' : 'loading';
      detailError = spacesStore.status === 'ready' ? new Error('Select a Space to load this order.') : null;
      return;
    }

    const seq = ++requestSeq;
    loadedKey = `${spaceId}:${id}`;
    detailState = 'loading';
    detailError = null;
    actionError = null;
    try {
      const [loadedOrder, loadedEvents] = await Promise.all([
        ordersApi.getOrder(id, { spaceId }),
        loadEvents(spaceId, id),
      ]);
      if (seq !== requestSeq) return;
      order = loadedOrder;
      events = loadedEvents;
      nowMs = Date.now();
      detailState = 'ready';
    } catch (error) {
      if (seq !== requestSeq) return;
      order = null;
      events = [];
      detailError = error;
      detailState = 'error';
    }
  }

  async function transitionOrder(action: OrderDetailAction) {
    if (!order || !selectedSpaceId) return;
    actionError = null;
    try {
      if (action === 'suspend') order = await ordersApi.suspendOrder(order.id, { spaceId: selectedSpaceId });
      if (action === 'resume') order = await ordersApi.resumeOrder(order.id, { spaceId: selectedSpaceId });
      if (action === 'archive') order = await ordersApi.archiveOrder(order.id, { spaceId: selectedSpaceId });
      events = await loadEvents(selectedSpaceId, order.id);
      nowMs = Date.now();
    } catch (error) {
      actionError = error;
      throw error;
    }
  }

  $effect(() => {
    const id = orderId;
    const spaceId = selectedSpaceId;
    if (!id || !spaceId) {
      void loadOrder(spaceId, id);
      return;
    }
    const key = `${spaceId}:${id}`;
    if (loadedKey === key) return;
    void loadOrder(spaceId, id);
  });
</script>

<section class="flex min-w-0 flex-col gap-5" aria-label="Order detail page">
  <PageHeader {title} {subtitle} align="start">
    {#snippet actions()}
      <Button href={backHref} variant="outline" size="sm">Back to Orders</Button>
    {/snippet}
  </PageHeader>

  <OrderDocView
    {order}
    {events}
    state={detailState}
    error={detailError}
    {actionError}
    {nowMs}
    spaceId={selectedSpaceId}
    onRetry={() => void loadOrder()}
    onSuspend={() => transitionOrder('suspend')}
    onResume={() => transitionOrder('resume')}
    onArchive={() => transitionOrder('archive')}
  />
</section>

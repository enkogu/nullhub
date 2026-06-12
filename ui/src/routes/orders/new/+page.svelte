<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { ordersApi, type Order } from '$lib/api/client';
  import OrderEditor from '$lib/components/orders/OrderEditor.svelte';
  import { orderDraftToOrderInput, type OrderEditorDraft, type OrderEditorType } from '$lib/components/orders/orders';
  import { Button } from '$lib/components/ui/button/index.js';
  import { PageHeader } from '$lib/components/ui/page-header/index.js';
  import { spacesStore } from '$lib/stores/spaces.svelte';

  let status = $state('');
  let error = $state('');
  let saving = $state(false);

  let initialDraft = $derived<Partial<OrderEditorDraft>>({
    type: requestedType(),
    source: $page.url.searchParams.get('source') === 'ai_decision' ? 'ai_decision' : 'human',
    title: $page.url.searchParams.get('title') ?? '',
    summary: $page.url.searchParams.get('summary') ?? '',
  });

  function requestedType(): OrderEditorType {
    const value = $page.url.searchParams.get('type');
    if (value === 'policy' || value === 'trigger' || value === 'mandate') return value;
    return 'schedule';
  }

  function ordersHref(): string {
    const space = $page.url.searchParams.get('space');
    return space ? `/orders?space=${encodeURIComponent(space)}` : '/orders';
  }

  function orderHref(order: Order): string {
    const space = spacesStore.selectedSpaceId;
    const query = space ? `?space=${encodeURIComponent(space)}` : '';
    return `/orders/${encodeURIComponent(order.id)}${query}`;
  }

  function errorMessage(value: unknown): string {
    if (value instanceof Error) return value.message;
    return String(value);
  }

  async function persistDraft(draft: OrderEditorDraft, enact: boolean) {
    const spaceId = spacesStore.selectedSpaceId;
    status = '';
    error = '';
    if (!spaceId) {
      error = 'Select a Space before saving this order.';
      return;
    }

    saving = true;
    try {
      const input = orderDraftToOrderInput(draft);
      let order = await ordersApi.createOrder({ ...input, spaceId });
      if (enact) order = await ordersApi.enactOrder(order.id, { spaceId });
      status = enact ? `${order.title} saved and enacted.` : `${order.title} saved.`;
      await goto(orderHref(order));
    } catch (cause) {
      error = errorMessage(cause);
    } finally {
      saving = false;
    }
  }

  function handleSave(draft: OrderEditorDraft) {
    void persistDraft(draft, false);
  }

  function handleApprove(draft: OrderEditorDraft) {
    void persistDraft(draft, true);
  }
</script>

<section class="flex min-w-0 flex-col gap-5" aria-label="New order">
  <PageHeader
    title="New Order"
    subtitle="Draft an order for the selected Space."
    align="start"
  >
    {#snippet actions()}
      <Button href={ordersHref()} variant="outline" size="sm">Back to Orders</Button>
    {/snippet}
  </PageHeader>

  {#if status}
    <div class="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
      {status}
    </div>
  {/if}

  {#if error}
    <div class="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      {error}
    </div>
  {/if}

  <OrderEditor
    draft={initialDraft}
    onSaveDraft={handleSave}
    onApproveAndEnact={handleApprove}
    class={saving ? 'pointer-events-none opacity-70' : ''}
  />
</section>

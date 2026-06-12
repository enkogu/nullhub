<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { ordersApi, type Order } from '$lib/api/client';
  import OrderEditor from '$lib/components/orders/OrderEditor.svelte';
  import { orderDraftToOrderInput, orderToEditorDraft, type OrderEditorDraft } from '$lib/components/orders/orders';
  import { Button } from '$lib/components/ui/button/index.js';
  import { PageHeader } from '$lib/components/ui/page-header/index.js';
  import { spacesStore } from '$lib/stores/spaces.svelte';

  type EditorState = 'loading' | 'ready' | 'error';

  let order = $state<Order | null>(null);
  let editorState = $state<EditorState>('loading');
  let loadError = $state<unknown>(null);
  let saveError = $state('');
  let status = $state('');
  let saving = $state(false);
  let loadedKey = $state('');
  let requestSeq = 0;

  let orderId = $derived($page.params.id ?? '');
  let selectedSpaceId = $derived(spacesStore.selectedSpaceId);
  let title = $derived(order ? `Edit ${order.title || order.id}` : 'Edit Order');
  let detailHref = $derived(orderId ? hrefWithSearch(`/orders/${encodeURIComponent(orderId)}`) : hrefWithSearch('/orders'));
  let editorDraft = $derived(order ? orderToEditorDraft(order) : undefined);

  function hrefWithSearch(href: string): string {
    const search = $page.url.search;
    if (!search) return href;
    if (href.includes('?')) return `${href}&${search.slice(1)}`;
    return `${href}${search}`;
  }

  function errorMessage(value: unknown): string {
    if (!value) return '';
    if (value instanceof Error) return value.message;
    return String(value);
  }

  async function loadOrder(spaceId = selectedSpaceId, id = orderId) {
    if (!id) {
      order = null;
      loadedKey = '';
      editorState = 'error';
      loadError = new Error('Order id is required.');
      return;
    }
    if (!spaceId) {
      order = null;
      loadedKey = '';
      editorState = spacesStore.status === 'ready' ? 'error' : 'loading';
      loadError = spacesStore.status === 'ready' ? new Error('Select a Space to edit this order.') : null;
      return;
    }

    const seq = ++requestSeq;
    loadedKey = `${spaceId}:${id}`;
    editorState = 'loading';
    loadError = null;
    saveError = '';
    status = '';
    try {
      const loadedOrder = await ordersApi.getOrder(id, { spaceId });
      if (seq !== requestSeq) return;
      order = loadedOrder;
      editorState = 'ready';
    } catch (error) {
      if (seq !== requestSeq) return;
      order = null;
      loadError = error;
      editorState = 'error';
    }
  }

  async function persistDraft(draft: OrderEditorDraft, enact: boolean) {
    if (!order || !selectedSpaceId) return;
    status = '';
    saveError = '';
    saving = true;
    try {
      const input = orderDraftToOrderInput(draft);
      let saved = await ordersApi.updateOrder(order.id, { ...input, spaceId: selectedSpaceId });
      if (enact) saved = await ordersApi.enactOrder(saved.id, { spaceId: selectedSpaceId });
      order = saved;
      status = enact ? `${saved.title} saved and enacted.` : `${saved.title} saved.`;
      await goto(detailHref);
    } catch (cause) {
      saveError = errorMessage(cause);
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

<section class="flex min-w-0 flex-col gap-5" aria-label="Edit order">
  <PageHeader {title} subtitle="Update the order fields and dispatcher content." align="start">
    {#snippet actions()}
      <Button href={detailHref} variant="outline" size="sm">Back to Order</Button>
    {/snippet}
  </PageHeader>

  {#if editorState === 'loading'}
    <div class="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Loading order.</div>
  {:else if editorState === 'error'}
    <div class="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      {errorMessage(loadError) || 'Order could not be loaded.'}
    </div>
  {:else if editorDraft}
    {#if status}
      <div class="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        {status}
      </div>
    {/if}

    {#if saveError}
      <div class="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        {saveError}
      </div>
    {/if}

    <OrderEditor
      draft={editorDraft}
      onSaveDraft={handleSave}
      onApproveAndEnact={handleApprove}
      class={saving ? 'pointer-events-none opacity-70' : ''}
    />
  {/if}
</section>

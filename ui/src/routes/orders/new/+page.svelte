<script lang="ts">
  import { page } from '$app/stores';
  import OrderEditor from '$lib/components/orders/OrderEditor.svelte';
  import type { OrderEditorDraft, OrderEditorType } from '$lib/components/orders/orders';
  import { Button } from '$lib/components/ui/button/index.js';
  import { PageHeader } from '$lib/components/ui/page-header/index.js';

  let status = $state('');

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

  function handleSave(draft: OrderEditorDraft, document: string) {
    status = `${draft.title} draft validated locally (${document.length} bytes).`;
  }

  function handleApprove(draft: OrderEditorDraft, document: string) {
    status = `${draft.title} approved locally (${document.length} bytes).`;
  }
</script>

<section class="flex min-w-0 flex-col gap-5" aria-label="New order">
  <PageHeader
    title="New Order"
    subtitle="Draft a schedule or policy order for the selected Space."
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

  <OrderEditor
    draft={initialDraft}
    onSaveDraft={handleSave}
    onApproveAndEnact={handleApprove}
  />
</section>

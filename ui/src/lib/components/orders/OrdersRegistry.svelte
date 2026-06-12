<script lang="ts">
  import type { Order } from '$lib/api/client';
  import DataState, { type DataStateKind } from '$lib/components/DataState.svelte';
  import FilterBar, { type FilterDefinition } from '$lib/components/FilterBar.svelte';
  import { cn } from '$lib/utils.js';
  import CharterSlot from './CharterSlot.svelte';
  import OrderRow from './OrderRow.svelte';
  import {
    filterOrderRegistryItems,
    orderStatusOptions,
    orderToRegistryItem,
    orderTypeOptions,
    type OrderRegistryState,
  } from './orders';

  let {
    orders = [],
    state: registryState = 'loading',
    error,
    nowMs = Date.now(),
    onRetry,
    class: className,
  }: {
    orders?: Order[];
    state?: OrderRegistryState;
    error?: unknown;
    nowMs?: number;
    onRetry?: () => void;
    class?: string;
  } = $props();

  let query = $state('');
  let kindFilter = $state('');
  let statusFilter = $state('');

  let items = $derived(orders.map((order) => orderToRegistryItem(order, nowMs)));
  let filteredItems = $derived(
    filterOrderRegistryItems(items, {
      query,
      kind: kindFilter,
      status: statusFilter,
    }),
  );
  let hasActiveFilters = $derived(Boolean(query.trim() || kindFilter || statusFilter));
  let dataState = $derived<DataStateKind>(
    registryState === 'loading'
      ? 'loading'
      : registryState === 'error'
        ? 'error'
        : filteredItems.length > 0
          ? 'populated'
          : 'empty',
  );
  let emptyTitle = $derived(hasActiveFilters ? 'No matching orders' : 'No orders');
  let emptyDescription = $derived(
    hasActiveFilters
      ? 'Reset the registry filters to see every durable mandate in this Space.'
      : 'Durable mandates will appear here after an order is created.',
  );
  let filterDefinitions = $derived<FilterDefinition[]>([
    {
      key: 'kind',
      label: 'type',
      value: kindFilter,
      options: orderTypeOptions,
    },
    {
      key: 'status',
      label: 'status',
      value: statusFilter,
      options: orderStatusOptions,
    },
  ]);

  function handleFilterChange(key: string, value: string) {
    if (key === 'kind') kindFilter = value;
    if (key === 'status') statusFilter = value;
  }

  function resetFilters() {
    query = '';
    kindFilter = '';
    statusFilter = '';
  }
</script>

<section
  data-slot="orders-registry"
  class={cn('flex min-w-0 flex-col gap-4', className)}
  aria-label="Orders registry"
>
  <FilterBar
    bind:query
    searchLabel="Search orders"
    searchPlaceholder="Search orders"
    filters={filterDefinitions}
    resultCount={registryState === 'ready' ? filteredItems.length : undefined}
    state={registryState === 'loading' ? 'loading' : 'populated'}
    onFilterChange={handleFilterChange}
    onReset={resetFilters}
  />

  <div class="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
    <DataState
      state={dataState}
      {error}
      loadingTitle="Loading orders"
      loadingDescription="Fetching durable mandates for the selected Space."
      {emptyTitle}
      {emptyDescription}
      emptyIcon="inbox"
      errorTitle="Orders unavailable"
      errorFallback="The Orders registry could not load."
      retryLabel={onRetry ? 'Retry' : undefined}
      {onRetry}
    >
      <div class="flex min-w-0 flex-col gap-3">
        {#each filteredItems as item (item.id)}
          <OrderRow {item} />
        {/each}
      </div>
    </DataState>

    <CharterSlot />
  </div>
</section>

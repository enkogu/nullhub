<script lang="ts" module>
  export type ResultsGridState = 'idle' | 'loading' | 'ready' | 'error';
</script>

<script lang="ts">
  import DataState, { type DataStateKind } from '$lib/components/DataState.svelte';
  import FilterBar, { type FilterDefinition } from '$lib/components/FilterBar.svelte';
  import CountBadge from '$lib/components/CountBadge.svelte';
  import { cn } from '$lib/utils.js';
  import ResultCard from './ResultCard.svelte';
  import {
    filterResults,
    resultLifecycleOptions,
    resultSourceOptions,
    type WorkResult,
  } from './results';

  let {
    results = [],
    gridState = 'idle',
    error = null,
    requiresSpace = false,
    spaceId = '',
    nowMs = Date.now(),
    onRetry,
    class: className,
  }: {
    results?: WorkResult[];
    gridState?: ResultsGridState;
    error?: unknown;
    requiresSpace?: boolean;
    spaceId?: string;
    nowMs?: number;
    onRetry?: () => void;
    class?: string;
  } = $props();

  let query = $state('');
  let lifecycle = $state('');
  let source = $state('');

  let filteredResults = $derived(filterResults(results, { query, lifecycle, source }));
  let filterDefinitions = $derived([
    {
      key: 'lifecycle',
      label: 'lifecycle',
      value: lifecycle,
      options: resultLifecycleOptions(results),
    },
    {
      key: 'source',
      label: 'source',
      value: source,
      options: resultSourceOptions(results),
    },
  ] satisfies FilterDefinition[]);
  let isLoading = $derived(gridState === 'idle' || gridState === 'loading');
  let dataState = $derived(
    (isLoading
      ? 'loading'
      : gridState === 'error'
        ? 'error'
        : requiresSpace || filteredResults.length === 0
          ? 'empty'
          : 'populated') as DataStateKind,
  );
  let emptyTitle = $derived(
    requiresSpace ? 'Select one space' : results.length ? 'No results match these filters' : 'No results yet',
  );
  let emptyDescription = $derived(
    requiresSpace
      ? 'Result reads are scoped to a concrete Space.'
      : results.length
        ? 'Adjust lifecycle, source, or search to widen the results list.'
        : 'Ticket deliverables and run artifacts will land here once agents produce work.',
  );

  function handleFilterChange(key: string, value: string) {
    if (key === 'lifecycle') lifecycle = value;
    if (key === 'source') source = value;
  }

  function resetFilters() {
    query = '';
    lifecycle = '';
    source = '';
  }
</script>

<section data-slot="results-grid" class={cn('min-w-0 space-y-4', className)}>
  <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <h2 class="text-base font-semibold">Results</h2>
      <p class="text-sm text-muted-foreground">Deliverables and artifacts the selected Space has produced.</p>
    </div>
    <CountBadge count={filteredResults.length} label={filteredResults.length === 1 ? 'result' : 'results'} tone="primary" />
  </div>

  <FilterBar
    {query}
    searchLabel="Search results"
    searchPlaceholder="Search results"
    filters={filterDefinitions}
    resultCount={isLoading ? undefined : filteredResults.length}
    state={isLoading ? 'loading' : 'populated'}
    onQueryChange={(value) => (query = value)}
    onFilterChange={handleFilterChange}
    onReset={resetFilters}
  />

  <DataState
    state={dataState}
    {error}
    emptyTitle={emptyTitle}
    emptyDescription={emptyDescription}
    emptyIcon={requiresSpace ? 'search' : 'inbox'}
    loadingTitle="Loading results"
    loadingDescription="Fetching ticket deliverables and run artifacts."
    errorTitle="Results unavailable"
    errorFallback="Results could not be loaded."
    retryLabel="Retry"
    onRetry={onRetry}
  >
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Results">
      {#each filteredResults as result (result.id)}
        <ResultCard {result} {spaceId} {nowMs} />
      {/each}
    </div>
  </DataState>
</section>

<script lang="ts" module>
  export type LiveRunsFeedState = 'idle' | 'loading' | 'ready' | 'error';
</script>

<script lang="ts">
  import DataState, { type DataStateKind } from '$lib/components/DataState.svelte';
  import FilterBar, { type FilterDefinition } from '$lib/components/FilterBar.svelte';
  import CountBadge from '$lib/components/CountBadge.svelte';
  import { cn } from '$lib/utils.js';
  import RunRow from './RunRow.svelte';
  import {
    filterLiveRuns,
    liveBucketOptions,
    liveOwnerOptions,
    liveSourceOptions,
    type LiveRun,
  } from './live';

  let {
    runs = [],
    feedState = 'idle',
    error = null,
    requiresSpace = false,
    nowMs = Date.now(),
    onRetry,
    class: className,
  }: {
    runs?: LiveRun[];
    feedState?: LiveRunsFeedState;
    error?: unknown;
    requiresSpace?: boolean;
    nowMs?: number;
    onRetry?: () => void;
    class?: string;
  } = $props();

  let query = $state('');
  let source = $state('');
  let bucket = $state('');
  let owner = $state('');

  let filteredRuns = $derived(filterLiveRuns(runs, { query, source, bucket, owner }));
  let filterDefinitions = $derived([
    {
      key: 'source',
      label: 'source',
      value: source,
      options: liveSourceOptions(runs),
    },
    {
      key: 'bucket',
      label: 'state',
      value: bucket,
      options: liveBucketOptions(runs),
    },
    {
      key: 'owner',
      label: 'owner',
      value: owner,
      options: liveOwnerOptions(runs),
    },
  ] satisfies FilterDefinition[]);
  let isLoading = $derived(feedState === 'idle' || feedState === 'loading');
  let dataState = $derived(
    (isLoading
      ? 'loading'
      : feedState === 'error'
        ? 'error'
        : requiresSpace || filteredRuns.length === 0
          ? 'empty'
          : 'populated') as DataStateKind,
  );
  let emptyTitle = $derived(
    requiresSpace ? 'Select one space' : runs.length ? 'No live runs match these filters' : 'No live runs',
  );
  let emptyDescription = $derived(
    requiresSpace
      ? 'Live run reads are scoped to a concrete Space.'
      : runs.length
        ? 'Adjust source, state, owner, or search to widen the live run list.'
        : 'Loop runs, workflow runs, and agent tasks will appear here once work starts.',
  );

  function handleFilterChange(key: string, value: string) {
    if (key === 'source') source = value;
    if (key === 'bucket') bucket = value;
    if (key === 'owner') owner = value;
  }

  function resetFilters() {
    query = '';
    source = '';
    bucket = '';
    owner = '';
  }
</script>

<section data-slot="live-runs-feed" class={cn('min-w-0 space-y-4', className)}>
  <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <h2 class="text-base font-semibold">Live Runs</h2>
      <p class="text-sm text-muted-foreground">Loop evidence, graph executions, and agent work in one stream.</p>
    </div>
    <CountBadge count={filteredRuns.length} label={filteredRuns.length === 1 ? 'run' : 'runs'} tone="primary" />
  </div>

  <FilterBar
    {query}
    searchLabel="Search live runs"
    searchPlaceholder="Search runs"
    filters={filterDefinitions}
    resultCount={isLoading ? undefined : filteredRuns.length}
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
    loadingTitle="Loading live runs"
    loadingDescription="Fetching loop runs, workflow runs, and agent tasks."
    errorTitle="Live runs unavailable"
    errorFallback="Live runs could not be loaded."
    retryLabel="Retry"
    onRetry={onRetry}
  >
    <div class="grid gap-3" aria-label="Live runs">
      {#each filteredRuns as run (run.id)}
        <RunRow {run} {nowMs} />
      {/each}
    </div>
  </DataState>
</section>

<script lang="ts" module>
  export type ActivityFeedState = 'idle' | 'loading' | 'ready' | 'error';
</script>

<script lang="ts">
  import DataState, { type DataStateKind } from '$lib/components/DataState.svelte';
  import FilterBar, { type FilterDefinition } from '$lib/components/FilterBar.svelte';
  import CountBadge from '$lib/components/CountBadge.svelte';
  import { cn } from '$lib/utils.js';
  import type { NullHubEvent } from '$lib/api/client';
  import EventRow from './EventRow.svelte';
  import {
    activityAgentOptions,
    activityLevelOptions,
    activityPeriodOptions,
    activitySourceOptions,
    filterActivityEvents,
    type ActivityPeriod,
  } from './activity';

  let {
    events = [],
    feedState = 'idle',
    error = null,
    nowMs = Date.now(),
    onRetry,
    class: className,
  }: {
    events?: NullHubEvent[];
    feedState?: ActivityFeedState;
    error?: unknown;
    nowMs?: number;
    onRetry?: () => void;
    class?: string;
  } = $props();

  let query = $state('');
  let source = $state('');
  let level = $state('');
  let agent = $state('');
  let period = $state<ActivityPeriod>('all');

  let filteredEvents = $derived(
    filterActivityEvents(events, { query, source, level, agent, period }, nowMs),
  );

  let filterDefinitions = $derived([
    {
      key: 'source',
      label: 'source',
      value: source,
      options: activitySourceOptions(events),
    },
    {
      key: 'level',
      label: 'level',
      value: level,
      options: activityLevelOptions(events),
    },
    {
      key: 'agent',
      label: 'agent',
      value: agent,
      options: activityAgentOptions(events),
    },
    {
      key: 'period',
      label: 'period',
      value: period === 'all' ? '' : period,
      options: activityPeriodOptions,
    },
  ] satisfies FilterDefinition[]);

  let isLoading = $derived(feedState === 'idle' || feedState === 'loading');
  let dataState = $derived(
    (isLoading ? 'loading' : feedState === 'error' ? 'error' : filteredEvents.length ? 'populated' : 'empty') as DataStateKind,
  );
  let emptyTitle = $derived(events.length ? 'No activity matches these filters' : 'No activity events');
  let emptyDescription = $derived(
    events.length
      ? 'Adjust source, level, agent, period, or search to widen the chronicle.'
      : 'Space activity and evidence events will appear here once work starts.',
  );

  function handleFilterChange(key: string, value: string) {
    if (key === 'source') source = value;
    if (key === 'level') level = value;
    if (key === 'agent') agent = value;
    if (key === 'period') period = (value || 'all') as ActivityPeriod;
  }

  function resetFilters() {
    query = '';
    source = '';
    level = '';
    agent = '';
    period = 'all';
  }
</script>

<section data-slot="activity-feed" class={cn('min-w-0 space-y-4', className)}>
  <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <h2 class="text-base font-semibold">Events</h2>
      <p class="text-sm text-muted-foreground">Space chronicle for activity, evidence, and agent work.</p>
    </div>
    <CountBadge count={filteredEvents.length} label={filteredEvents.length === 1 ? 'event' : 'events'} tone="primary" />
  </div>

  <FilterBar
    {query}
    searchLabel="Search activity"
    searchPlaceholder="Search events"
    filters={filterDefinitions}
    resultCount={isLoading ? undefined : filteredEvents.length}
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
    emptyIcon="search"
    loadingTitle="Loading activity"
    loadingDescription="Fetching recent events for the selected Space."
    errorTitle="Activity unavailable"
    errorFallback="Events could not be loaded."
    retryLabel="Retry"
    onRetry={onRetry}
  >
    <div class="grid gap-3" aria-label="Activity events">
      {#each filteredEvents as event (event.id)}
        <EventRow {event} {nowMs} />
      {/each}
    </div>
  </DataState>
</section>
